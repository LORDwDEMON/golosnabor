// Опыт 2: страница оригинала по HTTP — проверяем, отрисуется ли овал.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const URL = 'http://127.0.0.1:8791/index.html';
const OUT = 'F:\\ВОССОЗДАНИЕ_ПРИЛОЖЕНИЯ_Type_ГолосНабор\\evidence\\оригинал-страница-опыт-http.png';
const LOG = path.join(os.tmpdir(), 'orig-orb-http.log');

function log(line) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + line + '\n'); } catch { /* не критично */ }
}

app.whenReady().then(async () => {
  try { fs.rmSync(LOG, { force: true }); } catch { /* нет файла */ }

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
    log('[консоль] ' + (d ? d.message : rest.join(' | ')));
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log('[не загрузилось] ' + code + ' ' + desc + ' ' + url));

  try {
    await win.loadURL(URL);
    log('страница загружена по HTTP');
  } catch (err) {
    log('ошибка загрузки: ' + err.message);
  }

  await new Promise((r) => setTimeout(r, 7000));

  try {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(OUT, image.toPNG());
    log('снимок: ' + OUT);
  } catch (err) {
    log('снимок не удался: ' + err.message);
  }

  const info = await win.webContents.executeJavaScript(`(() => {
    const root = document.getElementById('root');
    const canvases = document.querySelectorAll('canvas').length;
    return JSON.stringify({ rootChildren: root ? root.children.length : -1, canvases, html: root ? root.innerHTML.slice(0, 200) : '' });
  })()`).catch((e) => 'ошибка чтения: ' + e.message);
  log('состояние страницы: ' + info);

  log('готово');
  app.quit();
});
