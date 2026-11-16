// Свой сервер распознавания из комплекта.
// В папке engine\bin лежит whisper-server.exe, в engine\models — модель.
// Приложение поднимает его на свободном порту петли, чтобы распознавание было
// быстрым (модель загружается один раз), и гасит при выходе.
// Если сервер поднять не удалось, конвейер сам перейдёт на whisper-cli.

const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(url, timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok || res.status === 400) return true;
    } catch { /* сервер ещё поднимается */ }
    await sleep(400);
  }
  return false;
}

/**
 * Поднимает локальный сервер распознавания.
 * @returns {Promise<{url: string, stop: () => void} | null>}
 */
async function startLocal(engineDir, modelPath, log = () => {}) {
  const exe = path.join(engineDir, 'bin', 'whisper-server.exe');
  if (!fs.existsSync(exe)) { log('нет whisper-server.exe: ' + exe); return null; }
  if (!fs.existsSync(modelPath)) { log('нет модели: ' + modelPath); return null; }

  let port;
  try { port = await freePort(); } catch (err) { log('не удалось выбрать порт: ' + err.message); return null; }

  // --no-gpu: в комплекте только процессорные библиотеки. Без этого ключа
  // сборка пытается работать с видеокартой и запросы распознавания зависают.
  const args = ['-m', modelPath, '--host', '127.0.0.1', '--port', String(port), '--no-gpu', '-t', '4'];
  let proc;
  try {
    proc = spawn(exe, args, { windowsHide: true, stdio: 'ignore' });
  } catch (err) {
    log('сервер не запустился: ' + err.message);
    return null;
  }

  let exited = false;
  proc.once('exit', () => { exited = true; });

  const url = `http://127.0.0.1:${port}`;
  const ready = await waitReady(url);
  if (!ready || exited) {
    try { proc.kill(); } catch { /* уже завершён */ }
    log('сервер не ответил за 40 с');
    return null;
  }

  log('свой сервер распознавания: ' + url);
  return {
    url,
    stop() {
      try { proc.kill(); } catch { /* уже завершён */ }
    },
  };
}

module.exports = { startLocal };
