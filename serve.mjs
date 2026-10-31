/**
 * 本地预览服务器 —— 只因 site/ 是纯静态站，不需要构建，但要一个 http 源
 * （file:// 下相对路径可用，只是 localhost 更接近线上行为）。
 *
 *   node serve.mjs          → http://localhost:5178
 *   node serve.mjs 8080     → 指定端口
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site');
const PORT = Number(process.argv[2]) || 5178;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  const file = path.join(ROOT, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));

  // 只允许读 ROOT 内的文件
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('403'); return; }

  fs.readFile(file, (err, buf) => {
    if (err) {
      // 无扩展名：先按「同名 .html」（对应 nginx 的 try_files $uri.html），再按目录
      const asHtml = file + '.html';
      if (!path.extname(file) && fs.existsSync(asHtml)) {
        res.writeHead(200, { 'content-type': MIME['.html'] }).end(fs.readFileSync(asHtml));
        return;
      }
      const asIndex = path.join(file, 'index.html');
      if (!path.extname(file) && fs.existsSync(asIndex)) {
        res.writeHead(200, { 'content-type': MIME['.html'] }).end(fs.readFileSync(asIndex));
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 ' + url);
      console.log('404', url);
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`本地预览  http://localhost:${PORT}/`);
  console.log(`            http://localhost:${PORT}/lessons/M01.html`);
});
