import type { Diagnostic, Op, Plan } from '@junction-agents/shared';

export interface RuleContext {
  projectRoot: string;
  files: string[];
  diagnostics: Diagnostic[];
}

export interface Rule {
  id: string;
  targets(diagnostics: Diagnostic[]): boolean;
  propose(ctx: RuleContext): Plan;
}

export class RuleRegistry {
  private rules: Rule[] = [];
  register(rule: Rule) { this.rules.push(rule); }
  list(): Rule[] { return this.rules.slice(); }
}

export function planWithRules(ctx: RuleContext, registry: RuleRegistry): Plan {
  const active = registry.list().filter(r => r.targets(ctx.diagnostics));
  const plans = active.map(r => r.propose(ctx));
  // naive merge: concatenate ops and codes
  const ops = plans.flatMap(p => p.ops);
  const targetCodes = Array.from(new Set(plans.flatMap(p => p.targetCodes)));
  const why = plans.flatMap(p => p.why);
  return { targetCodes, ops, why, confidence: Math.min(1, plans.reduce((a, p) => a + (p.confidence ?? 0.5), 0)) };
}

export { simpleRule } from './simple-rule.js';


