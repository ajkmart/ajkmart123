#!/bin/bash
set -e
pnpm install --no-frozen-lockfile

# Re-create .bin symlinks that pnpm's virtual store doesn't hoist automatically.
# This is needed so workflow commands can find vite, drizzle-kit, expo, etc.

WORKSPACE="/home/runner/workspace"

# ── vite (v7 from catalog) ────────────────────────────────────────────────────
VITE_PKG=$(ls -d "$WORKSPACE/node_modules/.pnpm/vite@7."* 2>/dev/null | head -1)
if [ -n "$VITE_PKG" ]; then
  VITE_BIN="$VITE_PKG/node_modules/vite/bin/vite.js"
  for dir in "$WORKSPACE" "$WORKSPACE/artifacts/admin" "$WORKSPACE/artifacts/rider-app" "$WORKSPACE/artifacts/vendor-app"; do
    mkdir -p "$dir/node_modules/.bin"
    ln -sf "$VITE_BIN" "$dir/node_modules/.bin/vite"
    chmod +x "$dir/node_modules/.bin/vite"
  done
fi

# ── drizzle-kit ───────────────────────────────────────────────────────────────
DRIZZLE_PKG=$(ls -d "$WORKSPACE/node_modules/.pnpm/drizzle-kit@"* 2>/dev/null | head -1)
if [ -n "$DRIZZLE_PKG" ]; then
  DRIZZLE_BIN="$DRIZZLE_PKG/node_modules/drizzle-kit/bin.cjs"
  mkdir -p "$WORKSPACE/node_modules/.bin"
  ln -sf "$DRIZZLE_BIN" "$WORKSPACE/node_modules/.bin/drizzle-kit"
  chmod +x "$WORKSPACE/node_modules/.bin/drizzle-kit"
fi

# ── expo ─────────────────────────────────────────────────────────────────────
EXPO_PKG=$(ls -d "$WORKSPACE/node_modules/.pnpm/expo@"* 2>/dev/null | head -1)
if [ -n "$EXPO_PKG" ]; then
  EXPO_BIN="$EXPO_PKG/node_modules/expo/bin/cli"
  mkdir -p "$WORKSPACE/artifacts/ajkmart/node_modules/.bin"
  ln -sf "$EXPO_BIN" "$WORKSPACE/artifacts/ajkmart/node_modules/.bin/expo"
  chmod +x "$WORKSPACE/artifacts/ajkmart/node_modules/.bin/expo"
fi

echo "post-merge: binary symlinks created"
