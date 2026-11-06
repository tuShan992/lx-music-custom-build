# lx-music 自定义构建（独立项目）

独立于 lx-music-desktop 源码仓库，只做三件事：**拉上游源码 → 打补丁 → 编译打包**。
不 fork、不 vendor 源码，每次构建现场 `git clone` 对应 tag。构建时依赖上游源码（补丁改的是 `.vue`/`.json`/构建配置，必须在源码上编译），但不依赖任何一份本地 lx-music-desktop 检出。

## 目录内容

- `lx-music-changes.patch` — 对 lx-music-desktop 的全部源码改动
- `build-local.sh` — 本机（macOS）一键：拉最新 tag → 打补丁 → 打包
- `build-custom.yml` — GitHub Actions 版，一次出 mac/win/linux 安装包
- `gui/` — 图形界面版（Electron），双平台通用
- `run.sh` / `run.cmd` — 启动图形界面（macOS / Windows）

## 本地用

```bash
./build-local.sh                 # 最新 tag + macOS dmg
./build-local.sh v2.12.6         # 指定版本
```

产物在 `out/`。

## 图形界面（双平台）

- macOS：`./run.sh`（复用 `work/app` 里已装的 electron）
- Windows：双击 `run.cmd`，或命令行 `run.cmd`（首次会自动在 `gui/` 里装 electron；需先装 Node.js 22+ 与 Git for Windows）

界面里选版本 → 获取源码 → 勾选补丁 → 选打包目标 → 构建。**Windows 的 exe 必须在 Windows 上打**（不能跨平台），macOS 的 dmg 只能在 macOS 上打。

## 升级后补丁冲突怎么办

脚本先尝试 `git apply`，不干净时自动回退：界面版用 `git apply -C1`（跨平台），命令行 `build-local.sh` 用 `patch -p1 --fuzz=3`。上游改了你补丁里同样那几行时仍会报冲突并停下，
到临时克隆目录里手动改好，再按下方「重新生成补丁」重新导出 patch。

## 重新生成补丁

在干净的上游源码上覆盖你改过的源码，导出 diff：

```bash
TMP=$(mktemp -d)
git clone --depth 1 -b v2.12.6 https://github.com/lyswhut/lx-music-desktop.git "$TMP/base"
rsync -a --exclude=.git --exclude=node_modules --exclude=dist --exclude=build \
      --exclude=out --exclude='*.patch' \
      /path/to/你改过的 lx-music-desktop/ "$TMP/base"/
cd "$TMP/base"
git checkout HEAD -- package-lock.json   # lockfile 差异通常是本机 npm 版本造成，不带进补丁
git add -A
git diff --cached --binary > /path/to/lx-music-custom-build/lx-music-changes.patch
```

## 注意

- 安装包**未签名**：自己用右键打开即可；分发给别人会被 Gatekeeper / SmartScreen 拦。
- LX Music 自带「软件更新」检查，可能提示/下载官方新版，装了补丁后会丢。建议在设置里关掉更新检查。
- 用 release tag，不要用 master。
