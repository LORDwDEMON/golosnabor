// Посредник для страницы оригинала.
// Страница Type ждёт window.electronAPI с сотнями методов. Здесь — заглушка,
// которая запоминает подписки по именам каналов, и приём наших событий:
// главный процесс присылает 'orig:send' с именем канала (start-dictation и т.п.).
const { ipcRenderer } = require('electron');

const listeners = new Map();

function channelFromMethod(name) {
  return name
    .replace(/^on/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

const api = new Proxy({}, {
  get(_target, key) {
    if (typeof key !== 'string') return undefined;
    if (key.startsWith('on')) {
      const channel = channelFromMethod(key);
      return (callback) => {
        const list = listeners.get(channel) || [];
        list.push(callback);
        listeners.set(channel, list);
        return () => {
          listeners.set(channel, (listeners.get(channel) || []).filter((cb) => cb !== callback));
        };
      };
    }
    if (key === 'getLanguage') return async () => 'ru';
    if (key === 'getActivationMode') return async () => 'push';
    if (key === 'checkSystemAudioAccess') return async () => ({ granted: true });
    if (key === 'isSystemAudioAccessGranted') return async () => true;
    if (key === 'getSettings') {
      return async () => ({
        activationMode: 'push',
        hotkey: 'ScrollLock',
        uiLanguage: 'ru',
        theme: 'dark',
        preferBuiltInMic: true,
      });
    }
    return async () => null;
  },
  has() { return true; },
});

window.electronAPI = api;

window.__emit = (channel, ...args) => {
  const list = listeners.get(channel) || [];
  for (const cb of list) {
    try {
      cb(...args);
    } catch (err) {
      console.error('ошибка обработчика ' + channel + ': ' + err.message);
    }
  }
  return list.length;
};

ipcRenderer.on('orig:send', (_event, channel, ...args) => {
  window.__emit(channel, ...args);
});
