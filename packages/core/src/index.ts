import { runTsc } from '@junction-agents/diagnostics';
import fs from 'node:fs';
import path from 'node:path';
import type { Plan, Diagnostic } from '@junction-agents/shared';
import { RuleRegistry, planWithRules } from '@junction-agents/rules';
import { planWithLlm, type LlmPlannerConfig } from './llmPlanner.js';
import { computePlanChanges, applyFileChanges, revertFileChanges } from './executor.js';
import { writePlanArtifact, writeChangesArtifact } from './reporter.js';

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

export * from './executor.js';
export * from './reporter.js';
export * from './llmPlanner.js';

