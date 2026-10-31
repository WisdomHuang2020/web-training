/**
 * 链接与锚点自检：站内每个 href 都必须落到真实文件；每个 #锚点 必须真实存在。
 * 断链是「看起来做完了」最典型的漏项，必须有脚本兜底。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const pages = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) pages.push(p);
  }
})(SITE);

const idsOf = new Map();
const htmlOf = new Map();
for (const p of pages) {
  const h = fs.readFileSync(p, 'utf8');
  htmlOf.set(p, h);
  idsOf.set(p, new Set([...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])));
}

let bad = 0, checked = 0;
for (const p of pages) {
  const h = htmlOf.get(p);
  for (const m of h.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const raw = m[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(raw)) continue;
    checked++;
    const [href, hash] = raw.split('#');
    // 以 / 开头的是站根绝对路径（404.html 必须这么写：nginx 在任意深度报 404 时，
    // 相对路径会解析到错误的目录）。这里按站点根解析，不能直接丢给 path.resolve。
    const target = !href ? p
      : href.startsWith('/') ? path.join(SITE, href)
      : path.resolve(path.dirname(p), href);
    if (!fs.existsSync(target)) {
      console.error(`✗ 文件不存在  ${path.relative(SITE, p)} → ${raw}`);
      bad++; continue;
    }
    if (hash && idsOf.has(target) && !idsOf.get(target).has(hash)) {
      console.error(`✗ 锚点不存在  ${path.relative(SITE, p)} → ${raw}`);
      bad++;
    }
  }
}
console.log(`\n检查 ${pages.length} 页 / ${checked} 条站内链接，问题 ${bad} 处`);
process.exit(bad ? 1 : 0);
