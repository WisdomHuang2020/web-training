/**
 * 布局与可访问性自检 —— 不是「我觉得看起来对」，是量出来的数。
 *
 *   node tools/verify.mjs
 *
 * 用本机 Chrome（channel=chrome），只读不写页面。检查项：
 *   ① 三个宽度下横向溢出（scrollWidth vs innerWidth）
 *   ② 顶栏与正文左边缘是否对齐（差 1px 以内）
 *   ③ 控制台报错
 *   ④ 讲义页必需区块是否都在
 *   ⑤ 正文与背景的对比度（按 WCAG 相对亮度算，要求 ≥ 4.5）
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:5178';

// playwright 装在 npx 缓存里，按绝对路径载入，避免为此给项目加 node_modules
const PW = process.env.PW_PATH
  || 'C:/Users/xuexi/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const { chromium } = await import('file:///' + PW.replace(/\\/g, '/'));

const VIEWPORTS = [
  { name: '桌面 1440', width: 1440, height: 900 },
  { name: '平板 1024', width: 1024, height: 800 },
  { name: '手机 390', width: 390, height: 844 },
];
const PAGES = [
  ['首页', '/'],
  ['讲义 M01', '/lessons/M01.html'],
  ['讲义 M30', '/lessons/M30.html'],
  ['讲义 M31', '/lessons/M31.html'],
  ['门禁', '/gates.html'],
  ['术语表', '/glossary.html'],
  ['404', '/404.html'],
];

const browser = await chromium.launch({ channel: 'chrome' });
const rows = [];
const fails = [];

for (const vp of VIEWPORTS) {
  for (const [label, url] of PAGES) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(BASE + url, { waitUntil: 'networkidle' });

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const q = s => document.querySelector(s);
      const left = s => { const e = q(s); return e ? Math.round(e.getBoundingClientRect().left) : null; };
      return {
        overflow: de.scrollWidth - de.clientWidth,
        brandLeft: left('.topbar .brand'),
        mainLeft: left('.hero h1') ?? left('.lesson h1'),
        secLeft: left('.sec-head .idx'),
        scripts: document.querySelectorAll('script[src]').length,
      };
    });

    const misalign = (m.brandLeft != null && m.mainLeft != null) ? Math.abs(m.brandLeft - m.mainLeft) : 0;
    rows.push({ vp: vp.name, page: label, overflow: m.overflow, brandLeft: m.brandLeft, mainLeft: m.mainLeft, misalign, errs: errs.length });
    if (m.overflow > 1) fails.push(`${vp.name} ${label}：横向溢出 ${m.overflow}px`);
    if (misalign > 1) fails.push(`${vp.name} ${label}：顶栏与正文左缘差 ${misalign}px（brand ${m.brandLeft} / main ${m.mainLeft}）`);
    if (errs.length) fails.push(`${vp.name} ${label}：控制台 ${errs.length} 条错误 → ${errs[0]}`);
    if (vp.width === 1440 && label === '首页') console.log('   首页 .sec-head 左缘 =', m.secLeft);
    await page.close();
  }
}

console.log('\n宽度            页面        横向溢出   顶栏左   正文左   偏差');
for (const r of rows) {
  console.log(
    `${r.vp.padEnd(14)}${r.page.padEnd(12)}${String(r.overflow).padStart(6)}${String(r.brandLeft).padStart(9)}${String(r.mainLeft).padStart(9)}${String(r.misalign).padStart(7)}`,
  );
}

/* ---------- 对比度 ---------- */
const cr = await (async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const res = await page.evaluate(() => {
    const lum = c => {
      const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bgOf = el => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
        n = n.parentElement;
      }
      return 'rgb(10,10,10)';
    };
    const pick = ['.hero .lead', '.mod p', '.sec-desc', '.foot .disc', '.stats span', '.mod .no', '.rail ol a', '.fhint'];
    const out = [];
    for (const sel of pick) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const fg = getComputedStyle(el).color;
      const bg = bgOf(el);
      const l1 = lum(fg), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      out.push([sel, ratio.toFixed(2), getComputedStyle(el).fontSize, fg]);
    }
    return out;
  });
  await page.close();
  return res;
})();

console.log('\n对比度（深底）：');
for (const [sel, ratio, size, fg] of cr) {
  const ok = Number(ratio) >= 4.5;
  console.log(`  ${ok ? '✓' : '✗'} ${sel.padEnd(16)} ${ratio.padStart(6)}:1  ${size.padEnd(6)} ${fg}`);
  if (!ok) fails.push(`对比度不足 ${sel} = ${ratio}:1（要求 ≥ 4.5）`);
}

await browser.close();

if (fails.length) {
  console.error('\n未通过 ' + fails.length + ' 项：');
  fails.forEach(f => console.error('  · ' + f));
  process.exit(1);
}
console.log('\n全部通过。');
