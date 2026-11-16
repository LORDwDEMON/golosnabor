// Самопроверка комплекта: распознаём образец речи движком из папки engine\.
// Запуск: node проверка.mjs ["путь\к\записи.wav"]
// Код выхода: 0 — годно, 1 — ошибка, 2 — нет файла.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { transcribe } = require('./lib/pipeline.cjs');

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.join(here, '..', 'engine');
const hasEngine = fs.existsSync(engineDir);

// Модель движка не открывает пути с кириллицей, поэтому берём копию
// из служебной папки с латинским путём (её же готовит само приложение).
function modelForEngine() {
  const dir = path.join(engineDir, 'models');
  if (!fs.existsSync(dir)) return null;
  const file = fs.readdirSync(dir).find((n) => n.endsWith('.bin'));
  if (!file) return null;
  const source = path.join(dir, file);
  const cacheDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'GolosNabor', 'models');
  fs.mkdirSync(cacheDir, { recursive: true });
  const target = path.join(cacheDir, file);
  const needCopy = !fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size;
  if (needCopy) {
    console.log('  подготовка модели (копия в служебную папку)…');
    fs.copyFileSync(source, target);
  }
  return target;
}

let settings;
if (hasEngine) {
  const model = modelForEngine();
  settings = {
    ffmpegPath: path.join(engineDir, 'bin', 'ffmpeg.exe'),
    whisperUrl: '', // без сервера: проверяем именно автономный путь
    whisperCli: path.join(engineDir, 'bin', 'whisper-cli.exe'),
    whisperModel: model,
    language: 'ru',
  };
} else {
  settings = {
    ffmpegPath: 'D:\\AETHER_V4\\DSH-Voice\\bin\\ffmpeg.exe',
    whisperUrl: 'http://127.0.0.1:8001',
    whisperCli: 'D:\\AETHER_V4\\DSH-Voice\\bin\\whisper-cli.exe',
    whisperModel: 'D:\\AETHER_V4\\DSH-Voice\\models\\ggml-large-v3-turbo-q5_0.bin',
    language: 'ru',
  };
}

const fallback = hasEngine
  ? path.join(engineDir, 'образец-речи.wav')
  : 'D:\\AETHER_V4\\DSH-Voice\\audio\\_check_piper.wav';
const input = process.argv[2] || fallback;

console.log('Проверка распознавания');
console.log('  движок из комплекта:', hasEngine ? 'да' : 'нет (пути с этой машины)');
console.log('  модель:', settings.whisperModel || '—');
console.log('  файл:', input);

if (!fs.existsSync(input)) {
  console.error('  ОШИБКА: файл не найден');
  process.exit(2);
}

const started = Date.now();
try {
  const result = await transcribe(input, settings);
  console.log('  распознавание, мс:', result.ms, '| всего, мс:', Date.now() - started);
  console.log('  текст:', JSON.stringify(result.text));
  if (!result.text) {
    console.error('  РЕЗУЛЬТАТ: ПУСТО — текст не получен');
    process.exit(1);
  }
  console.log('  РЕЗУЛЬТАТ: ГОДНО');
  process.exit(0);
} catch (err) {
  console.error('  ОШИБКА:', err && err.message ? err.message : err);
  process.exit(1);
}
