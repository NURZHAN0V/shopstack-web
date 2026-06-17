import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const PORT_LOCKED = process.env.PORT != null && process.env.PORT !== '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

function resolveFile(urlPath) {
  const pathname = decodeURIComponent((urlPath || '/').split('?')[0]);

  if (pathname.startsWith('/product/') && pathname !== '/product.html') {
    return join(ROOT, 'product.html');
  }

  if (pathname === '/') {
    return join(ROOT, 'index.html');
  }

  let filePath = join(ROOT, pathname);

  if (existsSync(filePath) && !extname(filePath)) {
    const indexPath = join(filePath, 'index.html');
    if (existsSync(indexPath)) return indexPath;
  }

  if (!extname(filePath)) {
    const htmlPath = `${filePath}.html`;
    if (existsSync(htmlPath)) return htmlPath;
  }

  return filePath;
}

async function handleRequest(req, res) {
  try {
    const filePath = resolveFile(req.url);

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html lang="ru"><head><meta charset="UTF-8"><title>404</title></head><body><h1>Страница не найдена</h1><p><a href="/">На главную</a></p></body></html>',
      );
      return;
    }

    const body = await readFile(filePath);
    const type = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(body);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Ошибка сервера');
  }
}

function listen(server, port, maxPort) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (PORT_LOCKED) {
        console.error(`Порт ${port} занят. Остановите другой процесс или укажите другой порт:`);
        console.error('  PowerShell: $env:PORT=3001; npm run dev');
        process.exit(1);
      }
      if (port < maxPort) {
        console.warn(`Порт ${port} занят, пробую ${port + 1}…`);
        listen(server, port + 1, maxPort);
        return;
      }
      console.error(`Порты ${DEFAULT_PORT}–${maxPort} заняты. Остановите лишние серверы (Ctrl+C в старом терминале).`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`ShopStack web: http://localhost:${port}`);
  });
}

listen(createServer(handleRequest), DEFAULT_PORT, DEFAULT_PORT + 10);
