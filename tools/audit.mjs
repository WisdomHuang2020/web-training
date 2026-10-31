/**
 * 发布前审核 —— 静态解析，不依赖浏览器。
 *
 *   node tools/audit.mjs
 *
 * 查的是「推上去会丢人 / 会被搜索引擎判无效 / 会让读者点到空链接」那几类问题：
 *   ① 单页 head 完整性：title、description、canonical、lang
 *   ② 结构：h1 唯一、标题层级不跳、id 不重复
 *   ③ 可达性：空链接文本、img 缺 alt、target=_blank 缺 rel
 *   ④ 站级：sitemap / robots / 404 页是否存在，且 sitemap 覆盖全部页面
 *   ⑤ 卫生：内联事件、外链依赖（离线可用性）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(ROOT, '..', 'site');
const SITE_ORIGIN = 'https://www.web-training.power-knowledge.tech';

const pages = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.html')) pages.push(p);
  }
})(SITE);

const problems = [];
const notes = [];
const add = (file, msg) => problems.push(`${path.relative(SITE, file).padEnd(24)} ${msg}`);

const strip = s => s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const head = (html.match(/<head>([\s\S]*?)<\/head>/i) || [, ''])[1];
  const body = strip(html.split(/<\/head>/i)[1] || '');

  /* ---- head ---- */
  const title = (head.match(/<title>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
  const desc = (head.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [, ''])[1].trim();
  const canon = (head.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i) || [, ''])[1].trim();
  const lang = (html.match(/<html[^>]*\slang="([^"]*)"/i) || [, ''])[1];

  if (!title) add(file, '缺 <title>');
  else if (title.length < 8) add(file, `title 过短（${title.length} 字）`);
  else if (title.length > 70) add(file, `title 过长（${title.length} 字，搜索结果会被截断）`);

  if (!desc) add(file, '缺 meta description');
  else if (desc.length < 45) add(file, `description 过短（${desc.length} 字）`);
  else if (desc.length > 180) add(file, `description 过长（${desc.length} 字）`);

  if (!canon) add(file, '缺 canonical —— 多入口（裸域/www/Pages）时无法归并权重');
  else if (!canon.startsWith(SITE_ORIGIN)) add(file, `canonical 不是规范域：${canon}`);

  if (!lang) add(file, '缺 <html lang>');

  /* ---- 结构 ---- */
  const h1s = [...body.matchAll(/<h1[\s>]/gi)].length;
  if (h1s !== 1) add(file, `h1 数量 = ${h1s}（应为 1）`);

  const levels = [...body.matchAll(/<h([1-6])[\s>]/gi)].map(m => +m[1]);
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      add(file, `标题层级跳级：h${levels[i - 1]} → h${levels[i]}`);
      break;
    }
  }

  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) add(file, `重复 id：${[...new Set(dup)].join(', ')}`);

  /* ---- 可达性 ---- */
  for (const m of body.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    const aria = (m[0].match(/aria-label="([^"]*)"/i) || [, ''])[1];
    if (!text && !aria && !/aria-hidden="true"/.test(m[0])) {
      add(file, '存在无文本、无 aria-label 的链接');
      break;
    }
  }

  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\salt="[^"]*"/i.test(m[0])) { add(file, 'img 缺 alt'); break; }
  }

  for (const m of body.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
    if (!/rel="[^"]*noopener/.test(m[0])) { add(file, 'target=_blank 缺 rel=noopener'); break; }
  }

  /* ---- 卫生 ---- */
  if (/\son(click|load|error|mouseover)=/i.test(body)) add(file, '存在内联事件处理');
  for (const m of html.matchAll(/\s(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    const u = m[1];
    if (u.startsWith(SITE_ORIGIN)) continue;
    if (/beian\.(miit|mps)\.gov\.cn|github\.com/.test(u)) continue;
    notes.push(`${path.relative(SITE, file)} 外链依赖：${u}`);
  }
}

/* ---- 站级 ---- */
const need = [
  ['sitemap.xml', '搜索引擎提交用；M13/M29 两讲都在讲它'],
  ['robots.txt', '没有它 sitemap 也难被发现'],
  ['404.html', '多页站必须真 404，别回落首页'],
  ['assets/beian-gongan.png', '公安备案要求「图标 + 编号 + 链接」三者齐备'],
];
for (const [f, why] of need) {
  if (!fs.existsSync(path.join(SITE, f))) problems.push(`${'(站级)'.padEnd(24)} 缺 ${f} —— ${why}`);
}

const sitemapPath = path.join(SITE, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  const sm = fs.readFileSync(sitemapPath, 'utf8');
  const listed = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
  const missing = pages
    .filter(p => !p.endsWith('404.html'))
    .map(p => {
      const rel = '/' + path.relative(SITE, p).replace(/\\/g, '/');
      // 目录式产物：/map/index.html 的公开地址是 /map，/index.html 是 /
      const clean = rel.replace(/\/index\.html$/, '');
      return clean === '' ? '/' : clean;
    })
    .filter(u => {
      const abs = SITE_ORIGIN + u;
      // 干净 URL 也算覆盖：/map.html 由 /map 提供，/index.html 由 / 提供
      if (listed.has(abs)) return false;
      if (listed.has(abs.replace(/index\.html$/, ''))) return false;
      if (abs.endsWith('.html') && listed.has(abs.slice(0, -5))) return false;
      return true;
    });
  if (missing.length) problems.push(`${'(站级)'.padEnd(24)} sitemap 漏了 ${missing.length} 页：${missing.slice(0, 5).join(', ')}…`);
}

/* ---- 输出 ---- */
console.log(`审核 ${pages.length} 个页面\n`);
if (problems.length) {
  console.log(`发现 ${problems.length} 处问题：`);
  for (const p of problems) console.log('  ✗ ' + p);
} else {
  console.log('✓ 全部通过');
}
if (notes.length) {
  const uniq = [...new Set(notes)];
  console.log(`\n提示（不影响通过）：${uniq.length} 条`);
  uniq.slice(0, 8).forEach(n => console.log('  · ' + n));
}
process.exit(problems.length ? 1 : 0);
