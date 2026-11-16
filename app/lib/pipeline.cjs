// Конвейер распознавания речи: запись → wav → текст.
// Два независимых пути к движку, чтобы приложение работало, даже если
// сервер распознавания не запущен.

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { tidyText, restorePunctuation } = require('./text.cjs');

const execFileP = promisify(execFile);

// Перекодирование записи в формат, который понимает движок: 16 кГц, моно.
async function toWav(input, ffmpegPath) {
  // Промежуточный файл кладём во временную папку, а не рядом с записью:
  // иначе после работы в папке комплекта остаются хвосты вида *.16k.wav
  const out = path.join(os.tmpdir(), `golosnabor-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.16k.wav`);
  await execFileP(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input,
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
    out,
  ], { windowsHide: true, timeout: 120000 });
  const size = fs.statSync(out).size;
  if (size < 2048) throw new Error('запись слишком короткая');
  return out;
}

// Основной путь: HTTP-сервер whisper.cpp на этой машине (быстро, модель уже в памяти).
async function viaServer(wav, baseUrl, language) {
  const body = new FormData();
  body.append('file', new Blob([fs.readFileSync(wav)], { type: 'audio/wav' }), 'audio.wav');
  body.append('response_format', 'json');
  body.append('language', language || 'ru');
  body.append('temperature', '0');

  const res = await fetch(new URL('/inference', baseUrl), {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error('сервер распознавания ответил ' + res.status);
  const data = await res.json();
  return String(data.text || '').trim();
}

// Запасной путь: отдельный вызов whisper-cli.exe.
async function viaCli(wav, cliPath, modelPath, language) {
  const base = path.join(path.dirname(wav), 'cli-' + Date.now());
  await execFileP(cliPath, [
    '-m', modelPath, '-f', wav, '-l', language || 'ru',
    '-nt', '-otxt', '-of', base,
  ], { windowsHide: true, timeout: 300000 });
  const txtPath = base + '.txt';
  const text = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8').trim() : '';
  fs.rm(txtPath, { force: true }, () => {});
  return text;
}

// Главная функция: путь к записанному файлу и настройки → текст.
// Сырой ответ движка сохраняется в raw, а в text идёт приведённый в порядок
// (пробелы, знаки, заглавные, завершающая точка) и дополненный знаками.
async function transcribe(inputPath, settings) {
  const started = Date.now();
  let wav = null;
  const finish = (raw, engine) => {
    const cleaned = tidyText(raw, settings.language);
    // Движок часто не ставит запятые и вопросительные знаки в длинных фразах:
    // достраиваем их осторожными правилами. Отключается настройкой punctuation: "off".
    const punctuation = settings.punctuation === 'off'
      ? { text: cleaned, added: 0 }
      : restorePunctuation(cleaned, settings.language, { questionMark: settings.questionMark === 'auto' });
    return {
      text: punctuation.text,
      raw,
      engine,
      ms: Date.now() - started,
      punctuationAdded: punctuation.added,
    };
  };
  try {
    wav = await toWav(inputPath, settings.ffmpegPath);

    if (settings.whisperUrl) {
      try {
        const raw = await viaServer(wav, settings.whisperUrl, settings.language);
        return finish(raw, 'сервер whisper.cpp');
      } catch (err) {
        // сервер недоступен — переходим к отдельному вызову
        if (!settings.whisperCli) throw err;
      }
    }

    const raw = await viaCli(wav, settings.whisperCli, settings.whisperModel, settings.language);
    return finish(raw, 'whisper-cli');
  } finally {
    if (wav) fs.rm(wav, { force: true }, () => {});
  }
}

module.exports = { transcribe, toWav };
