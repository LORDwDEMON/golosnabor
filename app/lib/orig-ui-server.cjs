// Локальный сервер для страницы оригинала.
// Страница собрана как ES-модули: по file:// они не загружаются, поэтому
// раздаём её по http://127.0.0.1:<случайный порт>. Слушаем только петлю,
// отдаём только файлы из папки original-ui.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function start(rootDir) {
  const root = path.resolve(rootDir);

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';

      const target = path.resolve(root, '.' + rel);
      // защита от выхода за пределы папки
      if (!target.startsWith(root + path.sep) && target !== root) {
        res.writeHead(403).end('запрещено');
        return;
      }

      fs.stat(target, (err, stat) => {
        if (err || !stat.isFile()) {
          res.writeHead(404).end('нет файла');
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(target).pipe(res);
      });
    } catch (err) {
      res.writeHead(500).end('ошибка: ' + err.message);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

module.exports = { start };
