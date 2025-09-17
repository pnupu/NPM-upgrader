import fs from 'node:fs';
import path from 'node:path';

export interface RunRecord {
  sessionId: string;
  timestamp: string;
  before: { count: number };
  after?: { count: number };
  filesTouched: number;
}

export function writeRunRecord(projectRoot: string, rec: RunRecord): string {
  const dir = path.join(projectRoot, '.upgrade', 'runs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${rec.sessionId}.json`);
  fs.writeFileSync(file, JSON.stringify(rec, null, 2));
  return file;
}

export function writePlanArtifact(projectRoot: string, sessionId: string, plan: unknown): string {
  const dir = path.join(projectRoot, '.upgrade', 'runs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.plan.json`);
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  return file;
}

export function writeChangesArtifact(projectRoot: string, sessionId: string, changes: Array<{ file: string; before: string; after: string }>): string[] {
  const base = path.join(projectRoot, '.upgrade', 'runs', `${sessionId}.changes`);
  fs.mkdirSync(base, { recursive: true });
  const written: string[] = [];
  const manifest: Array<{ file: string; beforePath: string; afterPath: string }> = [];
  for (const ch of changes) {
    const rel = relPathSafe(projectRoot, ch.file);
    const beforePath = path.join(base, rel + '.before');
    const afterPath = path.join(base, rel + '.after');
    ensureParentDir(beforePath);
    ensureParentDir(afterPath);
    fs.writeFileSync(beforePath, ch.before);
    fs.writeFileSync(afterPath, ch.after);
    written.push(beforePath, afterPath);
    manifest.push({ file: rel, beforePath, afterPath });
  }
  const manifestPath = path.join(base, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  written.push(manifestPath);
  return written;
}

function relPathSafe(root: string, file: string): string {
  let rel = path.relative(root, file);
  rel = rel.replace(/\\/g, '/');
  return rel;
}

function ensureParentDir(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}


