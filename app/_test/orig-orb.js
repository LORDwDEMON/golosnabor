// Опыт: можно ли взять страницу оригинала (индикатор) целиком.
// Загружаем настоящий index.html из распакованной сборки Type, подсовываем
// заглушку window.electronAPI и смотрим, отрисуется ли овал.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PAGE = 'C:\\Users\\DIMAS\\AppData\\Local\\Temp\\craft-anything-extract-18d4203b27402c1f\\src\\dist\\index.html';
const OUT = 'F:\\ВОССОЗДАНИЕ_ПРИЛОЖЕНИЯ_Type_ГолосНабор\\evidence\\оригинал-страница-опыт.png';
const LOG = path.join(os.tmpdir(), 'orig-orb.log');

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
  win.webContents.on('render-process-gone', (_e, details) => log('[падение] ' + JSON.stringify(details)));
  win.webContents.on('preload-error', (_e, p, err) => log('[preload] ' + p + ': ' + err.message));

  try {
    await win.loadFile(PAGE);
    log('страница загружена');
  } catch (err) {
    log('ошибка загрузки: ' + err.message);
  }

  await new Promise((r) => setTimeout(r, 6000));

  try {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(OUT, image.toPNG());
    log('снимок сохранён: ' + OUT);
  } catch (err) {
    log('снимок не удался: ' + err.message);
  }

  const text = await win.webContents.executeJavaScript('document.body ? document.body.innerText.slice(0, 300) : "нет body"').catch(() => 'не прочитать');
  log('текст страницы: ' + JSON.stringify(text));

  log('готово');
  app.quit();
});
