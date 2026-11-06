const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('buildApi', {
  getTags: () => ipcRenderer.invoke('get-tags'),
  listPatches: () => ipcRenderer.invoke('list-patches'),
  hasSource: () => ipcRenderer.invoke('has-source'),
  fetchSource: (tag) => ipcRenderer.invoke('fetch-source', tag),
  applyBuild: (opts) => ipcRenderer.invoke('apply-build', opts),
  openOut: () => ipcRenderer.invoke('open-out'),
  onLog: (cb) => ipcRenderer.on('log', (_e, line) => cb(line)),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
})
