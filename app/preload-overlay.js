// Мост плавающего указателя: состояние и уровень звука.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayApi', {
  onState: (cb) => ipcRenderer.on('overlay:state', (_e, data) => cb(data)),
  onLevel: (cb) => ipcRenderer.on('overlay:level', (_e, level) => cb(level)),
});
