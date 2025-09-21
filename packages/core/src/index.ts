import { runTsc } from '@junction-agents/diagnostics';
import fs from 'node:fs';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Plan, Diagnostic } from '@junction-agents/shared';
import { RuleRegistry, planWithRules } from '@junction-agents/rules';
import { planWithLlm, type LlmPlannerConfig } from './llmPlanner.js';
import { computePlanChanges, applyFileChanges, revertFileChanges } from './executor.js';
import { writePlanArtifact, writeChangesArtifact, writeTargetArtifact, writeStepPlanArtifact, writeStepChangesArtifact, writeStepTargetArtifact, writeRunRecord, writeStepRunRecord, writeStepFileRunRecord } from './reporter.js';
import { docsSearch } from './docsSearch.js';

export interface AgentConfig {
  projectRoot: string;
  maxBatches?: number;
}

export interface RunResult {
  before: { count: number };
  plan: Plan;
  applied: boolean;
  after?: { count: number };
}

export function agentPlan(config: AgentConfig, registry: RuleRegistry): Plan {
  const diags = runTsc(config.projectRoot).diagnostics;
  const files: string[] = listTsFiles(config.projectRoot);
  return planWithRules({ projectRoot: config.projectRoot, files, diagnostics: diags }, registry);
}

export function agentRunOnce(config: AgentConfig, registry: RuleRegistry, applyFn: (plan: Plan) => void, debugSessionId?: string): RunResult {
  const before = runTsc(config.projectRoot);
  const files: string[] = listTsFiles(config.projectRoot);
  const plan = planWithRules({ projectRoot: config.projectRoot, files, diagnostics: before.diagnostics }, registry);
  if (debugSessionId) writePlanArtifact(config.projectRoot, debugSessionId, plan);
  if (!plan.ops.length) return { before: { count: before.count }, plan, applied: false };
  // Apply with rollback if acceptance fails
  const changes = computePlanChanges(plan);
  if (debugSessionId) writeChangesArtifact(config.projectRoot, debugSessionId, changes);
  applyFileChanges(changes);
  const after = runTsc(config.projectRoot);
  const beforeCodes = new Set(before.diagnostics.map(d => d.code));
  const afterCodes = new Set(after.diagnostics.map(d => d.code));
  let noNewCodes = true;
  for (const c of afterCodes) { if (!beforeCodes.has(c)) { noNewCodes = false; break; } }
  const applied = after.count <= before.count && noNewCodes;
  if (!applied) {
    revertFileChanges(changes);
  }
  return { before: { count: before.count }, plan, applied, after: { count: after.count } };
}

export function agentPlanLlm(config: AgentConfig, llm: LlmPlannerConfig): Promise<Plan> {
  const diags = runTsc(config.projectRoot).diagnostics;
  const files: string[] = listTsFiles(config.projectRoot);
  return planWithLlm(diags, files, llm);
}

export async function agentRunOnceLlm(config: AgentConfig, llm: LlmPlannerConfig, applyFn: (plan: Plan) => void, debugSessionId?: string): Promise<RunResult> {
  const before = runTsc(config.projectRoot);
  const files: string[] = listTsFiles(config.projectRoot);
  const plan = await planWithLlm(before.diagnostics, files, llm);
  if (debugSessionId) writePlanArtifact(config.projectRoot, debugSessionId, plan);
  if (!plan.ops?.length) return { before: { count: before.count }, plan, applied: false };
  const changes = computePlanChanges(plan);
  if (debugSessionId) writeChangesArtifact(config.projectRoot, debugSessionId, changes);
  applyFileChanges(changes);
  const after = runTsc(config.projectRoot);
  const beforeCodes = new Set(before.diagnostics.map(d => d.code));
  const afterCodes = new Set(after.diagnostics.map(d => d.code));
  let noNewCodes = true;
  for (const c of afterCodes) { if (!beforeCodes.has(c)) { noNewCodes = false; break; } }
  const applied = after.count <= before.count && noNewCodes;
  if (!applied) {
    revertFileChanges(changes);
  }
  return { before: { count: before.count }, plan, applied, after: { count: after.count } };
}

function listTsFiles(projectRoot: string): string[] {
  const root = path.join(projectRoot, 'src');
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const d = stack.pop()!;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'build', 'coverage'].includes(entry.name)) continue;
        stack.push(p);
      } else if (entry.isFile() && (p.endsWith('.ts') || p.endsWith('.tsx'))) {
        out.push(p);
      }
    }
  }
  return out;
}

function safeSnippet(file: string, span: { start: number; end: number } | undefined, radius: number): string {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    if (!span) return txt.slice(0, radius);
    const start = Math.max(0, span.start - radius);
    const end = Math.min(txt.length, span.end + radius);
    return txt.slice(start, end);
  } catch {
    return '';
  }
}

function safeReadHead(file: string, limit: number): string {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return txt.slice(0, limit);
  } catch {
    return '';
  }
}

export * from './executor.js';
export * from './reporter.js';
export * from './llmPlanner.js';

// Focused Error Loop (FEL) orchestrator used by CLI `run`
export async function runFocused(config: { projectRoot: string; maxSteps?: number; planner?: LlmPlannerConfig; debug?: boolean }) {
  const projectRoot = config.projectRoot;
  const maxSteps = Math.max(1, Number(config.maxSteps ?? 5));
  let steps = 0;
  let lastCount = Number.POSITIVE_INFINITY;
  const sessionId = formatTimestamp(new Date());
  if (config.debug) writeRunRecord(projectRoot, { sessionId, timestamp: new Date().toISOString(), before: { count: runTsc(projectRoot).count }, filesTouched: 0 });
  while (steps < maxSteps) {
    steps++;
    const before = runTsc(projectRoot);
    if (before.count === 0) break;
    // Select a target: first diagnostic for now (MVP)
    const target = before.diagnostics[0];
    if (config.debug) writeStepTargetArtifact(projectRoot, sessionId, steps, { target });
    // Capture target context
    const head = safeReadHead(target.file, 600);
    const snippet = safeSnippet(target.file, target.span, 400);
    const focusText = extractFocusText(target.file, target.span);
    const guidance = docsSearch(projectRoot, snippet);
    // Plan using LLM with target-aware context
    const plan = await planWithLlm(
      before.diagnostics,
      listTsFiles(projectRoot),
      {
        provider: (config.planner as any)?.provider || 'openai',
        model: (config.planner as any)?.model || 'gpt-4o-mini',
        context: { target, targetSnippet: snippet, focusText, importsHead: head, guidance }
      }
    );
    if (config.debug) writeStepPlanArtifact(projectRoot, sessionId, steps, plan);
    if (!plan.ops?.length) {
      break;
    }
    const changes = computePlanChanges(plan);
    if (config.debug) writeStepChangesArtifact(projectRoot, sessionId, steps, changes);
    // Per-file acceptance
    let baseline = before;
    const allowedNewCodes = new Set<number>([2304, 2305, 2322, 2307, 2582]);
    const applyResults: Array<{ file: string; accepted: boolean; beforeCount: number; afterCount: number; deltaTarget: number }> = [];
    for (const ch of changes) {
      // write change to disk for this file only
      fs.writeFileSync(ch.file, ch.after, 'utf8');
      // syntax/compile guard: quick tsc
      const afterOne = runTsc(projectRoot);
      // target delta scoped to code+file
      const matches = (d: { code: number; file: string }) => (x: any) => x.code === d.code && x.file === d.file;
      const beforeTargetCount = baseline.diagnostics.filter(matches(target)).length;
      const afterTargetCount = afterOne.diagnostics.filter(matches(target)).length;
      const deltaTarget = afterTargetCount - beforeTargetCount;
      const beforeCodes = new Set(baseline.diagnostics.map(d => d.code));
      const afterCodes = new Set(afterOne.diagnostics.map(d => d.code));
      let newCodesOk = true;
      for (const c of afterCodes) {
        if (!beforeCodes.has(c) && !allowedNewCodes.has(c)) { newCodesOk = false; break; }
      }
      const beforeFileCount = baseline.diagnostics.filter(d => d.file === ch.file).length;
      const afterFileCount = afterOne.diagnostics.filter(d => d.file === ch.file).length;
      const acceptFile = (deltaTarget < 0 && newCodesOk) || (afterFileCount <= beforeFileCount && newCodesOk);
      applyResults.push({ file: ch.file, accepted: acceptFile, beforeCount: beforeFileCount, afterCount: afterFileCount, deltaTarget });
      if (!acceptFile) {
        // revert just this file
        fs.writeFileSync(ch.file, ch.before, 'utf8');
      } else {
        // update baseline for next file
        baseline = afterOne;
      }
      if (config.debug) writeStepFileRunRecord(projectRoot, sessionId, steps, ch.file, { accepted: acceptFile, beforeFileCount, afterFileCount, deltaTarget });
    }
    const finalAfter = baseline;
    const deltaTargetStep = finalAfter.count - before.count;
    console.log(`Step ${steps}: filesAccepted=${applyResults.filter(r=>r.accepted).length}/${changes.length} Before=${before.count} After=${finalAfter.count}`);
    if (config.debug) writeStepRunRecord(projectRoot, sessionId, steps, { sessionId, timestamp: new Date().toISOString(), before: { count: before.count }, after: { count: finalAfter.count }, filesTouched: applyResults.filter(r=>r.accepted).length, files: applyResults } as any);
    if (finalAfter.count === lastCount) break;
    lastCount = finalAfter.count;
  }
}

function formatTimestamp(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
}

function extractFocusText(file: string, span: { start: number; end: number } | undefined): string | undefined {
  try {
    if (!span) return undefined;
    const txt = fs.readFileSync(file, 'utf8');
    const slice = txt.slice(span.start, span.end).trim();
    return slice && slice.length <= 200 ? slice : undefined;
  } catch {
    return undefined;
  }
}

function extractGuidanceFromDocs(root: string, hint: string): { bullets: string[]; citations: Array<{ title: string; url?: string; quote: string }> } | undefined {
  try {
    const p = path.join(root, '..', 'docs', 'MigrationGuide.md');
    const txt = readFileSync(p, 'utf8');
    const key = /RouteComponentProps|withRouter|useHistory|useNavigate|useLocation|Switch|Redirect|Navigate/;
    const m = key.exec(hint) || key.exec(txt);
    const bullets: string[] = [];
    const cites: Array<{ title: string; url?: string; quote: string }> = [];
    if (m) {
      const idx = txt.indexOf(m[0]);
      const start = Math.max(0, idx - 500);
      const end = Math.min(txt.length, idx + 500);
      const excerpt = txt.slice(start, end);
      for (const sentence of excerpt.split(/[\.!?]\s+/).slice(0, 5)) {
        const s = sentence.trim();
        if (s.length > 20) bullets.push(s);
      }
      cites.push({ title: 'MigrationGuide.md', quote: excerpt.trim() });
      return { bullets, citations: cites };
    }
  } catch {}
  return undefined;
}

