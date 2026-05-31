#!/usr/bin/env bash
# One-time rename: plugin identity mem-pro -> claude-mem-pro (KEEP data dir ~/.claude-mem).
# Mirrors scripts/rename-to-mem-pro.sh. Deterministic byte-level edits. Run ONCE.
#
# Scope (what changes):
#   - identity name:  root package.json + .claude-plugin/marketplace.json  -> claude-mem-pro
#                     (the four plugin.json files re-sync from package.json on `npm run build`)
#   - cache path:     cache/cafesean/mem-pro -> cache/cafesean/claude-mem-pro
#                     (plugin/hooks/hooks.json, codex-hooks.json, plugin/.mcp.json,
#                      src/servers/mcp-server.ts, scripts/build-hooks.js guard)
#   - enabled gate:   mem-pro@cafesean -> claude-mem-pro@cafesean
#                     (plugin-state.ts, install.ts, uninstall.ts, bun-runner.js)
#   - codex legacy:   CodexCliInstaller keeps mem-pro@cafesean as a LEGACY id (cleanup) + new id
# NOT touched: ~/.claude-mem data dir, CLAUDE_MEM_* env vars, marketplaces/cafesean (marketplace name).
set -euo pipefail
cd "$(dirname "$0")/.."
echo "repo: $(pwd)"

bak() { cp "$1" "$1.cmp-rename-bak"; }

# 1. identity name — root package.json (only the top-level "name": "mem-pro")
bak package.json
sed -i '' 's/"name": "mem-pro"/"name": "claude-mem-pro"/' package.json

# 2. marketplace.json plugins[].name (top-level marketplace name stays "cafesean")
bak .claude-plugin/marketplace.json
sed -i '' 's/"name": "mem-pro"/"name": "claude-mem-pro"/' .claude-plugin/marketplace.json

# 3. cache path token (cafesean/mem-pro -> cafesean/claude-mem-pro)
for f in plugin/hooks/hooks.json plugin/hooks/codex-hooks.json plugin/.mcp.json src/servers/mcp-server.ts scripts/build-hooks.js; do
  [ -f "$f" ] && { bak "$f"; sed -i '' 's#cafesean/mem-pro#cafesean/claude-mem-pro#g' "$f"; }
done

# 4. enabled-gate key (mem-pro@cafesean -> claude-mem-pro@cafesean)
for f in src/shared/plugin-state.ts src/npx-cli/commands/install.ts src/npx-cli/commands/uninstall.ts plugin/scripts/bun-runner.js; do
  [ -f "$f" ] && { bak "$f"; sed -i '' "s/mem-pro@cafesean/claude-mem-pro@cafesean/g" "$f"; }
done

# 5. Codex installer: new primary id + keep old as LEGACY for cleanup of prior installs
bak src/services/integrations/CodexCliInstaller.ts
sed -i '' "s/const LEGACY_CODEX_PLUGIN_IDS = \['mem-pro@cafesean'\];/const LEGACY_CODEX_PLUGIN_IDS = ['claude-mem@cafesean', 'mem-pro@cafesean'];/" src/services/integrations/CodexCliInstaller.ts

echo "=== VERIFY: tokens that should be GONE (expect 0) ==="
echo "gate keys 'mem-pro@cafesean' left: $(grep -rl 'mem-pro@cafesean' src/shared src/npx-cli plugin/scripts/bun-runner.js 2>/dev/null | wc -l | tr -d ' ')  (CodexCliInstaller intentionally retains it as legacy)"
echo "cafesean/mem-pro cache paths left: $(grep -rl 'cafesean/mem-pro' plugin src/servers/mcp-server.ts scripts/build-hooks.js 2>/dev/null | wc -l | tr -d ' ')"
echo "package name: $(grep -m1 '\"name\"' package.json)"
echo "DONE — next: npm run build, then run tests, then /plugin uninstall + install claude-mem-pro@cafesean"
