#!/usr/bin/env bash
# Install the claude-mem-pro plugin into a Hermes agent.
# Mirrors openclaw/install.sh: ensure deps + worker, drop the plugin, enable it.
set -euo pipefail

REPO_URL="https://github.com/cafesean/claude-mem.git"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
PLUGIN_DST="${HERMES_HOME}/plugins/claude-mem-pro"
NON_INTERACTIVE="${1:-}"

log() { printf '  \033[36m›\033[0m %s\n' "$*"; }
err() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }

# 1. locate this repo (script lives in <repo>/hermes/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ ! -f "${REPO_ROOT}/plugin/scripts/worker-service.cjs" ]]; then
  err "worker-service.cjs not found under ${REPO_ROOT}/plugin/scripts — run 'npm run build' in the repo first."
  exit 1
fi

# 2. deps: bun (worker runtime). Don't hard-fail if already present.
if ! command -v bun >/dev/null 2>&1; then
  err "Bun not found. Install from https://bun.sh then re-run."
  exit 1
fi

# 3. start the worker if not already healthy
PORT="${CLAUDE_MEM_WORKER_PORT:-$((37700 + ($(id -u) % 100)))}"
if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  log "Worker already healthy on port ${PORT}."
else
  log "Starting claude-mem-pro worker on port ${PORT}…"
  nohup bun "${REPO_ROOT}/plugin/scripts/worker-service.cjs" start >>"${HERMES_HOME}/claude-mem-pro-worker.log" 2>&1 &
  for _ in $(seq 1 30); do
    curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1 && break
    sleep 1
  done
  if ! curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    err "Worker did not become healthy; check ${HERMES_HOME}/claude-mem-pro-worker.log"
  fi
fi

# 4. drop the plugin into ~/.hermes/plugins/claude-mem-pro/
log "Installing plugin to ${PLUGIN_DST}"
mkdir -p "${PLUGIN_DST}"
cp -R "${SCRIPT_DIR}/plugin/." "${PLUGIN_DST}/"

# 5. enable it (best-effort; user can also add to config)
if command -v hermes >/dev/null 2>&1; then
  hermes plugins enable claude-mem-pro >/dev/null 2>&1 || \
    log "Run 'hermes plugins enable claude-mem-pro' to activate."
else
  log "Hermes CLI not on PATH — add 'claude-mem-pro' to plugins.enabled in ${HERMES_HOME}/config.yaml"
fi

log "Done. Optional config in ${HERMES_HOME}/config.yaml:"
cat <<'EOF'
  claude_mem:
    worker_host: 127.0.0.1
    worker_port: <auto: 37700 + uid%100>
    project: hermes
EOF
