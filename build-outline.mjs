#!/usr/bin/env node
/**
 * 从 data/course.mjs 导出 Markdown 总纲。
 * 目的：数据只有一处（data/course.mjs），md 与网站都从它派生，杜绝漂移。
 *
 * 用法： node build-outline.mjs
 * 退出码：0 成功 / 2 找不到数据块 / 3 数据自检不通过
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, '00-总纲.md');

// 唯一数据源：与 site/ 用的是同一份，改一处两边都变
const D = await import('./data/course.mjs');
const { IS_ISNOT, AUDIENCE, PASS_LINE } = await import('./data/structure.mjs');

const ALL = D.STAGES.reduce((a, s) => a.concat(s.mods), []);
const TOTAL = ALL.length;

const inPath = (mod, key) => {
  if (key === 'ALL') return true;
  if (key === 'Q') return D.PATHS.Q.mods.indexOf(mod.no) >= 0;
  return mod.p.indexOf(key) >= 0;
};
const countPath = key => ALL.filter(x => inPath(x, key)).length;

// ---- 数据自检：编号唯一、路径可解析、模块有练习 ----
const errs = [];
const seen = new Set();
ALL.forEach(x => {
  if (seen.has(x.no)) errs.push('重复编号 ' + x.no);
  seen.add(x.no);
  if (!x.can) errs.push(x.no + ' 缺「学完能」');
  if (!x.drill) errs.push(x.no + ' 缺「练习」');
  if (!x.acc || !x.acc.length) errs.push(x.no + ' 缺判据');
});
D.PATHS.Q.mods.forEach(no => { if (!seen.has(no)) errs.push('路径 Q 引用了不存在的 ' + no); });
if (errs.length) {
  console.error('✘ 数据自检失败：\n  ' + errs.join('\n  '));
  process.exit(3);
}

const L = [];
const P = (...a) => L.push(...a);

P('# ' + D.META.title + ' · 总纲 ' + D.META.version, '');
P('> **本文件由脚本生成，不要手改。** 唯一数据源是 `data/course.mjs`（网站与本文档共用），改完运行 `node build-outline.mjs` 重新导出，运行 `node build-outline.mjs --check` 核对是否同步。');
P('>');
P('> ' + D.META.basis + '。');
P('>');
P('> ' + D.META.delivery + '。');
P('>');
P('> 更新日期：' + D.META.date + '　|　模块数：' + TOTAL + '　|　阶段数：' + D.STAGES.length);
P('');
P('---', '');

P('## 0. 这门课是什么 / 不是什么', '');
// <b>…</b> 是页面用的强调标记，导 md 时转成 **…**
const md = t => t.replace(/<b>(.*?)<\/b>/g, '**$1**');
P('| 是 | 不是 |', '|---|---|');
IS_ISNOT.yes.forEach((y, i) => P('| ' + md(y) + ' | ' + md(IS_ISNOT.no[i]) + ' |'));
P('');
P('**及格线只有一条**：' + PASS_LINE, '');
P('---', '');

P('## 1. 读者与前置', '');
P('| 项 | 要求 |', '|---|---|');
AUDIENCE.forEach(([k, v]) => P('| ' + k + ' | ' + v + ' |'));
P('', '---', '');

P('## 2. 两条技术路线', '');
P('| 维度 | ' + D.ROUTES.map(r => r.name).join(' | ') + ' |');
P('|---|' + D.ROUTES.map(() => '---').join('|') + '|');
P('| 样板站 | ' + D.ROUTES.map(r => '`' + r.sub + '`').join(' | ') + ' |');
const dims = D.ROUTES[0].rows.map(r => r[0]);
dims.forEach((d, i) => {
  P('| ' + d + ' | ' + D.ROUTES.map(r => r.rows[i][1]).join(' | ') + ' |');
});
P('');
P('**为什么两条都讲**：它们的失败模式完全相反。只学一条，遇到另一类站就会用错排障方向。', '');
P('---', '');

P('## 3. 阶段与模块总表', '');
P('| 阶段 | 模块 | 一句话 | 学完能 | 路径 |');
P('|---|---|---|---|---|');
D.STAGES.forEach(s => {
  s.mods.forEach((x, i) => {
    P('| ' + (i === 0 ? '**' + s.id + ' ' + s.name + '**' : '') + ' | ' + x.no + ' ' + x.t +
      ' | ' + x.q + ' | ' + x.can + ' | ' + x.p.join('/') + ' |');
  });
});
P('', '---', '');

P('## 4. 关键路径与四道门禁', '');
P('```');
D.FLOW.forEach(f => {
  P((f.gate ? '【门禁】' : '        ') + f.t + '　→ 产出：' + f.o);
});
P('```', '');
P('| 门禁 | 卡住的典型现象 | 真实原因 |');
P('|---|---|---|');
D.GATES.forEach(g => P('| ' + g[0] + ' | ' + g[1] + ' | ' + g[2] + ' |'));
P('');
P('**共同点**：卡住时不是代码问题，去改代码只会浪费时间。', '');
P('---', '');

P('## 5. 模块卡', '');
P('> 「可验」= 能用命令或观测确认；「人评」= 只能由人判断。', '');
D.STAGES.forEach(s => {
  P('### ' + s.id + ' ' + s.name, '');
  s.mods.forEach(x => {
    P('#### ' + x.no + ' ' + x.t, '');
    P('- **问题**：' + x.q);
    P('- **学完能**：' + x.can);
    P('- **要点**：');
    x.pts.forEach(p => P('  - ' + p));
    P('- **产出物**：' + x.out);
    P('- **验收判据**：');
    x.acc.forEach(a => P('  - ' + (a[0] === 'h' ? '`可验` ' : '`人评` ') + a[1]));
    P('- **练习**：' + x.drill);
    P('- **坑位**：' + x.pit);
    P('- **所属路径**：' + x.p.join(' / '));
    P('');
  });
});
P('---', '');

P('## 6. 学习路径', '');
P('| 路径 | 模块数 | 覆盖 |', '|---|---|---|');
P('| 最短闭环 | ' + countPath('Q') + ' | ' + D.PATHS.Q.mods.join('、') + ' |');
['A', 'B', 'C'].forEach(k => {
  const list = ALL.filter(x => inPath(x, k)).map(x => x.no);
  P('| ' + D.PATHS[k].label + ' | ' + countPath(k) + ' | ' + list.join('、') + ' |');
});
P('');
P('---', '');

P('## 7. 通用红线', '');
D.REDLINES.forEach((r, i) => P((i + 1) + '. ' + r));
P('', '---', '');

P('## 8. 术语表', '');
P('| 术语 | 含义 |', '|---|---|');
D.GLOSSARY.forEach(g => P('| ' + g[0] + ' | ' + g[1] + ' |'));
P('', '---', '');

P('## 9. 决策与遗留', '');
P('| # | 状态 | 事项 | 影响 |', '|---|---|---|---|');
D.TODO.forEach((t, i) => P('| ' + (i + 1) + ' | ' + (t.s === 'ok' ? '已定' : '待定') + ' | ' + t.t + ' | ' + t.w + ' |'));
P('');
P('---', '');
P('*' + D.META.version + ' · ' + D.META.date + ' · 由 build-outline.mjs 生成*');

// ---- 语义一致性校验（--check）：比对内容，不比对字节 ----
// 用于回答「html 与 md 同步了吗」。外部格式化工具会改写表格对齐与空行，
// 只要字段内容一致就算同步；字节级比较会把格式噪音误判成漂移。
function parseMdModules(md) {
  const map = {};
  const parts = md.split(/^#### (M\d\d) /m);
  for (let i = 1; i < parts.length; i += 2) {
    const no = parts[i];
    const body = parts[i + 1];
    const pick = re => { const x = body.match(re); return x ? x[1].trim() : ''; };
    const seg = body.split('- **要点**：')[1] || '';
    const ptsSeg = seg.split('- **产出物**：')[0] || '';
    map[no] = {
      t: body.split('\n')[0].trim(),
      can: pick(/- \*\*学完能\*\*：(.+)/),
      out: pick(/- \*\*产出物\*\*：(.+)/),
      drill: pick(/- \*\*练习\*\*：(.+)/),
      pit: pick(/- \*\*坑位\*\*：(.+)/),
      paths: pick(/- \*\*所属路径\*\*：(.+)/),
      pts: (ptsSeg.match(/^ {2}- /gm) || []).length
    };
  }
  return map;
}

const MD = L.join('\n') + '\n';

const argFile = (process.argv.find(a => a.startsWith('--file=')) || '').slice(7);
if (process.argv.includes('--check')) {
  const target = argFile || OUT;
  let cur = '';
  try { cur = fs.readFileSync(target, 'utf8'); }
  catch (e) { console.error('✘ 读不到 ' + target); process.exit(3); }

  const got = parseMdModules(cur);
  const bad = [];
  ALL.forEach(x => {
    const g = got[x.no];
    if (!g) { bad.push(x.no + ' 在 md 中缺失'); return; }
    if (g.t !== x.t) bad.push(x.no + ' 标题不一致');
    if (g.can !== x.can) bad.push(x.no + ' 「学完能」不一致');
    if (g.out !== x.out) bad.push(x.no + ' 「产出物」不一致');
    if (g.drill !== x.drill) bad.push(x.no + ' 「练习」不一致');
    if (g.pit !== x.pit) bad.push(x.no + ' 「坑位」不一致');
    if (g.paths !== x.p.join(' / ')) bad.push(x.no + ' 「路径」不一致');
    if (g.pts !== x.pts.length) bad.push(x.no + ' 「要点」条数 ' + g.pts + ' ≠ ' + x.pts.length);
  });
  Object.keys(got).forEach(no => { if (!seen.has(no)) bad.push('md 里有 html 没有的 ' + no); });

  if (bad.length) {
    console.error('✘ 内容不一致（' + bad.length + ' 处）：');
    bad.slice(0, 20).forEach(b => console.error('  - ' + b));
    process.exit(1);
  }
  console.log('✔ 模块字段一致：' + TOTAL + ' 个模块的标题/能力/产出/练习/坑位/路径/要点条数全部对齐');

  // 全文纯文本比对：剥掉 markdown 标记与空白后逐字比，抓模块卡以外的正文漂移
  const plain = s => s.replace(/[|>#*`_\[\]]/g, '').replace(/\s+/g, '').replace(/-/g, '');
  const A = plain(MD), B = plain(cur);
  if (A !== B) {
    let i = 0;
    while (i < A.length && i < B.length && A[i] === B[i]) i++;
    console.error('✘ 全文不一致，首个分歧在第 ' + i + ' 个字符附近：');
    console.error('  生成：…' + A.slice(Math.max(0, i - 30), i + 40) + '…');
    console.error('  文件：…' + B.slice(Math.max(0, i - 30), i + 40) + '…');
    console.error('  （长度：生成 ' + A.length + ' / 文件 ' + B.length + '）');
    process.exit(1);
  }
  console.log('✔ 全文一致：剥掉 markdown 标记与空白后逐字相同（' + A.length + ' 字符）');
  console.log('  比对文件：' + path.basename(target));
  process.exit(0);
}

fs.writeFileSync(OUT, MD, 'utf8');
console.log('✔ 已生成 ' + path.basename(OUT));
console.log('  模块 ' + TOTAL + ' 个 | 阶段 ' + D.STAGES.length + ' 个 | 术语 ' + D.GLOSSARY.length + ' 条 | 红线 ' + D.REDLINES.length + ' 条');
console.log('  路径 Q=' + countPath('Q') + ' A=' + countPath('A') + ' B=' + countPath('B') + ' C=' + countPath('C'));
