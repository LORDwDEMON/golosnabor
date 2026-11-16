// Хранилище настроек и истории расшифровок в папке данных приложения.
// Формат: два простых JSON-файла, без внешних зависимостей.

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = {
  hotkey: 'ScrollLock',
  dictationMode: 'hold',
  language: 'ru',
  autoPaste: true,
  insertMode: 'type',
  punctuation: 'auto', // auto — достраивать знаки правилами; off — только чистка
  questionMark: 'off', // auto — догадываться о вопросе по первому слову; off — не догадываться
  darkTheme: false,
  sounds: true,
  maxSeconds: 60,
  ffmpegPath: 'D:\\AETHER_V4\\DSH-Voice\\bin\\ffmpeg.exe',
  whisperUrl: 'http://127.0.0.1:8001',
  whisperCli: 'D:\\AETHER_V4\\DSH-Voice\\bin\\whisper-cli.exe',
  whisperModel: 'D:\\AETHER_V4\\DSH-Voice\\models\\ggml-large-v3-turbo-q5_0.bin',
};

function dataDir() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function settingsPath() { return path.join(dataDir(), 'settings.json'); }
function historyPath() { return path.join(dataDir(), 'history.json'); }

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function loadSettings(overrides = {}) {
  const stored = readJson(settingsPath(), {});
  return { ...DEFAULTS, ...overrides, ...stored };
}

function saveSettings(patch) {
  const current = loadSettings();
  const next = { ...current, ...patch };
  writeJson(settingsPath(), next);
  return next;
}

function addHistory(entry) {
  const list = readJson(historyPath(), []);
  list.unshift(entry);
  writeJson(historyPath(), list.slice(0, 500));
  return entry;
}

function recentHistory(limit = 10) {
  return readJson(historyPath(), []).slice(0, limit);
}

module.exports = { DEFAULTS, loadSettings, saveSettings, addHistory, recentHistory, dataDir };
