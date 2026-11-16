// Мост скрытого окна записи.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recorderApi', {
  onStart: (cb) => ipcRenderer.on('recorder:start', (_e, opts) => cb(opts)),
  onStop: (cb) => ipcRenderer.on('recorder:stop', () => cb()),
  done: (buffer) => ipcRenderer.send('recorder:done', buffer),
  level: (value) => ipcRenderer.send('recorder:level', value),
  tooLong: () => ipcRenderer.send('recorder:too-long'),
});
