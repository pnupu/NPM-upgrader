import type { Diagnostic, Plan } from '@junction-agents/shared';

// Example rule: if TS2305 (missing export) for Switch/Redirect from react-router-dom show a placeholder plan
export const simpleRule = {
  id: 'example:no-op',
  targets(diags: Diagnostic[]) {
    return diags.length > 0;
  },
  propose(): Plan {
    return { targetCodes: [], ops: [], why: ['example rule - no ops'], confidence: 0.5 };
  }
};


