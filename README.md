## npm-upgrader

This repo contains a small, general migration assistant that makes safe, incremental changes to a codebase by fixing one target at a time. The `router-demo` app is used as a testbed (React Router v5 → v6), but the loop and tooling are generic.

### How it works (high level)
- Diagnose → select a single target diagnostic → plan a minimal change → apply → compile → accept or revert.
- Acceptance is per file (not all-or-nothing): files that improve the target or don’t regress are kept; others are reverted.
- The loop writes detailed artifacts for each step so you can audit exactly what happened.

### Key features
- Target-centric planning: the planner gets the selected diagnostic, a focused code snippet, and optional guidance from docs.
- Per-file acceptance: each file’s change is compiled, checked, and accepted/reverted independently.
- Syntax/compile guard: a change that breaks syntax or introduces disallowed new error codes is reverted for that file only.
- Human‑readable run folders with step and per-file artifacts.

### Supported edit operations
- `EDIT_IMPORT` – rename named imports in-place.
- `RENAME_JSX_TAG` – e.g., `Switch` → `Routes`, `Redirect` → `Navigate`.
- `REMOVE_JSX_PROP` – e.g., remove `exact` from `<Route>`.
- `CONVERT_COMPONENT_PROP_TO_ELEMENT` – `component={X}` → `element={<X />}`.
- `EDIT_TEXT_SMALL` – minimal, span-anchored text replacements.
- `REWRITE_CALL` – rename a callee or insert/drop/wrap args for function calls (not JSX).
- `FORMAT_AND_ORGANIZE` – light-weight reprint/organize.

### Artifacts & logs
- Runs live under `router-demo/.upgrade/runs/<YYYY-MM-DD_HH-MM-SS>/`.
- Top‑level: `run.json` (run header).
- Per step: `steps/<n>/`
  - `target.json` – selected diagnostic for this step.
  - `plan.json` – planned ops.
  - `changes/manifest.json` – files with before/after snapshots.
  - `files/<rel-path>/run.json` – per‑file acceptance outcome (accepted/reverted, delta info).
  - `run.json` – step summary (filesAccepted/total, before/after counts).

### Demo driver (router-demo)
Use the script to build, reset, and run locally:

```bash
# Build the workspace packages
scripts/run-demo.sh build-cli

# Reset only router-demo/src to the committed state (keeps logs & caches)
scripts/run-demo.sh reset-src

# Run the focused loop with debug artifacts (preserves .upgrade across resets and installs deps)
scripts/run-demo.sh run-debug
```

Notes:
- The debug driver preserves existing `.upgrade` logs across resets and names runs using human‑readable timestamps.
- Lint is disabled inside `router-demo` to avoid noise during iterative changes.

### Focused acceptance (what “counts as progress”)
For each changed file in a step:
- We write the change, compile, and compute:
  - Δtarget: change in count for the selected diagnostic’s code+file (optionally using the target span window).
  - Δfile: total diagnostics in this file.
  - newCodes: new error codes introduced.
- We accept the file if either:
  - Δtarget < 0 and newCodes are in a small allowlist; or
  - Δfile ≤ 0 and newCodes are allowed.
- Otherwise we revert just that file. The baseline updates after each accepted file.

### Planner inputs
The LLM planner receives:
- The selected diagnostic (code, file, message) and a focused snippet (imports + surrounding lines).
- Optional guidance extracted from `docs/MigrationGuide.md`.
- Strict op constraints and domain recipes (e.g., for React Router: Switch→Routes, Redirect→Navigate, component→element, history→navigate).

### Shaping the demo for deterministic progress
We keep the v5 demo simple so the tools can converge:
- Use `Switch/Route/Redirect`, no render‑prop routes.
- `withRouter` + `useHistory` in Nav; `useHistory.push` in Login.
- A simple `ProtectedRoute` for v5 is acceptable; the loop will later replace it with a v6‑friendly pattern.

### Troubleshooting
- tsc not found: ensure `npm ci` has been run in `router-demo` (the debug driver does this automatically).
- No artifacts: confirm you used `--debug` or the `run-debug` script.
- Only some files changed: expected; per‑file acceptance keeps safe files and reverts risky ones.

### Development commands (workspace)
```bash
# Build all packages
pnpm -w -r run build

# Run the CLI directly (example)
node apps/cli/dist/index.js run --project router-demo --debug
```

### Status
MVP complete: per‑file acceptance, syntax guard, target‑aware planning, docs‑backed guidance, readable run logs. Future work: stronger deterministic transforms, richer DocsSearch, and broader domain recipes.


