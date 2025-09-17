import type { Plan, Diagnostic, Span } from '@junction-agents/shared';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import fs from 'node:fs';
import path from 'node:path';

export type LlmProvider = 'openai' | 'anthropic';

export interface LlmPlannerConfig {
  provider: LlmProvider;
  model: string;
  apiKey?: string; // or read from env
}

const SYSTEM_PROMPT = `You are a code migration planner.

Return a single JSON object (and nothing else). Do not include commentary, code fences, or markdown. The JSON MUST match this structure:
{
  "targetCodes": number[],         // Diagnostic codes you intend to address
  "why": string[],                 // Brief high-level rationale for your plan
  "confidence": number,            // 0..1 calibrated confidence in proposed edits
  "ops": Op[]                      // List of editing operations to perform
}

Op (only use these kinds exactly as specified):
- { "kind": "EDIT_IMPORT", "file": string, "from": {"module": string, "named"?: string, "alias"?: string}, "to": {"module": string, "named"?: string, "alias"?: string} }
- { "kind": "RENAME_JSX_TAG", "file": string, "from": string, "to": string }
- { "kind": "REMOVE_JSX_PROP", "file": string, "tag": string, "prop": string }
- { "kind": "CONVERT_COMPONENT_PROP_TO_ELEMENT", "file": string, "tag": string, "fromProp": string, "toProp": string }
- { "kind": "REWRITE_CALL", "file": string, "callee": {"name": string, "importFrom"?: string}, "edits": [{"op": "RENAME"|"INSERT_ARG"|"DROP_ARG"|"WRAP_ARG", "index"?: number, "value"?: unknown}] }
- { "kind": "FORMAT_AND_ORGANIZE", "files": string[] }

Planning constraints:
- Derive minimal, safe ops from the provided diagnostics and code snippets only.
- Prefer conservative edits that cannot worsen types or runtime behavior.
- If you are unsure, return an empty plan ("ops": []).
- Do not propose free-form diffs; only the exact Ops above are allowed.
 - When you rename a named import for a JSX component (e.g., Switch→Routes, Redirect→Navigate), you MUST also include a matching RENAME_JSX_TAG op on the same file so the JSX elements are updated to the new name.
`;

export async function planWithLlm(diags: Diagnostic[], files: string[], cfg: LlmPlannerConfig): Promise<Plan> {
  const model = cfg.provider === 'openai'
    ? new ChatOpenAI({ modelName: cfg.model, apiKey: cfg.apiKey || process.env.OPENAI_API_KEY })
    : new ChatAnthropic({ model: cfg.model, apiKey: cfg.apiKey || process.env.ANTHROPIC_API_KEY });

  const enriched = diags.slice(0, 40).map(d => ({
    code: d.code,
    message: d.message,
    file: d.file,
    moduleName: d.moduleName,
    snippet: safeSnippet(d.file, d.span, 400),
    importsHead: readHead(d.file, 800)
  }));
  const user = JSON.stringify({ diagnostics: enriched, files: files.slice(0, 100) });
  const res = await model.invoke([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: "Input (JSON):\n" + user + "\nReturn ONLY the JSON plan object, no markdown, no fences." }
  ] as any);
  const raw = (res as any).content?.[0]?.text ?? (res as any).content ?? '';
  const text = extractJson(raw);
  try {
    const plan = JSON.parse(text);
    return plan;
  } catch {
    return { targetCodes: [], ops: [], why: ['llm parse failure'], confidence: 0 };
  }
}

function safeSnippet(file: string, span: Span | undefined, radius: number): string {
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

function readHead(file: string, limit: number): string {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return txt.slice(0, limit);
  } catch {
    return '';
  }
}

function extractJson(s: string): string {
  const fence = /```json[\s\S]*?```/i.exec(s);
  if (fence) {
    return fence[0].replace(/```json/i, '').replace(/```$/, '').trim();
  }
  // fallback: try to find first { ... } block
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return s.slice(first, last + 1);
  }
  return s.trim();
}


