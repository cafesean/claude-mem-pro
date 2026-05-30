#!/usr/bin/env bash
# One-time rename: plugin identity claude-mem -> mem-pro (KEEP data dir ~/.claude-mem).
# Deterministic byte-level edits (safe under flaky editor reads). Idempotent-ish.
#
# Scope (what changes):
#   - identity name:  root package.json + .claude-plugin/marketplace.json  -> mem-pro
#   - cache path:     cache/cafesean/claude-mem -> cache/cafesean/mem-pro
#                     (hooks.json, codex-hooks.json, .mcp.json, src/servers/mcp-server.ts)
#   - enabled gate:   claude-mem@cafesean -> mem-pro@cafesean
#                     (plugin-state.ts, install.ts, uninstall.ts, CodexCliInstaller.ts, bun-runner.js)
#   - pluginName field in plugin-state.ts -> mem-pro
# NOT touched: ~/.claude-mem data dir, CLAUDE_MEM_* env vars, marketplaces/cafesean (marketplace name).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "repo: $(pwd)"

bak() { cp "$1" "$1.rename-bak"; }

# 1. identity name — root package.json (only the top-level "name": "claude-mem")
bak package.json
sed -i '' 's/"name": "claude-mem"/"name": "mem-pro"/' package.json

# 2. marketplace.json plugins[].name
bak .claude-plugin/marketplace.json
sed -i '' 's/"name": "claude-mem"/"name": "mem-pro"/' .claude-plugin/marketplace.json

# 3. cache path token (covers cache/cafesean/claude-mem AND .codex/.../cafesean/claude-mem)
for f in plugin/hooks/hooks.json plugin/hooks/codex-hooks.json plugin/.mcp.json src/servers/mcp-server.ts; do
  [ -f "$f" ] && { bak "$f"; sed -i '' 's#cafesean/claude-mem#cafesean/mem-pro#g' "$f"; }
done

# 4. enabled-gate key
for f in src/shared/plugin-state.ts src/npx-cli/commands/install.ts src/npx-cli/commands/uninstall.ts src/services/integrations/CodexCliInstaller.ts plugin/scripts/bun-runner.js; do
  [ -f "$f" ] && { bak "$f"; sed -i '' "s/claude-mem@cafesean/mem-pro@cafesean/g" "$f"; }
done

# 5. pluginName identity field in plugin-state.ts
sed -i '' "s/pluginName: 'claude-mem'/pluginName: 'mem-pro'/" src/shared/plugin-state.ts

echo "=== VERIFY: remaining identity 'claude-mem' that should be GONE ==="
echo "gate keys left (expect 0): $(grep -rl 'claude-mem@cafesean' src plugin/scripts/bun-runner.js 2>/dev/null | wc -l | tr -d ' ')"
echo "cafesean/claude-mem cache paths left (expect 0): $(grep -rl 'cafesean/claude-mem' plugin src/servers/mcp-server.ts 2>/dev/null | wc -l | tr -d ' ')"
echo "package name: $(grep -m1 '"name"' package.json)"
echo "marketplace plugin name: $(grep -A1 '"plugins"' .claude-plugin/marketplace.json | grep name || true)"
echo "=== VERIFY: data dir untouched (expect .claude-mem present) ==="
grep -c "'.claude-mem'\|\"\\.claude-mem\"\|join(homedir(), '.claude-mem')" src/shared/paths.ts || true
echo "DONE — now: npm run build, then user runs /plugin uninstall + install mem-pro"
