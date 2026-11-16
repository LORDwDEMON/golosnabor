// ГолосНабор — воссоздание приложения Type (OpenWhispr) по внешним признакам.
// Главный процесс: окна, значок в области уведомлений, горячая клавиша, диктовка.
// Речевой движок — свой (whisper.cpp на этой машине), модель и код исходного
// приложения не используются.

const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, clipboard, nativeImage, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { transcribe } = require('./lib/pipeline.cjs');
const store = require('./lib/store.cjs');
const origUiServer = require('./lib/orig-ui-server.cjs');
const localEngine = require('./lib/local-engine.cjs');

app.setAppUserModelId('ru.golosnabor.app');

let panelWin = null;
let overlayWin = null;
let recorderWin = null;
let tray = null;
let settings = null;
let hotkeyOk = false;
let busy = false;
let recording = false;
let origUiUrl = null;      // адрес страницы оригинала, если она нашлась
let engineServer = null;   // свой сервер распознавания из комплекта

const ASSETS = path.join(__dirname, 'assets');

// Отладочный журнал включается переменной GOLOSNABOR_DEBUG=1.
function debugLog(message) {
  if (!process.env.GOLOSNABOR_DEBUG) return;
  try {
    fs.appendFileSync(path.join(os.tmpdir(), 'golosnabor-debug.log'),
      new Date().toISOString() + ' ' + message + '\n');
  } catch { /* журнал не критичен */ }
}

// ── настройки по умолчанию ───────────────────────────────────────────────────
// Комплект переносимый: если рядом с приложением лежит папка engine\,
// берём движок оттуда, а не с путей этой машины. Тогда папку можно скопировать
// на другой компьютер и она заработает как есть.
const ENGINE_DIR = path.join(__dirname, '..', 'engine');
const LOCAL_ENGINE = {
  dir: ENGINE_DIR,
  bin: path.join(ENGINE_DIR, 'bin'),
  models: path.join(ENGINE_DIR, 'models'),
};

function localEnginePaths() {
  if (!fs.existsSync(ENGINE_DIR)) return null;
  // Выбираем модель: на слабом компьютере важнее скорость, поэтому компактная —
  // первой; большая берётся, только если компактной нет.
  const candidates = ['ggml-small-q5_1.bin', 'ggml-large-v3-turbo-q5_0.bin'];
  const dir = LOCAL_ENGINE.models;
  let model = candidates.map((n) => path.join(dir, n)).find((p) => fs.existsSync(p));
  if (!model && fs.existsSync(dir)) {
    const any = fs.readdirSync(dir).find((n) => n.endsWith('.bin'));
    if (any) model = path.join(dir, any);
  }
  if (!model) return null;
  const ffmpeg = path.join(LOCAL_ENGINE.bin, 'ffmpeg.exe');
  const cli = path.join(LOCAL_ENGINE.bin, 'whisper-cli.exe');
  return {
    ffmpegPath: fs.existsSync(ffmpeg) ? ffmpeg : 'ffmpeg',
    whisperCli: cli,
    whisperModel: model,
  };
}

// Движок распознавания не умеет открывать файлы по путям с кириллицей
// (проверено: падение при загрузке модели). Поэтому модель один раз копируется
// в служебную папку с латинским путём и берётся оттуда.
function asciiModelPath(sourceModel) {
  try {
    if (!fs.existsSync(sourceModel)) return sourceModel;
    const base = process.env.LOCALAPPDATA || os.tmpdir();
    const dir = path.join(base, 'GolosNabor', 'models');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, path.basename(sourceModel));
    const sourceSize = fs.statSync(sourceModel).size;
    const targetSize = fs.existsSync(target) ? fs.statSync(target).size : -1;
    if (targetSize !== sourceSize) {
      const started = Date.now();
      fs.copyFileSync(sourceModel, target);
      debugLog('модель скопирована в служебную папку за ' + (Date.now() - started) + ' мс: ' + target);
    }
    return target;
  } catch (err) {
    debugLog('не удалось подготовить модель: ' + err.message);
    return sourceModel;
  }
}

// Быстрая проверка: отвечает ли сервер распознавания по адресу.
async function probeServer(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

function readSettings() {
  const local = localEnginePaths();
  settings = store.loadSettings({
    hotkey: 'ScrollLock',
    dictationMode: 'hold', // toggle — нажал/отпустил; hold — удерживать (как в оригинале)
    language: 'ru',
    autoPaste: true,
    insertMode: 'type', // type — печать Unicode-событиями; paste — Ctrl+V из буфера
    darkTheme: false,
    sounds: true,
    maxSeconds: 60,
    ffmpegPath: local ? local.ffmpegPath : 'D:\\AETHER_V4\\DSH-Voice\\bin\\ffmpeg.exe',
    // Свой сервер поднимается при запуске; здесь — пусто, пока он не готов
    whisperUrl: local ? '' : 'http://127.0.0.1:8001',
    whisperCli: local ? local.whisperCli : 'D:\\AETHER_V4\\DSH-Voice\\bin\\whisper-cli.exe',
    whisperModel: local ? local.whisperModel : 'D:\\AETHER_V4\\DSH-Voice\\models\\ggml-large-v3-turbo-q5_0.bin',
  });
  // Пути движка из комплекта всегда главнее сохранённых: перенос на другой диск не ломает
  if (local) {
    settings.ffmpegPath = local.ffmpegPath;
    settings.whisperCli = local.whisperCli;
    settings.whisperModel = asciiModelPath(local.whisperModel);
  }
}


function persist(patch) {
  settings = store.saveSettings(patch);
  return settings;
}

// ── окна ─────────────────────────────────────────────────────────────────────
function createPanel() {
  panelWin = new BrowserWindow({
    width: 500,
    height: 589,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'ГолосНабор — панель управления',
    backgroundColor: '#F4F4F6',
    icon: path.join(ASSETS, 'app.png'),
    webPreferences: { preload: path.join(__dirname, 'preload-panel.js'), contextIsolation: true, nodeIntegration: false },
  });
  panelWin.loadFile('panel.html');
  panelWin.on('close', (e) => {
    // как у исходного приложения: окно прячется, программа живёт в области уведомлений
    if (!app.isQuitting) {
      e.preventDefault();
      panelWin.hide();
    }
  });
}

function createOverlay() {
  const useOrig = Boolean(origUiUrl);
  overlayWin = new BrowserWindow({
    width: 168,
    height: 119,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false, // не забирает фокус у программы, куда печатаем
    show: false,
    hasShadow: false,
    webPreferences: useOrig
      // Страница оригинала рассчитана на свой preload с contextIsolation: false
      ? { preload: path.join(__dirname, 'preload-orig.js'), contextIsolation: false, sandbox: false, backgroundThrottling: false }
      : { preload: path.join(__dirname, 'preload-overlay.js'), contextIsolation: true },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');

  if (useOrig) {
    overlayWin.setIgnoreMouseEvents(true);
    overlayWin.loadURL(origUiUrl).catch((err) => {
      debugLog('страница оригинала не загрузилась (' + err.message + '), берём свою');
      origUiUrl = null;
      overlayWin.loadFile('overlay.html');
    });
  } else {
    overlayWin.loadFile('overlay.html');
  }

  overlayWin.webContents.on('console-message', (_e, ...rest) => {
    const details = rest[0] && typeof rest[0] === 'object' ? rest[0] : null;
    const text = details ? (details.message || '') : rest.join(' | ');
    if (!String(text).includes('Content Security Policy')) debugLog('[указатель] ' + text);
  });
  overlayWin.webContents.on('render-process-gone', (_e, details) => {
    debugLog('[указатель] процесс отрисовки упал: ' + JSON.stringify(details));
    // Восстанавливаем окно указателя: без него не видно, что идёт запись
    setTimeout(() => {
      if (!overlayWin || overlayWin.isDestroyed()) return;
      try {
        if (origUiUrl) overlayWin.loadURL(origUiUrl); else overlayWin.loadFile('overlay.html');
        debugLog('[указатель] перезагружен после падения');
      } catch (err) {
        debugLog('[указатель] перезагрузить не удалось: ' + err.message);
      }
    }, 800);
  });
}

function createRecorder() {
  recorderWin = new BrowserWindow({
    width: 320,
    height: 120,
    show: false,
    skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-recorder.js'), contextIsolation: true },
  });
  recorderWin.loadFile('recorder.html');
}

function createTray() {
  const iconPath = path.join(ASSETS, 'tray.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('ГолосНабор');
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть панель управления', click: () => { panelWin.show(); panelWin.focus(); } },
    { label: 'Начать или закончить диктовку', click: () => toggleDictation() },
    { type: 'separator' },
    { label: `Горячая клавиша: ${settings.hotkey}`, enabled: false },
    { type: 'separator' },
    { label: 'Выход', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => { panelWin.show(); panelWin.focus(); });
}

// ── горячая клавиша ──────────────────────────────────────────────────────────
// Одиночные клавиши (Scroll Lock, Caps Lock, F9) Electron принимает как ускоритель,
// но событий отпускания не даёт. Для режима «удерживать» состояние клавиши
// опрашивается отдельным сторожем, а перехват клавиши при этом снимается.

const VK = {
  ScrollLock: 0x91,
  Capslock: 0x14,
  Numlock: 0x90,
  F9: 0x78,
  F10: 0x79,
  Space: 0x20,
  D: 0x44,
};

let poller = null;

function keyToVk(accel) {
  const last = String(accel).split('+').pop().trim();
  return VK[last] || null;
}

function stopKeyPoller() {
  if (poller) {
    try { poller.kill(); } catch { /* уже завершён */ }
    poller = null;
  }
}

function startKeyPoller(accel) {
  stopKeyPoller();
  const vk = keyToVk(accel);
  if (!vk) return false;
  const script = [
    "Add-Type -Namespace W -Name K -MemberDefinition '[DllImport(\"user32.dll\")] public static extern short GetAsyncKeyState(int vKey);'",
    '$vk = ' + vk,
    '$prev = $false',
    'while ($true) {',
    '  $down = (([W.K]::GetAsyncKeyState($vk)) -band 0x8000) -ne 0',
    "  if ($down -ne $prev) { if ($down) { [Console]::Out.WriteLine('down') } else { [Console]::Out.WriteLine('up') } ; $prev = $down }",
    '  Start-Sleep -Milliseconds 40',
    '}',
  ].join('\n');

  poller = execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true }, () => {});
  poller.stdout.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line === 'down') {
        debugLog('poller: down');
        if (!recording && !busy) startDictation();
        else if (settings.dictationMode === 'toggle') stopDictation();
      } else if (line === 'up' && settings.dictationMode === 'hold') {
        debugLog('poller: up');
        stopDictation();
      }
    }
  });
  return true;
}

function registerHotkey(accel) {
  globalShortcut.unregisterAll();
  stopKeyPoller();
  hotkeyOk = false;

  // «Удерживать» — состояние клавиши опрашивается, а сама клавиша перехватывается
  // пустым обработчиком, чтобы не выполняла своё системное действие.
  if (settings.dictationMode === 'hold' && startKeyPoller(accel)) {
    try { globalShortcut.register(accel, () => {}); } catch { /* перехват не критичен */ }
    hotkeyOk = true;
    return accel;
  }

  try {
    hotkeyOk = globalShortcut.register(accel, () => toggleDictation());
  } catch {
    hotkeyOk = false;
  }
  if (!hotkeyOk) {
    // запасной вариант, если клавиша занята другой программой
    const fallback = 'Control+Shift+Space';
    try { hotkeyOk = globalShortcut.register(fallback, () => toggleDictation()); } catch { hotkeyOk = false; }
    if (hotkeyOk) { persist({ hotkey: fallback }); return fallback; }
  }
  return accel;
}

// ── диктовка ─────────────────────────────────────────────────────────────────
// Указатель — страница оригинала (original-ui) в окне 168×119, если она на месте;
// иначе своя страница overlay.html с тем же размером окна.
const OVERLAY_SIZE = { width: 168, height: 119 };

function setOverlay(phase, payload = {}) {
  if (!overlayWin) return;
  const { workAreaSize } = require('electron').screen.getPrimaryDisplay();
  overlayWin.setBounds({
    x: Math.round((workAreaSize.width - OVERLAY_SIZE.width) / 2),
    y: 56,
    ...OVERLAY_SIZE,
  });

  // Страница оригинала ждёт своих событий: начало и конец диктовки
  if (origUiUrl) {
    const channel = phase === 'listening' ? 'start-dictation' : 'stop-dictation';
    overlayWin.webContents.send('orig:send', channel);
  }

  overlayWin.webContents.send('overlay:state', { phase, ...payload });
  overlayWin.showInactive();
}

function toggleDictation() {
  if (busy) return;
  if (recording) { stopDictation(); return; }
  startDictation();
}

function startDictation() {
  debugLog('startDictation: recording=' + recording + ' busy=' + busy);
  if (recording || busy) return;

  // Стенд для проверки: если задан файл записи, микрофон не используется.
  const testWav = process.env.GOLOSNABOR_TEST_WAV;
  if (testWav && fs.existsSync(testWav)) {
    setOverlay('processing', { hint: 'Проверка: распознаю файл…' });
    processRecording(testWav);
    return;
  }

  recording = true;
  const hint = settings.dictationMode === 'hold'
    ? 'Говорите. Отпустите клавишу — закончить.'
    : 'Говорите. Повторное нажатие — закончить.';
  setOverlay('listening', { hint });
  recorderWin.webContents.send('recorder:start', { maxSeconds: settings.maxSeconds });
  if (settings.sounds) beep(880, 80);
}

function stopDictation() {
  if (!recording) return;
  recording = false;
  setOverlay('processing', { hint: 'Распознаю…' });
  if (settings.sounds) beep(620, 70);
  recorderWin.webContents.send('recorder:stop');
}

function beep(freq, ms) {
  execFile('powershell.exe', ['-NoProfile', '-Command', `[console]::beep(${freq},${ms})`], () => {});
}

async function handleAudio(buffer) {
  const stamp = Date.now();
  const webm = path.join(os.tmpdir(), `golosnabor-${stamp}.webm`);
  try {
    fs.writeFileSync(webm, Buffer.from(buffer));
    await processRecording(webm);
  } finally {
    fs.rm(webm, { force: true }, () => {});
  }
}

async function processRecording(file) {
  debugLog('processRecording: ' + path.basename(file));
  busy = true;
  recording = false;
  try {
    const result = await transcribe(file, settings);
    const text = (result.text || '').trim();
    if (!text) {
      setOverlay('empty', { hint: 'Речь не распознана. Попробуйте ещё раз.' });
      setTimeout(() => overlayWin.hide(), 2600);
      return;
    }
    clipboard.writeText(text);
    let inserted = null;
    if (settings.autoPaste) inserted = await insertIntoActiveWindow(text);
    store.addHistory({ at: new Date().toISOString(), text, engine: result.engine, ms: result.ms, inserted });
    const hint = !settings.autoPaste
      ? 'Скопировано в буфер обмена'
      : inserted === 'type'
        ? 'Текст напечатан в активном окне'
        : 'Вставлено через буфер обмена';
    setOverlay('done', { text, hint });
    if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send('panel:history', store.recentHistory(5));
    setTimeout(() => overlayWin.hide(), 3400);
  } catch (err) {
    debugLog('ошибка распознавания: ' + err.message);
    setOverlay('error', { hint: 'Не удалось распознать: ' + err.message });
    setTimeout(() => overlayWin.hide(), 6000);
  } finally {
    busy = false;
  }
}

// ── вставка в активное окно ──────────────────────────────────────────────────
// Наш указатель фокус не забирает, поэтому события уходят туда, где человек
// работал. Основной способ — посимвольная печать Unicode через SendInput:
// буфер обмена не затрагивается, модификатор Ctrl не нужен, и вместо текста
// не появляется одна буква «v» (так ведёт себя старый SendKeys '^v').

function runPowerShell(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', args, { windowsHide: true, timeout }, (err, stdout) => {
      if (err) reject(err); else resolve(String(stdout || ''));
    });
  });
}

async function insertText(text, mode) {
  const file = path.join(os.tmpdir(), `golosnabor-insert-${Date.now()}.txt`);
  fs.writeFileSync(file, text, 'utf8');
  try {
    await runPowerShell([
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'lib', 'input.ps1'),
      '-Mode', mode, '-TextFile', file,
    ]);
  } finally {
    fs.rm(file, { force: true }, () => {});
  }
}

async function insertIntoActiveWindow(text) {
  const preferred = settings.insertMode === 'paste' ? 'paste' : 'type';
  try {
    await insertText(text, preferred);
    return preferred;
  } catch {
    const fallback = preferred === 'type' ? 'paste' : 'type';
    await insertText(text, fallback);
    return fallback;
  }
}

// ── запуск ───────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  readSettings();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));

  // Страница оригинала лежит рядом: раздаём её по петлевому адресу,
  // иначе её модули не загружаются из файла.
  const origDir = path.join(__dirname, 'original-ui');
  if (fs.existsSync(path.join(origDir, 'index.html'))) {
    try {
      const { port } = await origUiServer.start(origDir);
      origUiUrl = `http://127.0.0.1:${port}/index.html`;
      debugLog('страница оригинала: ' + origUiUrl);
    } catch (err) {
      debugLog('сервер страницы оригинала не поднялся: ' + err.message);
      origUiUrl = null;
    }
  }

  createPanel();
  createOverlay();
  createRecorder();
  createTray();
  registerHotkey(settings.hotkey);

  // Движок: сначала пробуем внешний сервер распознавания (на этой машине он
  // на видеокарте и работает быстрее), потом поднимаем свой из папки engine\.
  // Переменная GOLOSNABOR_SERVER_URL позволяет задать источник вручную:
  // пустая строка — сразу свой сервер из комплекта.
  if (process.env.GOLOSNABOR_SERVER_URL !== undefined) {
    settings.whisperUrl = process.env.GOLOSNABOR_SERVER_URL;
    debugLog('источник распознавания задан вручную: ' + (settings.whisperUrl || 'свой сервер'));
  } else if (!settings.whisperUrl) {
    const external = await probeServer('http://127.0.0.1:8001');
    if (external) {
      settings.whisperUrl = 'http://127.0.0.1:8001';
      debugLog('используем внешний сервер распознавания: ' + settings.whisperUrl);
    }
  }

  if (!settings.whisperUrl && fs.existsSync(ENGINE_DIR)) {
    localEngine.startLocal(ENGINE_DIR, settings.whisperModel, debugLog).then((started) => {
      if (started) {
        engineServer = started;
        settings.whisperUrl = started.url;
      } else {
        debugLog('свой сервер не поднялся, работаем через whisper-cli');
      }
    }).catch((err) => debugLog('ошибка своего сервера: ' + err.message));
  }

  app.on('activate', () => { if (panelWin) { panelWin.show(); panelWin.focus(); } });
});

app.on('window-all-closed', (e) => { e.preventDefault?.(); });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopKeyPoller();
  if (engineServer) { try { engineServer.stop(); } catch { /* уже остановлен */ } }
});

// ── связи с окнами ───────────────────────────────────────────────────────────
ipcMain.handle('panel:get-state', () => ({
  settings,
  hotkeyOk,
  history: store.recentHistory(5),
  engine: { server: settings.whisperUrl, cli: settings.whisperCli },
}));

ipcMain.handle('panel:set-setting', (_e, key, value) => {
  const allowed = new Set(['hotkey', 'dictationMode', 'autoPaste', 'darkTheme', 'sounds', 'maxSeconds', 'language']);
  if (!allowed.has(key)) return { ok: false, message: 'настройка не разрешена' };
  persist({ [key]: value });
  let hotkey = settings.hotkey;
  if (key === 'hotkey') hotkey = registerHotkey(value);
  if (key === 'dictationMode') hotkey = registerHotkey(settings.hotkey);
  if (panelWin) panelWin.webContents.send('panel:state', { settings, hotkeyOk, hotkey });
  return { ok: true, settings, hotkeyOk };
});

ipcMain.handle('panel:toggle', () => { toggleDictation(); return { recording, busy }; });
ipcMain.handle('panel:show-history', () => store.recentHistory(50));
ipcMain.handle('panel:open-folder', () => shell.openPath(app.getPath('userData')));

ipcMain.on('recorder:level', (_e, level) => { if (overlayWin) overlayWin.webContents.send('overlay:level', level); });
ipcMain.on('recorder:done', (_e, buffer) => { handleAudio(buffer); });
ipcMain.on('recorder:too-long', () => { stopDictation(); });
