import fs from 'node:fs';
import type { Op, Plan } from '@junction-agents/shared';
import {
  applyChanges,
  renameJsxTag,
  removeJsxProp,
  convertJsxPropComponentToElement,
  editImportRename
} from '@junction-agents/tools-ts';

export function computePlanChanges(plan: Plan): { file: string; before: string; after: string }[] {
  // Group ops by file and compose edits per file to avoid preimage mismatches
  const opsByFile = new Map<string, typeof plan.ops>();
  for (const op of plan.ops || []) {
    if ('file' in op) {
      const list = opsByFile.get((op as any).file) || [];
      list.push(op);
      opsByFile.set((op as any).file, list);
    }
  }
  const changes: { file: string; before: string; after: string }[] = [];
  for (const [file, ops] of opsByFile.entries()) {
    if (!fs.existsSync(file)) {
      // Skip ops for files that do not exist
      continue;
    }
    let before = fs.readFileSync(file, 'utf8');
    let after = before;
    for (const op of ops) {
      switch (op.kind) {
        case 'RENAME_JSX_TAG': {
          after = renameJsxTag(after, (op as any).from, (op as any).to);
          break;
        }
        case 'REMOVE_JSX_PROP': {
          after = removeJsxProp(after, (op as any).tag, (op as any).prop);
          break;
        }
        case 'CONVERT_COMPONENT_PROP_TO_ELEMENT': {
          after = convertJsxPropComponentToElement(after, (op as any).tag, (op as any).fromProp, (op as any).toProp);
          break;
        }
        case 'EDIT_IMPORT': {
          after = editImportRename(after, (op as any).to.module, (op as any).from?.named || '', (op as any).to?.named || '');
          break;
        }
        default:
          break;
      }
    }
    if (after !== before) {
      changes.push({ file, before, after });
    }
  }
  return changes;
}

export function applyPlan(plan: Plan): { filesTouched: number } {
  const changes = computePlanChanges(plan);
  if (changes.length) applyChanges(changes);
  return { filesTouched: new Set(changes.map(c => c.file)).size };
}

export function applyFileChanges(changes: { file: string; before: string; after: string }[]): void {
  if (changes.length) applyChanges(changes);
}

export function revertFileChanges(changes: { file: string; before: string; after: string }[]): void {
  for (const ch of changes) {
    fs.writeFileSync(ch.file, ch.before, 'utf8');
  }
}

export function summarizePlanFiles(plan: Plan): string[] {
  const files = new Set<string>();
  for (const op of plan.ops || []) {
    if ((op as any).file) files.add((op as any).file);
    if ((op as any).files) for (const f of (op as any).files) files.add(f);
  }
  return Array.from(files);
}



