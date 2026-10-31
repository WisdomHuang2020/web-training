/**
 * 站点生成器：读取 data/ 下的数据，输出 site/ 的静态页面。
 *
 *   node build-site.mjs
 *
 * 为什么是零构建静态站而不是 Vite + React：
 *   ① 讲义是内容页，不是交互应用 —— 预渲染的 HTML 直接可读、可打印、可被搜索引擎索引；
 *   ② 与站群其余站点共用同一套设计 token，视觉一致，但不必为它维护一条构建链；
 *   ③ 禁用 JS 也是完整页面（审核意见里「整页 JS 渲染 ⇒ 白页」那条的根治办法）。
 *
 * 只覆盖 .html，不碰 assets/ —— 样式与脚本是源文件，不是产物。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  META, STAGES, PATHS, REDLINES, GLOSSARY, RICH, STEPS, STAGE_DRILLS,
  MODULES, PATH_COUNT, ROUTES, FLOW, GATES, SOP,
} from './data/course.mjs';
import { IS_ISNOT, AUDIENCE, PASS_LINE } from './data/structure.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'site');
const TOTAL = MODULES.length;

/* ============================== 工具 ============================== */

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const pad2 = n => String(n).padStart(2, '0');

/** 1..12 的中文数字 —— 标题里用「十次」比「10 次」顺，但数量不能写死 */
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const cn = n => CN_NUM[n] || String(n);

/** 破坏性演练：每个阶段一次 */
const DRILL_COUNT = STAGES.length;
const DRILL_CN = cn(DRILL_COUNT);

/** 术语表 id：g01..gNN，与术语表页里的一致 */
const termId = i => 'g' + pad2(i + 1);

/** 从模块文字里挑出相关术语（沿用旧生成器的匹配规则） */
const TERM_KEYS = {
  '白名单部署': ['白名单'],
  '拉取式部署': ['拉取式'],
  '提交快照': ['commit'],
  '服务器快照': ['快照'],
  '哨兵文件': ['哨兵'],
};
function termsOf(mod) {
  const text = [mod.t, mod.q, mod.can, (mod.pts || []).join(''), mod.out, mod.drill, mod.pit].join(' ');
  return GLOSSARY
    .map((g, i) => ({ name: g[0], desc: g[1], id: termId(i) }))
    .filter(g => {
      const keys = TERM_KEYS[g.name] || g.name.split(/[\s/、与（）()]+/).filter(x => x.length >= 2);
      return keys.some(k => text.includes(k));
    });
}

/* ============================== 品牌 ============================== */

/**
 * 品牌标记：深底圆角方块 + teal 主形 + amber 点 —— 构造与站群（LLC / AHB / 入口站）一致。
 * 本站主形用「地球经纬网」，语义是「网络 / 站点」。
 *
 * 几何只写一份，顶栏 Logo 与 favicon 共用（见下方 GLOBE / BRAND_SVG / FAVICON 的关系），
 * 免得改一处忘一处 —— 这是站群里有过的老毛病。
 *
 * 疏密是量过的：圆 + 经线 + 赤道（在中心断开给琥珀点让位）。
 * 试过再加两条纬线（更接近常见的地球图标），但 16px 页签尺寸下会糊成一块实心，
 * 所以只在 ≥24px 的顶栏/页脚用得着的那一版就够，不为好看牺牲可辨。
 */
const GLOBE = `<circle cx="16" cy="16" r="9.4" fill="none" stroke="#14b8a6" stroke-width="2.2"/>
  <ellipse cx="16" cy="16" rx="4.4" ry="9.4" fill="none" stroke="#14b8a6" stroke-width="2.2"/>
  <path d="M6.6 16h6.3M19.1 16h6.3" stroke="#14b8a6" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="16" cy="16" r="1.7" fill="#f59e0b"/>`;

const MARK_BG = `<rect width="32" height="32" rx="7" fill="#0a0a0a"/>`;

const BRAND_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  ${MARK_BG}
  ${GLOBE}
</svg>`;

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${MARK_BG}${GLOBE}</svg>`;

/**
 * GitHub 图标：官方 Mark 的 24×24 路径，fill=currentColor 让颜色跟着文字走。
 * 站群（LLC / AHB）用的是 lucide 的 Github 图标 + 「GitHub」文字，这里保持同样的
 * 「图标 + 文字」组合与 16px 尺寸，不单独上色 —— 灰底上再上品牌色会跳出整体。
 */
const GITHUB_ICON = `<svg class="gh-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;

/* ============================== 站点身份 / 合规信息 ============================== */

/** 规范域：裸域与 www 都在服务器上配了，但对外只认 www（301 归一）。
 *  canonical / sitemap / og:url 全部用这一个，别处不要再写死域名。 */
const SITE_ORIGIN = 'https://www.web-training.power-knowledge.tech';
const REPO_URL = 'https://github.com/WisdomHuang2020/web-training';

/** 备案信息：与站群（power-knowledge.tech）同一主体、同一网站，子域共用这组号。
 *  ICP 号必须能点开工信部；公安备案要求「图标 + 编号 + 链接」三者齐备，缺一不可。 */
const BEIAN = {
  icp: '苏ICP备2026073104号-1',
  icpUrl: 'https://beian.miit.gov.cn/',
  gongan: '苏公网安备32021402005238号',
  gonganCode: '32021402005238',
  gonganUrl: 'https://beian.mps.gov.cn/#/query/webSearch?code=32021402005238',
};

/* ============================== 骨架 ============================== */

/** canon：该页在站内的绝对路径，如 '/'、'/gates'、'/lessons/M01' */
function head({ title, desc, prefix, canon, extra = '' }) {
  const url = SITE_ORIGIN + canon;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0a0a0a">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="从 0 到上线 · 网站建设实训课">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml">
${extra}<link rel="stylesheet" href="${prefix}assets/style.css">
</head>`;
}

function topbar({ prefix, current, home, map }) {
  const item = (href, label, key) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  // 课程地图是独立页面 /map（不再用首页的 #map 锚点）。
  // 用相对形式（./map、../map）而非绝对 /map：万一将来挂到子路径也能用。
  const mapHref = map;
  return `<header class="topbar">
  <div class="shell">
    <a class="brand" href="${home}">
      ${BRAND_SVG}
      <b>从 0 到上线</b>
      <em>网站建设实训课</em>
    </a>
    <nav class="nav" aria-label="主导航">
      ${item(home, '总览', 'home')}
      ${item(mapHref, '课程地图', 'map')}
      ${item(prefix + 'gates', '门禁与红线', 'gates')}
      ${item(prefix + 'glossary', '术语表', 'glossary')}
    </nav>
    <span class="pill" data-progress hidden>
      <i><span data-pbar></span></i>
      <span data-ptxt>已学 0 / ${TOTAL}</span>
    </span>
  </div>
</header>`;
}

function footer({ prefix, home, map }) {
  return `<footer class="foot">
  <div class="shell">
    <div class="row">
      <div>
        <div class="brand">
          ${BRAND_SVG}
          <b>从 0 到上线</b>
        </div>
        <div class="meta">
          网站建设实训课 · ${esc(META.date)}<br>
          ${STAGES.length} 个阶段 / ${TOTAL} 讲 / ${Object.keys(PATHS).length} 条学习路径 / ${REDLINES.length} 条红线
        </div>
        <div class="beian">
          <a href="${BEIAN.icpUrl}" target="_blank" rel="noopener noreferrer">${BEIAN.icp}</a>
          <a class="gp" href="${BEIAN.gonganUrl}" target="_blank" rel="noopener noreferrer">
            <img src="${prefix}assets/beian-gongan.png" alt="" width="36" height="40">${BEIAN.gongan}
          </a>
        </div>
      </div>
      <div>
        <div class="links">
          <a href="${home}">总览</a>
          <a href="${map}">课程地图</a>
          <a href="${prefix}gates">门禁与红线</a>
          <a href="${prefix}glossary">术语表</a>
        </div>
      </div>
    </div>

    <!-- 底部条：左版权、右「版本号 + GitHub」。版式对齐站群（LLC / AHB）页脚右下角那一簇：
         等宽小字 + 灰色，hover 才提亮。版本号只读 META.version，与页脚上方不再重复。 -->
    <div class="bar">
      <span class="cr">© ${esc(META.date.slice(0, 4))} 从 0 到上线 · 网站建设实训课</span>
      <span class="meta-right">
        <span class="ver" title="站点版本号（源：data/course.mjs 的 META.version）">${esc(META.version)}</span>
        <a class="gh" href="${REPO_URL}" target="_blank" rel="noopener noreferrer">${GITHUB_ICON}GitHub</a>
      </span>
    </div>

    <div class="disc">
      <p><b>免责声明：</b>本站为个人非商业性技术分享，内容基于公开资料与两个真实站点的实际操作整理，
      仅供学习与工程参考。文中涉及的云服务商、软件与产品，只作操作路径说明，
      <b>不构成对任何厂商的推荐、评价或背书</b>；价格、套餐与政策随时变动，一律以官网为准。
      涉及备案、个人信息处理等法定义务的，以主管部门最新要求为准。任何主体引用本站内容所作的决定及后果，
      由该主体自行承担。</p>
      <p>站内文字与图表为作者原创或基于公开资料整理，著作权归作者所有；文中提及的软件、标准、商标与厂商名称，
      权利均归各自权利人所有，仅作技术说明引用，不代表任何隶属、赞助或背书关系。</p>
    </div>
  </div>
</footer>`;
}

/* ============================== 首页 ============================== */

function modCard(m) {
  const idx = MODULES.findIndex(x => x.no === m.no);
  const kw = [m.t, m.q, m.can, (m.pts || []).join(' '), m.out, m.drill].join(' ');
  const tags = m.p.map(k => `<i class="${k === 'Q' ? 'q' : ''}">${k}</i>`).join('');
  return `<a class="mod" href="lessons/${m.no}" data-mod="${m.no}" data-p="${m.p.join(' ')}" data-kw="${esc(kw)}">
        <span class="no">${m.no} · ${pad2(idx + 1)}/${TOTAL}</span>
        <h4>${esc(m.t)}</h4>
        <p>${esc(m.q)}</p>
        <span class="tags">${tags}</span>
      </a>`;
}

function renderHome() {
  // 首页只放 9 行阶段索引，31 张卡在 /map —— 首页原先是 7700px 长，主要就是这堆卡撑的
  const stageIndex = STAGES.map(st => `<a class="si" href="./map#${st.id.toLowerCase()}">
      <span class="si-id">${st.id}</span>
      <span class="si-body">
        <span class="si-name">${esc(st.name)}<b>${st.mods.length} 讲</b></span>
        <span class="si-mods">${st.mods.map(m => `${m.no} ${esc(m.t)}`).join(' · ')}</span>
      </span>
    </a>`).join('\n      ');

  const pathCards = Object.entries(PATHS).map(([k, p]) => {
    const chips = p.mods.map(no => `<a href="lessons/${no}">${no}</a>`).join('');
    return `<div class="path ${k === 'Q' ? 'q' : ''}">
        <div class="ph">
          <span class="key">${k}</span>
          <h3>${esc(p.label.replace(/^[A-C]\s*/, ''))}</h3>
          <span class="num">${p.mods.length} 讲</span>
        </div>
        <p>${esc(p.hint)}</p>
        <div class="chips">${chips}</div>
      </div>`;
  }).join('\n      ');

  const stats = [
    [STAGES.length, '个阶段'],
    [TOTAL, '讲'],
    [Object.keys(PATHS).length, '条学习路径'],
    [REDLINES.length, '条通用红线'],
  ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('');

  const audience = AUDIENCE.map(([k, v]) =>
    `<div><span>${esc(k)}</span><p>${esc(v)}</p></div>`).join('\n        ');

  const routes = ROUTES.map(r => `<div class="route ${r.k}">
        <h3>${esc(r.name)}</h3>
        <div class="sub">${esc(r.sub)}</div>
        <dl>${r.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      </div>`).join('\n      ');

  const timeline = FLOW.map(s => `<div class="tl-item${s.gate ? ' gate' : ''}">
      <div class="tl-rail"><span class="tl-dot"></span><span class="tl-line"></span></div>
      <div class="tl-body"><span class="t">${esc(s.t)}</span><span class="o">${esc(s.o)}</span></div>
    </div>`).join('\n    ');

  const redlines = REDLINES.map(r => `<li>${esc(r)}</li>`).join('\n      ');

  const glossPreview = GLOSSARY.slice(0, 6).map((g, i) =>
    `<div><dt>${esc(g[0])}</dt><dd>${esc(g[1])}</dd></div>`).join('\n      ');

  return `${head({
    title: META.title,
    desc: `一条从本机到访客屏幕的完整链路：${STAGES.length} 个阶段、${TOTAL} 讲，覆盖版本管理、服务器、备案、nginx、HTTPS、自动化部署、权限密钥、合规与维护。`,
    prefix: '',
    canon: '/',
  })}
<body data-page="home" data-total="${TOTAL}">
${topbar({ prefix: '', current: 'home', home: './', map: './map' })}
<a class="skip" href="#main">跳到正文</a>

<main id="main">
<section class="hero">
  <div class="shell">
    <div class="kicker">Power Knowledge · 实训课</div>
    <h1>从 0 到上线<br><span class="grad">网站建设实训课</span></h1>
    <p class="lead">一条<b>能照做跑通</b>的完整链路：本地 → 仓库 → 服务器 → 域名 → 备案 → 上线 → 维护。
      及格线只有一条 —— <b>${esc(PASS_LINE.replace(/。$/, ''))}</b>。</p>
    <div class="cta">
      <a class="btn btn-primary" href="lessons/M01">从第 1 讲开始 <span class="ar">→</span></a>
      <a class="btn btn-ghost" href="./map">看课程地图</a>
    </div>
    <div class="stats">${stats}</div>
  </div>
</section>

<section class="sec" id="about">
  <div class="shell">
    <div class="sec-head"><span class="idx">01</span><h2>这门课是什么 / 不是什么</h2></div>
    <p class="sec-desc">边界先划清：它不追求讲全，只保证讲到的部分能照着做、做完了能自己验证。</p>
    <div class="compare">
      <div class="yes">
        <h3>是</h3>
        <ul>${IS_ISNOT.yes.map(x => `<li>${x}</li>`).join('\n          ')}</ul>
      </div>
      <div class="no">
        <h3>不是</h3>
        <ul>${IS_ISNOT.no.map(x => `<li>${x}</li>`).join('\n          ')}</ul>
      </div>
    </div>

    <div class="card" style="margin-top:16px;padding:4px 0">
      <div class="deflist">
        ${audience}
      </div>
    </div>
  </div>
</section>

<section class="sec" id="routes">
  <div class="shell">
    <div class="sec-head"><span class="idx">02</span><h2>两条技术路线</h2></div>
    <p class="sec-desc">本站所有模块都同时覆盖这两条路。<b>为什么两条都讲</b>：它们的失败模式完全相反 —— 只学一条，遇到另一类站就会用错排障方向。</p>
    <div class="routes">
      ${routes}
    </div>
  </div>
</section>

<section class="sec" id="map">
  <div class="shell">
    <div class="sec-head"><span class="idx">03</span><h2>课程地图</h2><span class="note">${STAGES.length} 阶段 · ${TOTAL} 讲</span></div>
    <p class="sec-desc">按 ${STAGES.length} 个阶段推进。每讲都有：能力目标 → 要讲清的事 → 照着做的步骤 → 产出物与验收判据 → 练习 → 踩坑 → 自检表。</p>
    <div class="stage-index">
      ${stageIndex}
    </div>
    <div class="cta-row">
      <a class="btn btn-primary" href="./map">打开完整课程地图 <span class="ar">→</span></a>
      <span class="cta-note">31 讲全在这里，可按路径 Q / A / B / C 筛选，也能按关键词搜</span>
    </div>
  </div>
</section>

<section class="sec" id="path">
  <div class="shell">
    <div class="sec-head"><span class="idx">04</span><h2>关键路径与四道门禁</h2></div>
    <p class="sec-desc">这条线上有四个环节，<b>卡住时不是代码问题</b> —— 去改代码只会浪费时间。它们分别是备案、解析、证书与公安备案。</p>
    <div class="card" style="padding:8px 22px">
      <div class="timeline">
    ${timeline}
      </div>
    </div>
    <div class="cta-row">
      <a class="btn btn-ghost" href="gates">四道门禁的归因表 + ${DRILL_CN}次破坏性演练 <span class="ar">→</span></a>
    </div>
  </div>
</section>

<section class="sec" id="paths">
  <div class="shell">
    <div class="sec-head"><span class="idx">05</span><h2>四条学习路径</h2><span class="note">按耐心排，不按知识结构排</span></div>
    <p class="sec-desc">同一套 ${TOTAL} 讲，按目标裁剪。<b>Q 是最短闭环</b>：先一个下午跑通一个能打开的站，拿到正反馈，再回头补工程化。</p>
    <div class="paths">
      ${pathCards}
    </div>
  </div>
</section>

<section class="sec" id="redlines">
  <div class="shell">
    <div class="sec-head"><span class="idx">06</span><h2>十一条通用红线</h2><span class="note">不分阶段，全程适用</span></div>
    <p class="sec-desc">这些不是「最佳实践」，是底线。违反其中任何一条，出了问题都不该算意外。</p>
    <ol class="redlines">
      ${redlines}
    </ol>
  </div>
</section>

<section class="sec" id="glossary">
  <div class="shell">
    <div class="sec-head"><span class="idx">07</span><h2>术语表</h2><span class="note">共 ${GLOSSARY.length} 条</span></div>
    <p class="sec-desc">自造的词必须在使用处给定义 —— 这是第 ${REDLINES.length} 条红线。这里集中放一份，讲义页会各自列出本讲用到的术语。</p>
    <div class="gloss">
      ${glossPreview}
    </div>
    <div class="cta-row">
      <a class="btn btn-ghost" href="glossary">全部 ${GLOSSARY.length} 条术语 <span class="ar">→</span></a>
    </div>
  </div>
</section>
</main>

${footer({ prefix: '', home: './', map: './map' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="assets/app.js"></script>
</body>
</html>
`;
}

/* ============================== 完整 SOP 区块 ============================== */

/**
 * 把 SOP 的块数组渲染成讲义里的一节。
 *
 * 单独做这一层的原因：讲义顶部那套「要点 / 照着做」是速览，装不下分级提示与对照表。
 * 一份真实运维 SOP 压成 5 条要点，就从「照着能做」降级成「大概知道」。
 *
 * 所有文本都过 esc()：数据里出现 < > & 也只当文字，不引入 HTML 注入面。
 */
function renderSop(mod, idx) {
  const sop = SOP[mod.no];
  if (!sop) return '';

  const blocks = sop.blocks.map(b => {
    switch (b.type) {
      case 'h':
        return `<h3>${esc(b.text)}</h3>`;
      case 'p':
        return `<p class="sop-p">${esc(b.text)}</p>`;
      case 'list':
        return `<ul class="pts">${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
      case 'steps':
        return `<ol class="steps">${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`;
      case 'table':
        return `<div class="tbl-wrap"><table class="tbl">
          <thead><tr>${b.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
      case 'code':
        return `<div class="code-wrap">
          <button class="copy" type="button" aria-label="复制命令">复制</button>
          <pre class="code">${esc(b.text).split('\n').map(l => /^\s*#/.test(l) ? `<span class="cm">${l}</span>` : l).join('\n')}</pre>
        </div>`;
      case 'note':
        return `<div class="callout ${b.kind}">${esc(b.text)}</div>`;
      case 'quote':
        return `<blockquote class="sop-quote">${esc(b.text)}</blockquote>`;
      default:
        return '';
    }
  }).join('\n');

  return `
      <section class="lsec sop" id="sop">
        <h2><span class="i">${idx}</span>完整 SOP<span class="n">照着能做</span></h2>
        ${sop.intro ? `<p class="sop-p sop-intro">${esc(sop.intro)}</p>` : ''}
        ${blocks}
      </section>
`;
}

/* ============================== 讲义页 ============================== */

function lessonPage(mod, stage) {
  const i = MODULES.findIndex(x => x.no === mod.no);
  const prev = i > 0 ? MODULES[i - 1] : null;
  const next = i < TOTAL - 1 ? MODULES[i + 1] : null;
  const rich = RICH[mod.no] || {};
  const steps = STEPS[mod.no] || [];
  const terms = termsOf(mod);
  const sameStage = stage.mods.filter(x => x.no !== mod.no);

  /* --- 自检项：步骤 + 判据 + 坑 --- */
  const checks = [];
  steps.forEach(s => checks.push(['步骤', '我已完成：' + s]));
  mod.acc.forEach(a => checks.push(['验收', (a[0] === 'h' ? '我能用命令证明：' : '我能讲清：') + a[1]]));
  checks.push(['避坑', '我确认没有出现：' + mod.pit]);

  /* --- 目录（与实际渲染的章节一一对应） --- */
  const toc = [
    ['s1', '这一讲解决什么'],
    ['s2', '为什么重要'],
    ['s3', `要讲清的 ${mod.pts.length} 件事`],
    ['s4', `照着做：${steps.length} 步`],
    ...(SOP[mod.no] ? [['sop', '完整 SOP']] : []),
    ['s5', '产出物与验收'],
    ['s6', '练习'],
    ['s7', '最容易踩的坑'],
    ['s8', '自检表'],
  ];
  if (terms.length) toc.push(['s9', '本讲术语']);

  // 章节序号自增：插入新章节（如完整 SOP）时不用手改后面每一节的编号
  let sec = 0;
  const num = () => String(++sec).padStart(2, '0');

  const codeHtml = rich.cmd
    ? `<div class="code-wrap">
        <button class="copy" type="button" aria-label="复制命令">复制</button>
        <pre class="code">${esc(rich.cmd).split('\n').map(l => /^\s*#/.test(l) ? `<span class="cm">${l}</span>` : l).join('\n')}</pre>
      </div>`
    : '';

  return `${head({
    title: `${mod.no} ${mod.t} · 从 0 到上线`,
    desc: `${mod.q}。学完能做到：${mod.can}。产出物：${mod.out}（${stage.id} ${stage.name}）`,
    prefix: '../',
    canon: `/lessons/${mod.no}`,
  })}
<body data-page="lesson" data-total="${TOTAL}" data-mod="${mod.no}">
${topbar({ prefix: '../', current: '', home: '../', map: '../map' })}
<a class="skip" href="#main">跳到正文</a>

<div class="shell lesson">
  <div class="lesson-grid">
    <main class="lesson-main" id="main">
      <div class="crumb">
        <a href="../">总览</a><span class="sep">/</span>
        <a href="../map">课程地图</a><span class="sep">/</span>
        <span>${stage.id} ${esc(stage.name)}</span>
      </div>

      <h1><span class="num">${mod.no}</span>${esc(mod.t)}</h1>
      <div class="meta">
        <span class="tag hi">所属路径 ${mod.p.join(' / ')}</span>
        <span class="tag">第 ${i + 1} / ${TOTAL} 讲</span>
        <span class="tag">${stage.id} ${esc(stage.name)}</span>
      </div>

      <section class="lsec" id="s1">
        <div class="lede">
          <div class="q">${esc(mod.q)}</div>
          <div class="ability"><b>学完能</b>${esc(mod.can)}</div>
        </div>
      </section>

      <section class="lsec" id="s2">
        <h2><span class="i">${num()}</span>为什么重要</h2>
        <div class="why">${esc(rich.why || '')}</div>
      </section>

      <section class="lsec" id="s3">
        <h2><span class="i">${num()}</span>要讲清的 ${mod.pts.length} 件事<span class="n">核心要点</span></h2>
        <ul class="pts">
          ${mod.pts.map(p => `<li>${esc(p)}</li>`).join('\n          ')}
        </ul>
      </section>

      <section class="lsec" id="s4">
        <h2><span class="i">${num()}</span>照着做：${steps.length} 步<span class="n">操作顺序</span></h2>
        <ol class="steps">
          ${steps.map(s => `<li>${esc(s)}</li>`).join('\n          ')}
        </ol>
        ${codeHtml}
      </section>

${renderSop(mod, SOP[mod.no] ? num() : '')}
      <section class="lsec" id="s5">
        <h2><span class="i">${num()}</span>产出物与验收<span class="n">做完怎么算过</span></h2>
        <div class="kv2">
          <div class="kv">
            <h3>产出物</h3>
            <p>${esc(mod.out)}</p>
          </div>
          <div class="kv">
            <h3>验收判据</h3>
            ${mod.acc.map(a => `<div class="acc-line"><span class="chip ${a[0]}">${a[0] === 'h' ? '可验' : '人评'}</span><span>${esc(a[1])}</span></div>`).join('\n            ')}
          </div>
        </div>
      </section>

      <section class="lsec" id="s6">
        <h2><span class="i">${num()}</span>练习<span class="n">15 分钟内可做完</span></h2>
        <div class="drill">${esc(mod.drill)}</div>
      </section>

      <section class="lsec" id="s7">
        <h2><span class="i">${num()}</span>最容易踩的坑</h2>
        <div class="pit">${esc(mod.pit)}${rich.cost ? `<div class="cost">后果：${esc(rich.cost)}</div>` : ''}</div>
      </section>

      <section class="lsec" id="s8">
        <h2><span class="i">${num()}</span>自检表<span class="n">进度存在本机浏览器</span></h2>
        <div class="check-top">
          <span class="ptxt" id="ptxt">0 / ${checks.length}</span>
          <span class="pbar"><i id="pbar"></i></span>
        </div>
        <ul class="check">
          ${checks.map((c, k) => `<li><input type="checkbox" id="c${k}" data-k="${k}"><label for="c${k}"><span class="grp">${c[0]}</span>${esc(c[1])}</label></li>`).join('\n          ')}
        </ul>
      </section>
${terms.length ? `
      <section class="lsec" id="s9">
        <h2><span class="i">${num()}</span>本讲术语<span class="n"><a href="../glossary">全部 ${GLOSSARY.length} 条</a></span></h2>
        <ul class="pts">
          ${terms.map(t => `<li><b><a href="../glossary#${t.id}">${esc(t.name)}</a></b>：${esc(t.desc)}</li>`).join('\n          ')}
        </ul>
      </section>
` : ''}
      <div class="pager">
        ${prev ? `<a class="prev" href="${prev.no}"><span class="dir">← 上一讲</span><span class="tt">${prev.no} ${esc(prev.t)}</span></a>` : '<span class="sp"></span>'}
        ${next ? `<a class="next" href="${next.no}"><span class="dir">下一讲 →</span><span class="tt">${next.no} ${esc(next.t)}</span></a>` : '<span class="sp"></span>'}
      </div>
    </main>

    <aside class="rail">
      <div class="blk">
        <p class="rail-h">本讲目录</p>
        <ol class="toc">
          ${toc.map(([id, label]) => `<li><a href="#${id}">${esc(label)}</a></li>`).join('\n          ')}
        </ol>
      </div>
      <div class="blk">
        <p class="rail-h">${stage.id} ${esc(stage.name)}</p>
        <ol>
          ${stage.mods.map(x => `<li><a href="${x.no}"${x.no === mod.no ? ' class="on" aria-current="page"' : ''}>${x.no} ${esc(x.t)}</a></li>`).join('\n          ')}
        </ol>
      </div>
      ${next ? `<div class="blk"><p class="rail-h">下一讲</p><a class="nex" href="${next.no}"><span>${next.no}</span>${esc(next.t)}</a></div>` : ''}
    </aside>
  </div>
</div>

${footer({ prefix: '../', home: '../', map: '../map' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="../assets/app.js"></script>
</body>
</html>
`;
}

/* ============================== 课程地图页（/map） ============================== */

/**
 * 课程地图做成独立页面，而不是首页的 #map 锚点。
 *
 * 原因：锚点地址没法单独分享、也不会被搜索引擎当成一个页面；
 * 而 31 讲本身就是一张需要筛选和搜索的索引，值得有自己的地址。
 * 首页只保留 9 行阶段索引 + 入口，避免同一个列表在两处各维护一遍。
 */
function renderMapPage() {
  const stages = STAGES.map(st => {
    const cards = st.mods.map(modCard).join('\n      ');
    return `<div class="stage" id="${st.id.toLowerCase()}">
      <div class="stage-h">
        <span class="sid">${st.id}</span>
        <h3>${esc(st.name)}</h3>
        <span class="cnt" data-visible>${st.mods.length} 讲</span>
        <span class="ln"></span>
      </div>
      <div class="mod-grid">
      ${cards}
      </div>
    </div>`;
  }).join('\n    ');

  return `${head({
    title: `课程地图 · 从 0 到上线`,
    desc: `${STAGES.length} 个阶段 ${TOTAL} 讲的完整索引，可按学习路径 Q / A / B / C 筛选，也能按关键词搜索。每讲含能力目标、操作步骤、产出物与验收判据。`,
    prefix: './',
    canon: '/map',
  })}
<body data-page="map" data-total="${TOTAL}">
${topbar({ prefix: '', current: 'map', home: './', map: './map' })}
<a class="skip" href="#main">跳到正文</a>

<main id="main">
<section class="hero sm">
  <div class="shell">
    <div class="kicker">Course Map · ${TOTAL} 讲</div>
    <h1>课程地图</h1>
    <p class="lead">${STAGES.length} 个阶段、${TOTAL} 讲。按顺序走是主线；按路径筛，是给「只想先跑通一个站」的人准备的捷径。</p>
  </div>
</section>

<section class="sec" id="list">
  <div class="shell">
    <div class="filters">
      <button class="fbtn" type="button" data-path="ALL" aria-pressed="true">全部<span class="n">${TOTAL}</span></button>
      ${Object.entries(PATHS).map(([k, p]) =>
        `<button class="fbtn${k === 'Q' ? ' qq' : ''}" type="button" data-path="${k}" aria-pressed="false">${esc(p.label)}<span class="n">${PATH_COUNT[k]}</span></button>`).join('\n      ')}
      <input class="search" id="q" type="search" placeholder="搜模块、关键词…" aria-label="搜索模块">
    </div>
    <!-- 阶段标题是 h3、卡片是 h4，中间缺一层 h2 会判为跳级；这里给列表一个（视觉隐藏的）层级 -->
    <h2 class="sr-only">全部 ${TOTAL} 讲</h2>
    <p class="fhint" id="fhint"></p>
    <div id="map-list">
    ${stages}
    </div>
  </div>
</section>
</main>

${footer({ prefix: '', home: './', map: './map' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="assets/app.js"></script>
</body>
</html>
`;
}

/* ============================== 门禁页 ============================== */

function gatesPage() {
  const timeline = FLOW.map(s => `<div class="tl-item${s.gate ? ' gate' : ''}">
      <div class="tl-rail"><span class="tl-dot"></span><span class="tl-line"></span></div>
      <div class="tl-body">
        <span class="t">${esc(s.t)}</span>
        <span class="o">${esc(s.o)}</span>
        <span class="d">${esc(s.d)}</span>
      </div>
    </div>`).join('\n      ');

  const gateRows = GATES.map(([name, sym, cause]) =>
    `<tr><td>${esc(name)}</td><td>${esc(sym)}</td><td>${esc(cause)}</td></tr>`).join('\n        ');

  const drills = STAGES.map(st => {
    const no = st.mods[0].no;
    return `<div class="drill-row">
        <div class="dh"><span class="sid">${st.id}</span><b>${esc(st.name)}</b></div>
        <p>${esc(STAGE_DRILLS[st.id] || '')}</p>
      </div>`;
  }).join('\n      ');

  const redlines = REDLINES.map(r => `<li>${esc(r)}</li>`).join('\n      ');

  return `${head({
    title: '门禁与红线 · 从 0 到上线',
    desc: `关键路径上的四道门禁、${DRILL_COUNT} 次破坏性演练与${cn(REDLINES.length)}条通用红线。卡住时问题不在代码里的那些环节。`,
    prefix: '',
    canon: '/gates',
  })}
<body data-page="gates" data-total="${TOTAL}">
${topbar({ prefix: '', current: 'gates', home: './', map: './map' })}
<a class="skip" href="#main">跳到正文</a>

<main id="main">
<section class="hero sm">
  <div class="shell">
    <div class="kicker">Reference · 随时可查</div>
    <h1>门禁与红线</h1>
    <p class="lead">四道门禁、${DRILL_CN}次破坏性演练、${cn(REDLINES.length)}条红线。这一页不是讲义，是<b>出事时要翻的那一页</b>。</p>
  </div>
</section>

<section class="sec" id="keypath">
  <div class="shell">
    <div class="sec-head"><span class="idx">01</span><h2>关键路径</h2><span class="note">${FLOW.length} 个环节 · ${FLOW.filter(x => x.gate).length} 道门禁</span></div>
    <p class="sec-desc">从立项到维护，每一步都有产出物。<b>门禁的标记不是装饰</b>：它表示这一步卡住时，去改代码是无效动作。</p>
    <div class="card" style="padding:8px 22px">
      <div class="timeline">
      ${timeline}
      </div>
    </div>
  </div>
</section>

<section class="sec" id="gates">
  <div class="shell">
    <div class="sec-head"><span class="idx">02</span><h2>四道门禁的归因</h2></div>
    <p class="sec-desc">共同点：<b>卡住时不是代码问题</b>。把现象和真实原因对上，能省掉一整天的瞎试。</p>
    <div class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>门禁</th><th>卡住的典型现象</th><th>真实原因</th></tr></thead>
        <tbody>
        ${gateRows}
        </tbody>
      </table>
    </div>
  </div>
</section>

<section class="sec" id="drills">
  <div class="shell">
    <div class="sec-head"><span class="idx">03</span><h2>${DRILL_CN}次破坏性演练</h2><span class="note">${DRILL_COUNT} 个阶段，各一次</span></div>
    <p class="sec-desc">人真正学会是靠修，不是靠读。每一讲都有正常路径的练习，这里再补一层：<b>故意搞坏，再修回来</b>。
      ${DRILL_CN}条都是可逆的，且都写明了恢复路径 —— 在测试环境做，别拿生产练手。</p>
    <div class="drills">
      ${drills}
    </div>
  </div>
</section>

<section class="sec" id="redlines">
  <div class="shell">
    <div class="sec-head"><span class="idx">04</span><h2>十一条通用红线</h2><span class="note">不分阶段，全程适用</span></div>
    <p class="sec-desc">这些不是「最佳实践」，是底线。违反其中任何一条，出了问题都不该算意外。</p>
    <ol class="redlines">
      ${redlines}
    </ol>
  </div>
</section>
</main>

${footer({ prefix: '', home: './', map: './map' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="assets/app.js"></script>
</body>
</html>
`;
}

/* ============================== 术语页 ============================== */

function glossaryPage() {
  const items = GLOSSARY.map((g, i) => `<div id="${termId(i)}"><dt>${esc(g[0])}</dt><dd>${esc(g[1])}</dd></div>`).join('\n      ');

  /* 每条术语反查：哪几讲讲到了它 —— 让术语表不只是词典，还能当索引用 */
  const usedIn = GLOSSARY.map((g, i) => {
    const hit = MODULES.filter(m => termsOf(m).some(t => t.id === termId(i)));
    return { name: g[0], id: termId(i), mods: hit };
  });

  const index = usedIn.filter(x => x.mods.length).map(x =>
    `<div class="gi-row"><a class="gi-t" href="#${x.id}">${esc(x.name)}</a><span class="gi-m">${x.mods.map(m => `<a href="lessons/${m.no}">${m.no}</a>`).join('')}</span></div>`
  ).join('\n      ');

  return `${head({
    title: '术语表 · 从 0 到上线',
    desc: `共 ${GLOSSARY.length} 条术语，附出处讲次与反查索引。凡本站自造的词（门禁、打通、假绿、哨兵）都在这里有定义 —— 自造的词必须在使用处给定义。`,
    prefix: '',
    canon: '/glossary',
  })}
<body data-page="glossary" data-total="${TOTAL}">
${topbar({ prefix: '', current: 'glossary', home: './', map: './map' })}
<a class="skip" href="#main">跳到正文</a>

<main id="main">
<section class="hero sm">
  <div class="shell">
    <div class="kicker">Reference · 术语</div>
    <h1>术语表</h1>
    <p class="lead">共 ${GLOSSARY.length} 条。凡本站自造的词（门禁、打通、假绿、哨兵…），这里都有定义 —— 这是第 ${REDLINES.length} 条红线：<b>自造的词必须在使用处给定义，否则就是给别人留债</b>。</p>
  </div>
</section>

<section class="sec" id="list">
  <div class="shell">
    <div class="gloss">
      ${items}
    </div>
  </div>
</section>

<section class="sec" id="index">
  <div class="shell">
    <div class="sec-head"><span class="idx">02</span><h2>按术语找讲次</h2><span class="note">${index ? usedIn.filter(x => x.mods.length).length : 0} 条有出处</span></div>
    <p class="sec-desc">记不住术语在哪讲的，从这里反查。</p>
    <div class="gloss-index">
      ${index}
    </div>
  </div>
</section>
</main>

${footer({ prefix: '', home: './', map: './map' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="assets/app.js"></script>
</body>
</html>
`;
}

/* ============================== 404 ============================== */

/**
 * 真 404 页。多页站不能回落首页：那会让不存在的地址返回 200 + 首页内容，
 * 既误导访客也损害 SEO（M15 讲的正是这条）。所以这里给真 404，nginx 用 error_page 指过来。
 */
function notFoundPage() {
  const hot = ['M01', 'M11', 'M17', 'M31'];
  const hotCards = hot.map(no => {
    const m = MODULES.find(x => x.no === no);
    return `<a class="mod" href="/lessons/${m.no}"><span class="no">${m.no}</span><h3>${esc(m.t)}</h3><p>${esc(m.q)}</p></a>`;
  }).join('\n      ');

  return `${head({
    title: '页面不存在 · 从 0 到上线',
    desc: '这个地址没有对应页面 —— 可能是链接打错了一个字，也可能这页还没写。回到课程总览，或从下面这几讲开始。',
    prefix: '/',
    canon: '/404',
    extra: '<meta name="robots" content="noindex">',
  })}
<body data-page="404" data-total="${TOTAL}">
${topbar({ prefix: '/', current: '', home: '/', map: '/map' })}
<a class="skip" href="#main">跳到正文</a>

<main id="main">
<section class="hero sm">
  <div class="shell">
    <div class="kicker">404 · Not Found</div>
    <h1>这个地址没有页面</h1>
    <p class="lead">可能是链接打错了一个字，也可能这页还没写。下面三个入口都能回到正题。</p>
    <div class="cta">
      <a class="btn btn-primary" href="/">回课程总览 <span class="ar">→</span></a>
      <a class="btn btn-ghost" href="/map">看课程地图</a>
      <a class="btn btn-ghost" href="/glossary">术语表</a>
    </div>
  </div>
</section>

<section class="sec">
  <div class="shell">
    <div class="sec-head"><span class="idx">→</span><h2>常被直接访问的几讲</h2></div>
    <div class="mod-grid">
      ${hotCards}
    </div>
  </div>
</section>
</main>

${footer({ prefix: '/', home: '/', map: '/map' })}
<script src="/assets/app.js"></script>
</body>
</html>
`;
}

/* ============================== 输出 ============================== */

function write(rel, html) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html, 'utf8');
  return html.length;
}

fs.mkdirSync(path.join(OUT, 'lessons'), { recursive: true });

let bytes = 0;
const files = [];

bytes += write('index.html', renderHome()); files.push('index.html');
STAGES.forEach(st => st.mods.forEach(m => {
  const f = path.join('lessons', m.no + '.html');
  bytes += write(f, lessonPage(m, st));
  files.push(f);
}));
bytes += write('gates.html', gatesPage()); files.push('gates.html');
bytes += write('glossary.html', glossaryPage()); files.push('glossary.html');
bytes += write('map.html', renderMapPage()); files.push('map.html');
bytes += write('404.html', notFoundPage()); files.push('404.html');

/* ---- sitemap.xml / robots.txt：M13 与 M29 都在讲它们，本站自己没有就说不过去 ---- */
const smEntries = [
  { loc: '/', pri: '1.0' },
  { loc: '/map', pri: '0.9' },
  { loc: '/gates', pri: '0.8' },
  { loc: '/glossary', pri: '0.7' },
  ...MODULES.map(m => ({ loc: `/lessons/${m.no}`, pri: '0.6' })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${smEntries.map(u => `  <url>
    <loc>${SITE_ORIGIN}${u.loc}</loc>
    <lastmod>${META.date}</lastmod>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap, 'utf8');

fs.writeFileSync(path.join(OUT, 'robots.txt'),
  `# 从 0 到上线 · 网站建设实训课
User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`, 'utf8');

/* favicon：与顶栏 Logo 共用同一段 GLOBE 几何，不另写一份 */
fs.writeFileSync(path.join(OUT, 'assets', 'favicon.svg'), FAVICON_SVG, 'utf8');

/* ============================== 自检 ============================== */

const checks = [];
const need = ['index.html', 'map.html', 'gates.html', 'glossary.html', '404.html',
  'sitemap.xml', 'robots.txt',
  ...MODULES.map(m => `lessons/${m.no}.html`)];
checks.push([`页面数 = ${TOTAL + 5}`, files.length === TOTAL + 5]);
checks.push(['文件全部落盘', need.every(f => fs.existsSync(path.join(OUT, f)))]);
const home = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const mapHtml = fs.readFileSync(path.join(OUT, 'map.html'), 'utf8');
// 31 张卡在 /map 上（首页只剩 9 行阶段索引），这两项自检跟着搬过去
checks.push([`地图页含全部 ${TOTAL} 张卡`, (mapHtml.match(/class="mod" href=/g) || []).length === TOTAL]);
checks.push(['地图页路径计数与数据一致', Object.entries(PATH_COUNT).every(([k]) => mapHtml.includes(`data-path="${k}"`))]);
checks.push(['首页只放阶段索引，不再重复卡片', !/class="mod" href=/.test(home)]);
const m01 = fs.readFileSync(path.join(OUT, 'lessons', 'M01.html'), 'utf8');
checks.push(['讲义页带 data-mod', m01.includes('data-mod="M01"')]);
checks.push(['讲义页无「待补充」', !m01.includes('待补充')]);
const allLessons = MODULES.map(m => fs.readFileSync(path.join(OUT, 'lessons', m.no + '.html'), 'utf8'));
checks.push([`${TOTAL} 讲都含自检表`, allLessons.every(h => h.includes('class="check"'))]);
checks.push([`${TOTAL} 讲都含返回总览`, allLessons.every(h => h.includes('class="crumb"') && h.includes('<a href="../">总览</a>'))]);
// 全站统一干净 URL：页面里不该再出现 .html 的站内链接（文件本身仍是 .html）
const allHtml = [...allLessons, home, mapHtml,
  fs.readFileSync(path.join(OUT, 'gates.html'), 'utf8'),
  fs.readFileSync(path.join(OUT, 'glossary.html'), 'utf8')];
checks.push(['全站链接不再带 .html', allHtml.every(h =>
  !/(href|src)="(?![a-z]+:)[^"]*\.html(#[^"]*)?"/i.test(h))]);
// 顶栏 Logo 与页签图标必须同源：两边都含同一段赤道路径，改一处忘一处会在这里报
const fav = fs.readFileSync(path.join(OUT, 'assets', 'favicon.svg'), 'utf8');
checks.push(['页签图标与顶栏 Logo 同源', fav.includes('M6.6 16h6.3M19.1 16h6.3') && home.includes('M6.6 16h6.3M19.1 16h6.3')]);

let bad = 0;
console.log('生成完成：');
for (const [name, ok] of checks) { console.log(`  ${ok ? '✓' : '✗'} ${name}`); if (!ok) bad++; }
console.log(`\n  ${files.length} 个 HTML · ${(bytes / 1024).toFixed(0)} KB · 输出 ${path.relative(ROOT, OUT)}/`);
if (bad) { console.error(`\n${bad} 项未通过`); process.exit(1); }
console.log('  本地预览：node serve.mjs  或直接双击 site/index.html');
