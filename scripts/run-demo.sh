#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEMO_DIR="$ROOT_DIR/router-demo"
CACHE_DIR="$DEMO_DIR/.cache"

V5_PKG="$CACHE_DIR/package-v5.json"
V6_PKG="$CACHE_DIR/package-v6.json"
V5_NM="$CACHE_DIR/node_modules-v5"
V6_NM="$CACHE_DIR/node_modules-v6"
V5_PNPM_LOCK="$CACHE_DIR/pnpm-lock-v5.yaml"
V6_PNPM_LOCK="$CACHE_DIR/pnpm-lock-v6.yaml"
V5_NPM_LOCK="$CACHE_DIR/package-lock-v5.json"
V6_NPM_LOCK="$CACHE_DIR/package-lock-v6.json"

CLI="node $ROOT_DIR/apps/cli/dist/index.js"

usage() {
  cat <<USAGE
Usage: $0 <command>

Commands:
  build-cli             Build the workspace CLI/packages
  prepare               Prepare and cache both v5 and v6 node_modules for router-demo
  prepare-v6            Prepare only v6 cache
  rebuild-v6            Delete and rebuild v6 cache from current state
  rebuild-v5            Delete and rebuild v5 cache from current state
  use v5|v6             Switch router-demo to cached v5 or v6 deps without reinstalling
  diag                  Run diagnose on router-demo
  apply-once            Run one agent cycle (plan/apply/diagnose) on router-demo
  run                   Run iterative agent loop (multiple cycles)
  run-debug             Run iterative loop with --debug artifacts
  reset-code            Reset router-demo working tree to committed state (keep caches)
  run-fresh             Reset code then run iterative loop

Examples:
  $0 build-cli
  $0 prepare
  $0 use v5 && $0 diag
  $0 use v6 && $0 apply-once
USAGE
}

build_cli() {
  (cd "$ROOT_DIR" && pnpm -r run build | cat)
}

ensure_cache_dir() {
  mkdir -p "$CACHE_DIR"
}

cache_state() {
  local label="$1" # v5 or v6
  ensure_cache_dir
  if [[ ! -d "$DEMO_DIR/node_modules" ]]; then
    echo "node_modules not found in router-demo; did install fail?" >&2
    exit 1
  fi
  cp "$DEMO_DIR/package.json" "$CACHE_DIR/package-$label.json"
  [[ -f "$DEMO_DIR/pnpm-lock.yaml" ]] && cp "$DEMO_DIR/pnpm-lock.yaml" "$CACHE_DIR/pnpm-lock-$label.yaml" || true
  [[ -f "$DEMO_DIR/package-lock.json" ]] && cp "$DEMO_DIR/package-lock.json" "$CACHE_DIR/package-lock-$label.json" || true
  rm -rf "$CACHE_DIR/node_modules-$label"
  cp -R "$DEMO_DIR/node_modules" "$CACHE_DIR/node_modules-$label"
}

prepare_v5() {
  echo "Preparing v5 cache..."
  $CLI deps:reset --project "$DEMO_DIR"
  (cd "$DEMO_DIR" && npm ci --silent | cat)
  cache_state v5
}

rebuild_v5() {
  echo "Rebuilding v5 cache..."
  ensure_cache_dir
  rm -rf "$CACHE_DIR/package-v5.json" "$CACHE_DIR/pnpm-lock-v5.yaml" "$CACHE_DIR/package-lock-v5.json" "$CACHE_DIR/node_modules-v5"
  prepare_v5
}

prepare_v6() {
  echo "Preparing v6 cache..."
  $CLI deps:upgrade --project "$DEMO_DIR"
  (cd "$DEMO_DIR" && npm ci --silent | cat)
  cache_state v6
}

rebuild_v6() {
  echo "Rebuilding v6 cache..."
  ensure_cache_dir
  rm -rf "$CACHE_DIR/package-v6.json" "$CACHE_DIR/pnpm-lock-v6.yaml" "$CACHE_DIR/package-lock-v6.json" "$CACHE_DIR/node_modules-v6"
  prepare_v6
}

restore_state() {
  local label="$1" # v5 or v6
  local pkg="$CACHE_DIR/package-$label.json"
  local nm="$CACHE_DIR/node_modules-$label"
  if [[ ! -f "$pkg" || ! -d "$nm" ]]; then
    echo "Cached $label state not found. Run: $0 prepare" >&2
    exit 1
  fi
  rm -rf "$DEMO_DIR/node_modules"
  cp "$pkg" "$DEMO_DIR/package.json"
  [[ -f "$CACHE_DIR/pnpm-lock-$label.yaml" ]] && cp "$CACHE_DIR/pnpm-lock-$label.yaml" "$DEMO_DIR/pnpm-lock.yaml" || true
  [[ -f "$CACHE_DIR/package-lock-$label.json" ]] && cp "$CACHE_DIR/package-lock-$label.json" "$DEMO_DIR/package-lock.json" || true
  cp -R "$nm" "$DEMO_DIR/node_modules"
  echo "Switched router-demo to $label deps from cache."
}

diag() {
  $CLI diagnose --project "$DEMO_DIR"
}

apply_once() {
  $CLI apply --project "$DEMO_DIR"
}

run_loop() {
  $CLI run --project "$DEMO_DIR"
}

run_loop_debug() {
  # Preserve existing .upgrade logs before reset
  SAVED_UPGRADE=""
  if [[ -d "$DEMO_DIR/.upgrade" ]]; then
    SAVED_UPGRADE="$(mktemp -d)"
    cp -R "$DEMO_DIR/.upgrade" "$SAVED_UPGRADE/.upgrade"
  fi

  reset_code

  # Restore .upgrade logs after reset
  if [[ -n "$SAVED_UPGRADE" && -d "$SAVED_UPGRADE/.upgrade" ]]; then
    mkdir -p "$DEMO_DIR"
    cp -R "$SAVED_UPGRADE/.upgrade" "$DEMO_DIR/.upgrade"
    rm -rf "$SAVED_UPGRADE"
  fi

  # Ensure dependencies for tsc are installed
  (cd "$DEMO_DIR" && npm ci --silent | cat)

  $CLI run --project "$DEMO_DIR" --debug
}

reset_code() {
  # Preserve local config/customizations
  TMP_DIR="$(mktemp -d)"
  for f in package.json eslint.config.js .eslintrc.cjs; do
    if [[ -f "$DEMO_DIR/$f" ]]; then
      cp "$DEMO_DIR/$f" "$TMP_DIR/$f"
    fi
  done

  # Restore tracked files
  git -C "$ROOT_DIR" restore --worktree --staged -- router-demo || true


  # Restore preserved configs
  for f in package.json eslint.config.js .eslintrc.cjs; do
    if [[ -f "$TMP_DIR/$f" ]]; then
      cp "$TMP_DIR/$f" "$DEMO_DIR/$f"
    fi
  done
  rm -rf "$TMP_DIR"
}

# Discard all changes in router-demo/src using git (tracked and untracked)
reset_src_only() {
  # Restore tracked files in src (unstage + overwrite worktree)
  git -C "$ROOT_DIR" restore --worktree --staged -- router-demo/src || true
  # Remove untracked files/dirs under src
  git -C "$ROOT_DIR" clean -fd -- router-demo/src || true
}

cmd="${1:-}"
case "$cmd" in
  build-cli)
    build_cli
    ;;
  prepare)
    build_cli
    prepare_v5
    prepare_v6
    ;;
  prepare-v6)
    build_cli
    prepare_v6
    ;;
  rebuild-v6)
    build_cli
    rebuild_v6
    ;;
  rebuild-v5)
    build_cli
    rebuild_v5
    ;;
  use)
    shift || true
    case "${1:-}" in
      v5) restore_state v5 ;;
      v6) restore_state v6 ;;
      *) echo "Specify v5 or v6" >&2; exit 1 ;;
    esac
    ;;
  diag)
    diag
    ;;
  apply-once)
    apply_once
    ;;
  run)
    run_loop
    ;;
  run-debug)
    run_loop_debug
    ;;
  reset-code)
    reset_code
    ;;
  reset-src)
    reset_src_only
    ;;
  run-fresh)
    reset_code
    run_loop
    ;;
  *)
    usage
    exit 1
    ;;
esac


