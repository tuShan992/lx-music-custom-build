# lx-music 自定义构建（独立项目）

独立于 lx-music-desktop 源码仓库，只做三件事：**拉上游源码 → 打补丁 → 编译打包**。
不 fork、不 vendor 源码，每次构建现场 `git clone` 对应 tag。构建时依赖上游源码（补丁改的是 `.vue`/`.json`/构建配置，必须在源码上编译），但不依赖任何一份本地 lx-music-desktop 检出。

## 目录内容

- `lx-music-changes.patch` — 对 lx-music-desktop 的全部源码改动
- `build-local.sh` — 本机（macOS）一键：拉最新 tag → 打补丁 → 打包
- `build-custom.yml` — GitHub Actions 版，一次出 mac/win/linux 安装包
- `gui/` — 图形界面版（Electron），双平台通用
- `run.sh` / `run.cmd` — 启动图形界面（macOS / Windows）

## 补丁新增的功能

`lx-music-changes.patch` 在官方版基础上加了下面这些功能（多语言文案已同步 zh-cn / zh-tw / en-us / ko-kr）：

**播放与下载**

- **播放详情页下载按钮**：底部控制栏新增下载按钮，已下载/下载中自动置灰；下载弹窗新增「使用默认位置」勾选，不勾选时可选保存目录（`DownloadModal.vue`、`ControlBtns.vue`）。
- **下载完成弹窗提示**：下载任务从「进行中」变为「已完成」时弹窗提示歌曲名（目前仅在播放详情页挂载期间生效）。
- **播放出错自动换源**：音频加载出错且当前用自定义源时，并行探测候选源、自动切换到能取到可播链接的源，命中即用；全部失败会尽快放弃并跳到下一首，避免长时间卡在「获取链接中」。可在「设置 · 播放」用「音频加载出错时自动切换自定义源」开关（默认开，`action.ts`、`parallel.ts`）。
- **下一首提前预取**：播放约 2 秒后即后台预取下一首链接，手动切歌命中缓存、明显更快；临近结束再做可播性校验（`usePreloadNextMusic.ts`）。

**列表操作**

- **全选 / 取消全选**：试听列表、歌单详情、排行榜、下载列表、在线列表的表头新增「全选」按钮，再点切换为「取消全选」。
- **定位当前播放**：列表右下角悬浮按钮，一键滚动到正在播放的歌曲并短暂高亮该行；歌单 / 排行榜 / 歌单详情页仅在开启「列表点击行为」时显示（`useLocateCurrentPlay.ts`、`LocatePlayBtn.vue`）。
  - 从本源列表播放时直接用播放索引定位，避免重复 id 定位到错误行。

**设置 · 自定义源**

- **删除全部**：自定义源弹窗标题栏新增「删除全部」，二次确认后清空；若当前正在使用自定义源，会自动回退到第一个可用音源。
- **音源延迟测试**：设置页「声音源」标题与自定义源弹窗新增「测试延迟」，按平均延迟排序展示各源「连通性」（上游域名探测）与「真实播放」（用当前歌曲实际取链接验证，需先播放一首歌），可直接切换到选中音源（`probe.ts`、`UserApiProbeModal.vue`）。
- **一键导入音源**：从 `pdone/lx-music-source` 拉取音源健康状态列表并勾选导入，支持「仅导入可用音源」「使用加速链接（GitHub 访问受限时）」；导入按 作者+名字+版本 去重并报告「新增 / 更新 / 跳过」（同名同作者的新版本会覆盖更新，正在使用则立即生效）；导入后自动探测并切换到最稳定的可用源，同时提示清理已失效音源（单次导入后总数上限 20，`UserApiOneClickImportModal.vue`）。

**构建相关**

- **Electron 下载源可配置**：`build-config/build-pack.js` 支持 `LX_ELECTRON_MIRROR`（下载镜像）与 `LX_ELECTRON_DIST`（本地 electron 发行目录，离线构建），本项目的 GUI / CI 已用镜像加速。
- **样式**：新增定位高亮动画 `.lx-locate-highlight`（`assets/styles/index.less`）。

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
