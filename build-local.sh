#!/usr/bin/env bash
# 从上游最新 tag 拉源码 -> 打本地补丁 -> 构建 -> 产物落到 ./out
#
# 用法:
#   ./build-local.sh                 # 取最新 tag，打包 macOS (pack:mac)
#   ./build-local.sh v2.12.6         # 指定上游 tag
#   ./build-local.sh v2.12.6 pack:win:setup:x64   # 指定打包脚本
#
# 注意: 安装包必须和目标系统一致 —— macOS 上只能打 dmg，
#       Windows 用 pack:win:setup:x64（Windows 机器），Linux 用 pack:linux:appImage（Linux 机器）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PATCH="$ROOT/lx-music-changes.patch"
UPSTREAM="https://github.com/lyswhut/lx-music-desktop.git"
TAG="${1:-}"
PACK="${2:-pack:mac}"
OUT="$ROOT/out"

[ -f "$PATCH" ] || { echo "找不到补丁: $PATCH"; exit 1; }

if [ -z "$TAG" ]; then
  # 不用 head 截断：pipefail 下会让上游 git 因 SIGPIPE 让脚本直接退出
  TAG="$(git ls-remote --tags --sort=-v:refname "$UPSTREAM" | sed -n 's#.*refs/tags/\(.*\)$#\1#p' | grep -v '\^{}' | sed -n '1p')"
fi
echo "==> 上游版本: $TAG"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone --depth 1 -b "$TAG" "$UPSTREAM" "$WORK/app"
cd "$WORK/app"

echo "==> 应用补丁"
if git apply --check "$PATCH" 2>/dev/null; then
  git apply "$PATCH"
else
  echo "   直接 apply 不干净（上游有改动），改用 patch --fuzz"
  patch -p1 --forward --fuzz=3 < "$PATCH"
fi

echo "==> 安装依赖 (npm ci)"
npm ci

echo "==> 编译源码 (npm run build)"
npm run build

echo "==> 打包 ($PACK)"
npm run "$PACK"

mkdir -p "$OUT"
shopt -s nullglob
cp -v build/*.dmg build/*.exe build/*.AppImage "$OUT"/ 2>/dev/null || true
echo "==> 完成，产物在: $OUT"
ls -lh "$OUT" 2>/dev/null || true
