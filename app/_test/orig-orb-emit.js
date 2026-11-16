// Опыт 3: подталкиваем страницу оригинала событием «start-dictation»
// и смотрим, появится ли их собственный овал (canvas + шейдер).
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const URL = 'http://127.0.0.1:8791/index.html';
const OUT = 'F:\\ВОССОЗДАНИЕ_ПРИЛОЖЕНИЯ_Type_ГолосНабор\\evidence\\оригинал-страница-запись.png';
const LOG = path.join(os.tmpdir(), 'orig-orb-emit.log');

function log(line) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + line + '\n'); } catch { /* не критично */ }
}

app.whenReady().then(async () => {
  try { fs.rmSync(LOG, { force: true }); } catch { /* нет файла */ }

  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    log('[разрешение] ' + permission);
    cb(permission === 'media');
  });

  const win = new BrowserWindow({
    width: 168,
    height: 119,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'orig-orb-stub.js'),
      backgroundThrottling: false,
    },
  });

  win.webContents.on('console-message', (_e, ...rest) => {
    const d = rest[0] && typeof rest[0] === 'object' ? rest[0] : null;
    const text = d ? d.message : rest.join(' | ');
    if (!String(text).includes('Content Security Policy')) log('[консоль] ' + text);
  });

  await win.loadURL(URL);
  await new Promise((r) => setTimeout(r, 4000));

  const channels = await win.webContents.executeJavaScript('window.__channels ? window.__channels() : []').catch(() => []);
  log('подписки, зарегистрированные страницей: ' + JSON.stringify(channels));

  const count = await win.webContents.executeJavaScript('window.__emit ? window.__emit("start-dictation") : -1').catch((e) => 'ошибка: ' + e.message);
  log('обработчиков start-dictation вызвано: ' + count);

  await new Promise((r) => setTimeout(r, 3000));

  const state = await win.webContents.executeJavaScript(`(() => {
    const root = document.getElementById('root');
    return JSON.stringify({ canvases: document.querySelectorAll('canvas').length, rootChildren: root ? root.children.length : -1, snippet: root ? root.innerHTML.slice(0, 240) : '' });
  })()`).catch((e) => 'ошибка: ' + e.message);
  log('состояние после события: ' + state);

  const image = await win.webContents.capturePage();
  fs.writeFileSync(OUT, image.toPNG());
  log('снимок: ' + OUT);

  log('готово');
  app.quit();
});
