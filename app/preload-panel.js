// Мост панели управления: только явно перечисленные действия.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('panel:get-state'),
  setSetting: (key, value) => ipcRenderer.invoke('panel:set-setting', key, value),
  toggle: () => ipcRenderer.invoke('panel:toggle'),
  history: () => ipcRenderer.invoke('panel:show-history'),
  openFolder: () => ipcRenderer.invoke('panel:open-folder'),
  onState: (cb) => ipcRenderer.on('panel:state', (_e, data) => cb(data)),
  onHistory: (cb) => ipcRenderer.on('panel:history', (_e, data) => cb(data)),
});
