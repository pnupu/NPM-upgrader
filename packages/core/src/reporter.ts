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
  const runDir = path.join(projectRoot, '.upgrade', 'runs', rec.sessionId);
  fs.mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, 'run.json');
  fs.writeFileSync(file, JSON.stringify(rec, null, 2));
  return file;
}

export function writeTargetArtifact(projectRoot: string, sessionId: string, target: unknown): string {
  const runDir = path.join(projectRoot, '.upgrade', 'runs', sessionId);
  fs.mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, 'target.json');
  fs.writeFileSync(file, JSON.stringify(target, null, 2));
  return file;
}

export function writePlanArtifact(projectRoot: string, sessionId: string, plan: unknown): string {
  const runDir = path.join(projectRoot, '.upgrade', 'runs', sessionId);
  fs.mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, 'plan.json');
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  return file;
}

export function writeChangesArtifact(projectRoot: string, sessionId: string, changes: Array<{ file: string; before: string; after: string }>): string[] {
  const base = path.join(projectRoot, '.upgrade', 'runs', sessionId, 'changes');
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

// Step-scoped writers to group a whole run under one timestamp directory
export function writeStepRunRecord(projectRoot: string, sessionId: string, step: number, rec: Omit<RunRecord, 'sessionId'>): string {
  const stepDir = path.join(projectRoot, '.upgrade', 'runs', sessionId, 'steps', String(step));
  fs.mkdirSync(stepDir, { recursive: true });
  const file = path.join(stepDir, 'run.json');
  fs.writeFileSync(file, JSON.stringify({ ...rec }, null, 2));
  return file;
}

export function writeStepTargetArtifact(projectRoot: string, sessionId: string, step: number, target: unknown): string {
  const stepDir = path.join(projectRoot, '.upgrade', 'runs', sessionId, 'steps', String(step));
  fs.mkdirSync(stepDir, { recursive: true });
  const file = path.join(stepDir, 'target.json');
  fs.writeFileSync(file, JSON.stringify(target, null, 2));
  return file;
}

export function writeStepPlanArtifact(projectRoot: string, sessionId: string, step: number, plan: unknown): string {
  const stepDir = path.join(projectRoot, '.upgrade', 'runs', sessionId, 'steps', String(step));
  fs.mkdirSync(stepDir, { recursive: true });
  const file = path.join(stepDir, 'plan.json');
  fs.writeFileSync(file, JSON.stringify(plan, null, 2));
  return file;
}

export function writeStepChangesArtifact(projectRoot: string, sessionId: string, step: number, changes: Array<{ file: string; before: string; after: string }>): string[] {
  const base = path.join(projectRoot, '.upgrade', 'runs', sessionId, 'steps', String(step), 'changes');
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

export function writeStepFileRunRecord(
  projectRoot: string,
  sessionId: string,
  step: number,
  fileAbsPath: string,
  data: unknown
): string {
  const rel = relPathSafe(projectRoot, fileAbsPath);
  const dir = path.join(projectRoot, '.upgrade', 'runs', sessionId, 'steps', String(step), 'files', rel);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'run.json');
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
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


