const $ = (s) => document.querySelector(s)
const logEl = $('#log')
const statusEl = $('#status')
const tagEl = $('#tag')
const patchEl = $('#patches')
const barEl = $('#progressBar')
const pctEl = $('#progressText')

function setProgress(pct, label = '') {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  barEl.style.width = p + '%'
  pctEl.textContent = label ? `${p}% · ${label}` : `${p}%`
}

function appendLog(line) {
  logEl.textContent += line + '\n'
  logEl.scrollTop = logEl.scrollHeight
}
function setStatus(msg, cls = '') {
  statusEl.textContent = msg
  statusEl.className = cls
}
function setBusy(b) {
  for (const id of ['#fetch', '#run', '#refresh']) $(id).disabled = b
}

async function loadTags() {
  tagEl.innerHTML = '<option>加载中…</option>'
  const tags = await window.buildApi.getTags()
  tagEl.innerHTML = ''
  if (!tags.length) { tagEl.innerHTML = '<option>获取失败</option>'; return }
  for (const t of tags) {
    const o = document.createElement('option')
    o.value = t
    o.textContent = t
    tagEl.appendChild(o)
  }
}

async function loadPatches() {
  patchEl.innerHTML = ''
  const patches = await window.buildApi.listPatches()
  if (!patches.length) { patchEl.textContent = '（custom-build 目录下没有 .patch 文件）'; return }
  for (const p of patches) {
    const label = document.createElement('label')
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.value = p
    cb.checked = true
    cb.style.marginRight = '8px'
    label.appendChild(cb)
    label.appendChild(document.createTextNode(p))
    patchEl.appendChild(label)
  }
}

$('#refresh').onclick = loadTags

async function doFetch() {
  const tag = tagEl.value
  if (!tag) return
  setBusy(true)
  setStatus('正在获取源码 ' + tag + ' …')
  const r = await window.buildApi.fetchSource(tag)
  setBusy(false)
  setStatus(r.ok ? '源码已就绪：' + r.dir : '获取失败：' + (r.error || ''), r.ok ? 'ok' : 'err')
}

$('#fetch').onclick = doFetch

$('#run').onclick = async () => {
  const patches = [...patchEl.querySelectorAll('input:checked')].map((c) => c.value)
  if (!patches.length) { setStatus('请至少选择一个补丁', 'err'); return }
  const pack = $('#pack').value
  setBusy(true)
  setStatus('构建中，请稍候…')
  setProgress(0, '开始')
  const r = await window.buildApi.applyBuild({ patches, pack })
  setBusy(false)
  if (r.ok) {
    setProgress(100, '完成')
    const note = r.fallback ? '（dmg 受限，已改出 zip）' : ''
    setStatus('构建完成' + note + '，产物：' + (r.files || []).join(', ') + '（在 out 目录）', 'ok')
  } else {
    setStatus('失败：' + (r.error || ''), 'err')
  }
}

$('#open').onclick = () => window.buildApi.openOut()

window.buildApi.onLog(appendLog)
window.buildApi.onProgress(({ pct, label }) => setProgress(pct, label))
;(async () => {
  loadPatches()
  const tagsPromise = loadTags()
  if (await window.buildApi.hasSource()) {
    setStatus('源码已就绪，勾选补丁后点「应用补丁并构建」', 'ok')
  } else {
    // 首次打开：拿到版本列表后自动从 GitHub 拉取最新源码
    await tagsPromise
    await doFetch()
  }
})()
