// Заглушка API оригинала. Запоминает подписки по именам каналов, чтобы можно было
// подтолкнуть приложение событиями (например, «start-dictation») и посмотреть,
// отрисуется ли их собственный индикатор.
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
          const now = (listeners.get(channel) || []).filter((cb) => cb !== callback);
          listeners.set(channel, now);
        };
      };
    }
    if (key === 'getLanguage') return async () => 'ru';
    if (key === 'getSettings') return async () => ({
      activationMode: 'push',
      hotkey: 'Capslock',
      uiLanguage: 'ru',
      theme: 'dark',
      preferBuiltInMic: true,
    });
    if (key === 'getActivationMode') return async () => 'push';
    if (key === 'isSystemAudioAccessGranted') return async () => true;
    if (key === 'checkSystemAudioAccess') return async () => ({ granted: true });
    return async () => null;
  },
  has() { return true; },
});

try {
  window.electronAPI = api;
  window.__emit = (channel, ...args) => {
    const list = listeners.get(channel) || [];
    for (const cb of list) {
      try { cb(...args); } catch (err) { console.error('ошибка обработчика ' + channel + ': ' + err.message); }
    }
    return list.length;
  };
  window.__channels = () => Array.from(listeners.keys());
} catch (err) {
  console.error('заглушка не установлена: ' + err.message);
}
