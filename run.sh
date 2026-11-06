#!/usr/bin/env bash
# 一键启动「LX Music 自定义构建」界面
# 复用 work/app 里已装的 electron；把下载缓存指回项目内并走镜像兜底，避免从 GitHub 现下卡死
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
ELECTRON_DIR="$ROOT/work/app/node_modules/electron"
[ -f "$ELECTRON_DIR/cli.js" ] || { echo "缺少 electron：先跑一次 ./build-local.sh 或 npm ci" >&2; exit 1; }
export electron_config_cache="$ROOT/.home/Library/Caches/electron"
export ELECTRON_CACHE="$ROOT/.home/Library/Caches/electron"
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
exec node "$ELECTRON_DIR/cli.js" "$ROOT/gui"
