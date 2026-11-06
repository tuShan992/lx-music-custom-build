const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

// 某些受限环境（沙箱/无 GPU）下 Chromium 会崩溃，这里显式关掉硬件加速与沙箱
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')

// custom-build 目录（本文件在 custom-build/gui/ 下）
const ROOT = path.resolve(__dirname, '..')
const WORK = path.join(ROOT, 'work')
const APP_DIR = path.join(WORK, 'app')
const OUT = path.join(ROOT, 'out')
const UPSTREAM = 'https://github.com/lyswhut/lx-music-desktop.git'

// 本机 ~/.npm 里有 root 所有文件会导致 npm EPERM，这里把所有缓存指到工作区内的可写目录
const CACHE_ROOT = path.join(ROOT, '.cache')
const HOME_DIR = path.join(ROOT, '.home')
const IS_WIN = process.platform === 'win32'
// 真实用户主目录：Windows 没有 HOME，用 USERPROFILE；Git Bash 下 HOME 是 msys 路径，也优先 USERPROFILE 给 git 读
const REAL_HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const CHILD_ENV = {
  ...process.env,
  // macOS 沙箱只允许写工作区：把 HOME 与各类缓存指回工作区，避免 .npm/.electron-gyp/electron-builder 写到外面。Windows 无此限制，保持默认。
  ...(IS_WIN ? {} : { HOME: HOME_DIR }),
  // 让 git 始终读用户真实全局配置（代理、身份都在 ~/.gitconfig）。macOS 上 HOME 被改到 .home 后 git 读不到，故显式指定。
  GIT_CONFIG_GLOBAL: path.join(REAL_HOME, '.gitconfig'),
  npm_config_cache: path.join(CACHE_ROOT, 'npm'),
  ELECTRON_CACHE: path.join(CACHE_ROOT, 'electron'),
  electron_config_cache: path.join(CACHE_ROOT, 'electron'),
  ELECTRON_BUILDER_CACHE: path.join(CACHE_ROOT, 'electron-builder'),
  XDG_CACHE_HOME: path.join(CACHE_ROOT, 'xdg'),
  // 访问 GitHub release 受限，electron / electron-builder 二进制改走 npmmirror 镜像
  LX_ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
}

let win = null
let progressNudge = null
const log = (line) => { if (win && !win.isDestroyed()) win.webContents.send('log', line) }
const progress = (pct, label) => { if (win && !win.isDestroyed()) win.webContents.send('progress', { pct, label }) }

function stream(cmd, args, cwd, opts = {}) {
  return new Promise((resolve) => {
    log('$ ' + [cmd, ...args].join(' '))
    const p = spawn(cmd, args, { cwd, env: CHILD_ENV, ...opts })
    const emit = (d) => String(d).split(/\r?\n/).forEach((l) => {
      if (!l) return
      log(l)
      const m = /progress=(\d+)%/.exec(l)
      if (m && progressNudge) progressNudge(Number(m[1]))
    })
    p.stdout.on('data', emit)
    p.stderr.on('data', emit)
    p.on('error', (e) => { log('!! ' + e.message); resolve(1) })
    p.on('close', (code) => resolve(code ?? 1))
  })
}

// Windows 上 npm 是 npm.cmd，Node 直接 spawn 会 EINVAL，必须经 shell；git 等其它命令仍直连（shell 下带空格路径会被拆坏）
const streamNpm = (args, cwd) => stream('npm', args, cwd, IS_WIN ? { shell: true } : {})

function capture(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    let buf = ''
    const p = spawn(cmd, args, { env: CHILD_ENV })
    const timer = setTimeout(() => { try { p.kill('SIGKILL') } catch {} resolve(buf) }, timeout)
    p.stdout.on('data', (d) => { buf += d })
    p.on('error', () => { clearTimeout(timer); resolve('') })
    p.on('close', () => { clearTimeout(timer); resolve(buf) })
  })
}

async function listTags() {
  const out = await capture('git', ['ls-remote', '--tags', '--sort=-v:refname', UPSTREAM])
  return out.split('\n')
    .map((l) => (l.split('\t')[1] || '').trim())
    .filter((r) => r && !r.endsWith('^{}'))
    .map((r) => r.replace('refs/tags/', ''))
}

async function applyPatch(file) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) { log('!! 找不到补丁 ' + p); return 1 }
  if (await stream('git', ['apply', '--check', p], APP_DIR) === 0) return stream('git', ['apply', p], APP_DIR)
  // 直接应用不干净：减少上下文行数再试。跨平台、不依赖 patch/bash。
  // ponytail: -C1 只是近似 fuzz；上游改到补丁同一行仍会失败，届时手动改好再重导补丁。
  log('   直接 apply 不干净，改用 git apply -C1（减少上下文重试）')
  return stream('git', ['apply', '-C1', p], APP_DIR)
}

function copyArtifacts() {
  fs.mkdirSync(OUT, { recursive: true })
  const buildDir = path.join(APP_DIR, 'build')
  if (!fs.existsSync(buildDir)) return []
  const names = fs.readdirSync(buildDir).filter((f) => /\.(dmg|exe|AppImage)$/i.test(f))
  for (const f of names) fs.copyFileSync(path.join(buildDir, f), path.join(OUT, f))
  return names
}

ipcMain.handle('get-tags', async () => { try { return await listTags() } catch { return [] } })

ipcMain.handle('list-patches', () => {
  try { return fs.readdirSync(ROOT).filter((f) => f.endsWith('.patch')).sort() } catch { return [] }
})

ipcMain.handle('has-source', () => fs.existsSync(path.join(APP_DIR, 'package.json')))

ipcMain.handle('fetch-source', async (_e, tag) => {
  if (!tag) return { ok: false, error: '未选择版本' }
  fs.rmSync(APP_DIR, { recursive: true, force: true })
  fs.mkdirSync(WORK, { recursive: true })
  const code = await stream('git', ['clone', '--depth', '1', '-b', tag, UPSTREAM, APP_DIR], ROOT)
  return code === 0 ? { ok: true, dir: APP_DIR } : { ok: false, error: 'git clone 失败' }
})

ipcMain.handle('apply-build', async (_e, { patches, pack }) => {
  if (!fs.existsSync(APP_DIR)) return { ok: false, error: '请先获取源码' }
  if (!patches || patches.length === 0) return { ok: false, error: '未选择补丁' }
  // 每次构建前把源码恢复到干净状态，避免上次失败残留导致补丁重复应用
  await stream('git', ['reset', '--hard', 'HEAD'], APP_DIR)
  await stream('git', ['clean', '-fd'], APP_DIR)
  for (const name of patches) {
    const code = await applyPatch(name)
    if (code !== 0) { log('!! 补丁应用失败: ' + name); return { ok: false, error: '补丁冲突: ' + name } }
  }
  progress(12, '安装依赖')
  progressNudge = (n) => progress(12 + n * 0.16, '安装依赖')
  let code = await streamNpm(['ci'], APP_DIR)
  if (code !== 0) return { ok: false, error: 'npm ci 失败' }
  progressNudge = null
  progress(28, '编译')
  progressNudge = (n) => progress(28 + n * 0.3, '编译')
  code = await streamNpm(['run', 'build'], APP_DIR)
  if (code !== 0) return { ok: false, error: '构建失败' }
  progressNudge = null
  progress(58, '打包')
  if (pack === 'pack:mac') {
    // 分别构建 x64 / arm64，避免 x64 dmg 失败导致 arm64 完全不执行
    const files = []
    let fallback = false
    for (const [i, [arch, script]] of [['x64', 'pack:mac:dmg'], ['arm64', 'pack:mac:dmg:arm64']].entries()) {
      const base = 58 + i * 20
      progress(base, '打包 ' + arch)
      progressNudge = (n) => progress(base + n * 0.18, '打包 ' + arch)
      const c = await streamNpm(['run', script], APP_DIR)
      progressNudge = null
      if (c === 0) { files.push(...copyArtifacts()) }
      else {
        const zip = await zipAppBundle(arch)
        if (!zip) return { ok: false, error: arch + ' 打包失败' }
        log('!! ' + arch + ' dmg 打包失败（hdiutil 受限），已回退生成 zip: ' + zip)
        files.push(zip); fallback = true
      }
      progress(base + 18, '打包 ' + arch + ' 完成')
    }
    progress(100, '完成')
    return { ok: true, out: OUT, files: [...new Set(files)], fallback }
  }
  progressNudge = (n) => progress(58 + n * 0.4, '打包')
  const code2 = await streamNpm(['run', pack], APP_DIR)
  progressNudge = null
  if (code2 !== 0) {
    const arch = pack.includes('arm64') ? 'arm64' : 'x64'
    const zip = await zipAppBundle(arch)
    if (!zip) return { ok: false, error: '打包失败' }
    log('!! dmg 打包失败（hdiutil 受限），已回退生成 zip: ' + zip)
    progress(100, '完成')
    return { ok: true, out: OUT, files: [zip], fallback: true }
  }
  progress(100, '完成')
  return { ok: true, out: OUT, files: copyArtifacts() }
})

// 把某个架构的 build/mac[-arch]/*.app 用 ditto 打成 zip（不依赖 hdiutil）
async function zipAppBundle(arch = 'x64') {
  const buildDir = path.join(APP_DIR, 'build')
  if (!fs.existsSync(buildDir)) return null
  const dirs = fs.readdirSync(buildDir).filter((f) => f.startsWith('mac') && fs.statSync(path.join(buildDir, f)).isDirectory())
  const prefer = dirs.find((d) => d.includes(arch)) ?? dirs[0]
  if (!prefer) return null
  const app = fs.readdirSync(path.join(buildDir, prefer)).find((f) => f.endsWith('.app'))
  if (!app) return null
  fs.mkdirSync(OUT, { recursive: true })
  let version = '0.0.0'
  try { version = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).version } catch {}
  const name = `lx-music-desktop-${version}-${arch}.zip`
  const code = await stream('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', path.join(buildDir, prefer, app), path.join(OUT, name)], APP_DIR)
  return code === 0 ? name : null
}

ipcMain.handle('open-out', async () => {
  if (!fs.existsSync(OUT)) return { ok: false }
  await shell.openPath(OUT)
  return { ok: true }
})

function createWindow() {
  win = new BrowserWindow({
    width: 960,
    height: 720,
    title: 'LX Music 自定义构建',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile(path.join(__dirname, 'index.html'))
  win.on('closed', () => { win = null })
}

app.whenReady().then(() => {
  for (const d of [HOME_DIR, path.join(CACHE_ROOT, 'npm'), path.join(CACHE_ROOT, 'electron'), path.join(CACHE_ROOT, 'electron-builder'), path.join(CACHE_ROOT, 'xdg')]) fs.mkdirSync(d, { recursive: true })
  createWindow()
})
app.on('window-all-closed', () => app.quit())
