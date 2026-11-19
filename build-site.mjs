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
/** 行内强调：只认 **加粗**。先 esc 再替换，文字里的 < > 不会被当成标签 */
const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

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

/* 2026-11-10 站群统一口径：底部条的 GitHub 图标 + 外链已移除（原先此处定义 GITHUB_ICON）。
   生成器不再输出 GitHub 链接与图标；Pages 兜底通道仍保留，只是页面不做外链。 */

/* 返回站群入口用的房子图标（2026-11-02 新增）。
   取 lucide 的 `House` 路径而非 `Home` —— lucide 新版已把 Home 改名为 House，
   与站内 React 站点的 `<House />` 保持同一图形。
   注意 fill="none" + stroke：lucide 图标是描边风格，与上面的 GitHub 实心标记不同。 */
const HOUSE_ICON = `<svg class="back-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;

/* ============================== 站点身份 / 合规信息 ============================== */

/** 规范域：裸域与 www 都在服务器上配了，但对外只认 www（301 归一）。
 *  canonical / sitemap / og:url 全部用这一个，别处不要再写死域名。 */
const SITE_ORIGIN = 'https://www.web-training.power-knowledge.tech';
/* 2026-11-10：原 REPO_URL（GitHub 源码仓库外链）已按站群统一口径移除。 */

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
<script>
/* 首屏防闪：body 渲染前把上次选的主题盖到 <html> 上。
   校验规则必须与 assets/app.js 里的 current() 一致：?theme= → localStorage → 默认。 */
(function () {
  var IDS = ['dark-teal', 'blue', 'navy-tech', 'graphite', 'warm-paper', 'forest', 'indigo', 'sea-salt']
  try {
    var q = new URLSearchParams(location.search).get('theme')
    var v = IDS.indexOf(q) >= 0 ? q : localStorage.getItem('pk-theme')
    if (IDS.indexOf(v) >= 0) document.documentElement.dataset.theme = v
  } catch (e) {}
})()
</script>
${extra}<link rel="stylesheet" href="${prefix}assets/style.css">
</head>`;
}

/**
 * 产物是目录式：map/index.html、lessons/M01/index.html。
 * 这样 nginx 和 GitHub Pages（纯文件托管、不做无扩展名路由）都能用同一个干净地址。
 * base = 当前页回到站点根的相对前缀：首页 ''、一级页 '../'、讲义 '../../'、404 用 '/'。
 */
function links(base) {
  return {
    home: base || './',
    map: base + 'map/',
    gates: base + 'gates/',
    glossary: base + 'glossary/',
    feedback: base + 'feedback/',
    lesson: no => base + 'lessons/' + no + '/',
  };
}

function topbar({ base, current }) {
  const L = links(base);
  const item = (href, label, key) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="topbar">
  <div class="shell">
    <a class="brand" href="${L.home}">
      ${BRAND_SVG}
      <b>从 0 到上线</b>
      <em>网站建设实训课</em>
    </a>
    <nav class="nav" aria-label="主导航">
      ${item(L.home, '总览', 'home')}
      ${item(L.map, '课程地图', 'map')}
      ${item(L.gates, '门禁与红线', 'gates')}
      ${item(L.glossary, '术语表', 'glossary')}
      ${item(L.feedback, '留言', 'feedback')}
    </nav>
    <!-- 站群入口（2026-11-10）：参照 control-mode / motor-lighting / english 三站，
         房子图标 + 「站群入口」位于页眉右侧主题切换器之前，链接总入口且不开新标签页。
         页脚「返回站群入口」保留不动。 -->
    <a class="group-entry" href="https://power-knowledge.tech/" title="返回 power-knowledge.tech 站群入口">
      ${HOUSE_ICON}<span>站群入口</span>
    </a>
    <div class="theme-picker">
      <button type="button" class="theme-btn" data-theme-btn aria-haspopup="menu" aria-expanded="false" aria-label="页面风格">
        <span class="theme-dot" data-theme-dot></span>
        <span class="label">风格</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <div class="theme-menu" data-theme-menu role="menu" hidden></div>
    </div>
    <span class="pill" data-progress hidden>
      <i><span data-pbar></span></i>
      <span data-ptxt>已学 0 / ${TOTAL}</span>
    </span>
  </div>
</header>`;
}

function footer({ prefix, base }) {
  const L = links(base);
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
        <!-- 返回站群入口（2026-11-02 新增）：本站是 power-knowledge.tech 站群的子站，
             此前回总入口只能靠浏览器后退或手改地址。放在品牌列备案信息下方，
             与 AHB / widget / LLC / interleaved 四站的「页脚品牌列」位置保持一致。 -->
        <a class="back" href="https://power-knowledge.tech/" target="_blank" rel="noopener noreferrer">${HOUSE_ICON}返回站群入口</a>
      </div>
      <div>
        <div class="links">
          <a href="${L.home}">总览</a>
          <a href="${L.map}">课程地图</a>
          <a href="${L.gates}">门禁与红线</a>
          <a href="${L.glossary}">术语表</a>
          <a href="${L.feedback}">留言</a>
        </div>
      </div>
    </div>

    <!-- 底部条：左版权、右版本号。2026-11-10 按站群统一口径移除右侧 GitHub 图标 + 外链。
         版本号只读 META.version，与页脚上方不再重复。 -->
    <div class="bar">
      <span class="cr">© ${esc(META.date.slice(0, 4))} 从 0 到上线 · 网站建设实训课</span>
      <span class="meta-right">
        <span class="ver" title="站点版本号（源：data/course.mjs 的 META.version）">${esc(META.version)}</span>
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
  return `<a class="mod" href="../lessons/${m.no}/" data-mod="${m.no}" data-p="${m.p.join(' ')}" data-kw="${esc(kw)}">
        <span class="no">${m.no} · ${pad2(idx + 1)}/${TOTAL}</span>
        <h4>${esc(m.t)}</h4>
        <p>${esc(m.q)}</p>
        <span class="tags">${tags}</span>
      </a>`;
}

function renderHome() {
  // 首页只放 9 行阶段索引，31 张卡在 /map —— 首页原先是 7700px 长，主要就是这堆卡撑的
  const stageIndex = STAGES.map(st => `<a class="si" href="map/#${st.id.toLowerCase()}">
      <span class="si-id">${st.id}</span>
      <span class="si-body">
        <span class="si-name">${esc(st.name)}<b>${st.mods.length} 讲</b></span>
        <span class="si-mods">${st.mods.map(m => `${m.no} ${esc(m.t)}`).join(' · ')}</span>
      </span>
    </a>`).join('\n      ');

  const pathCards = Object.entries(PATHS).map(([k, p]) => {
    const chips = p.mods.map(no => `<a href="lessons/${no}/">${no}</a>`).join('');
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
${topbar({ base: '', current: 'home' })}
<a class="skip" href="#main">跳到正文</a>

<main id="main">
<section class="hero">
  <div class="shell">
    <div class="kicker">Power Knowledge · 实训课</div>
    <h1>从 0 到上线<br><span class="grad">网站建设实训课</span></h1>
    <p class="lead">一条<b>能照做跑通</b>的完整链路：本地 → 仓库 → 服务器 → 域名 → 备案 → 上线 → 维护。
      及格线只有一条 —— <b>${esc(PASS_LINE.replace(/。$/, ''))}</b>。</p>
    <div class="cta">
      <a class="btn btn-primary" href="lessons/M01/">从第 1 讲开始 <span class="ar">→</span></a>
      <a class="btn btn-ghost" href="map/">看课程地图</a>
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
      <a class="btn btn-primary" href="map/">打开完整课程地图 <span class="ar">→</span></a>
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
      <a class="btn btn-ghost" href="gates/">四道门禁的归因表 + ${DRILL_CN}次破坏性演练 <span class="ar">→</span></a>
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
      <a class="btn btn-ghost" href="glossary/">全部 ${GLOSSARY.length} 条术语 <span class="ar">→</span></a>
    </div>
  </div>
</section>
</main>

${footer({ prefix: '', base: '' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="assets/app.js"></script>
</body>
</html>
`;
}


/* 术语表的分组：先按课程阶段，再按设计类别（D1–D8，来自《网页设计与开发专有名词速查表》） */
const D_CATS = [
  ['D1', '页面视觉元素与品牌资产'],
  ['D2', '布局与结构'],
  ['D3', '排版与字体'],
  ['D4', '技术实现与文件'],
  ['D5', '交互、状态与无障碍'],
  ['D6', '设计流程与协作'],
  ['D7', '营销落地页与内容'],
  ['D8', '性能与 SEO 度量'],
];

/**
 * 示意图：只给「光看文字想不出来」的词条配。
 * 全部用内联 SVG + CSS 变量，跟着主题换色，不额外请求图片，
 * 也不受深色/浅色模式影响可读性（线条用 currentColor 系）。
 */
const FIGURES = {
  '首屏区块（Hero Section）': `<svg viewBox="0 0 480 148" role="img" aria-label="首屏区块示意">
    <rect x="6" y="6" width="468" height="136" rx="9" fill="none" stroke="var(--border)" stroke-width="1.4"/>
    <path d="M6 30h468" stroke="var(--border)" stroke-width="1.4"/>
    <circle cx="20" cy="18" r="3.2" fill="var(--text-3)" opacity=".45"/><circle cx="31" cy="18" r="3.2" fill="var(--text-3)" opacity=".3"/><circle cx="42" cy="18" r="3.2" fill="var(--text-3)" opacity=".3"/>
    <rect x="18" y="40" width="444" height="66" rx="6" fill="var(--brand-light)" opacity=".13" stroke="var(--brand-light)" stroke-width="1.2" stroke-dasharray="4 3"/>
    <text x="240" y="66" text-anchor="middle" font-size="11.5" fill="var(--brand-light)">首屏区块 Hero Section</text>
    <text x="240" y="83" text-anchor="middle" font-size="9.5" fill="var(--text-3)">大图 + 标题 + 副标 + CTA 的组合</text>
    <rect x="196" y="89" width="88" height="13" rx="6.5" fill="var(--brand-light)" opacity=".28"/>
    <text x="240" y="99" text-anchor="middle" font-size="8.5" fill="var(--text)">CTA 按钮</text>
    <rect x="18" y="114" width="150" height="8" rx="4" fill="var(--text-3)" opacity=".22"/>
    <rect x="18" y="127" width="108" height="8" rx="4" fill="var(--text-3)" opacity=".14"/>
    <text x="462" y="126" text-anchor="end" font-size="9" fill="var(--text-3)">↓ 首屏以下内容</text>
  </svg>`,

  '模态窗口（Modal Window）': `<svg viewBox="0 0 480 148" role="img" aria-label="模态窗口示意">
    <rect x="6" y="6" width="468" height="136" rx="9" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <rect x="6" y="6" width="468" height="136" rx="9" fill="#000" opacity=".38"/>
    <rect x="24" y="26" width="120" height="9" rx="4" fill="var(--text-3)" opacity=".45"/>
    <rect x="24" y="44" width="200" height="7" rx="3.5" fill="var(--text-3)" opacity=".28"/>
    <rect x="24" y="60" width="170" height="7" rx="3.5" fill="var(--text-3)" opacity=".28"/>
    <rect x="140" y="34" width="200" height="86" rx="8" fill="var(--surface)" stroke="var(--brand-light)" stroke-width="1.5"/>
    <rect x="140" y="34" width="200" height="22" rx="8" fill="var(--brand-light)" opacity=".14"/>
    <text x="152" y="49" font-size="9.5" fill="var(--brand-light)">模态窗口 Modal</text>
    <path d="M320 41l7 7M327 41l-7 7" stroke="var(--text-3)" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="152" y="66" width="130" height="6" rx="3" fill="var(--text-3)" opacity=".3"/>
    <rect x="152" y="78" width="100" height="6" rx="3" fill="var(--text-3)" opacity=".2"/>
    <rect x="252" y="95" width="76" height="16" rx="8" fill="var(--brand-light)" opacity=".3"/>
    <text x="268" y="106" font-size="8.5" fill="var(--text)">确认</text>
    <text x="380" y="130" text-anchor="end" font-size="9" fill="#fff" opacity=".75">背后的页面被遮住且不可点</text>
  </svg>`,

  '灯箱（Lightbox）': `<svg viewBox="0 0 480 148" role="img" aria-label="灯箱示意">
    <g fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2">
      <rect x="10" y="20" width="52" height="36" rx="4"/><rect x="70" y="20" width="52" height="36" rx="4"/>
      <rect x="10" y="64" width="52" height="36" rx="4"/><rect x="70" y="64" width="52" height="36" rx="4"/>
    </g>
    <text x="36" y="122" text-anchor="middle" font-size="9" fill="var(--text-3)">缩略图列表</text>
    <path d="M132 74h26m0 0-7-7m7 7-7 7" stroke="var(--brand-light)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <text x="145" y="122" text-anchor="middle" font-size="9" fill="var(--text-3)">点击</text>
    <rect x="170" y="10" width="300" height="120" rx="8" fill="#000" opacity=".42"/>
    <rect x="196" y="26" width="212" height="72" rx="5" fill="var(--surface)" stroke="var(--brand-light)" stroke-width="1.4"/>
    <path d="M196 98l50-40 40 28 34-22 88 34" stroke="var(--brand-light)" stroke-width="1.3" fill="none" opacity=".55"/>
    <circle cx="242" cy="48" r="9" fill="var(--brand-light)" opacity=".25"/>
    <path d="M432 22l8 8M440 22l-8 8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
    <text x="302" y="118" text-anchor="middle" font-size="9" fill="#fff" opacity=".8">遮罩之上放大显示，ESC / 点遮罩关闭</text>
  </svg>`,

  '角标 / 徽标（Badge）': `<svg viewBox="0 0 480 148" role="img" aria-label="角标示意">
    <rect x="60" y="40" width="72" height="72" rx="16" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <path d="M84 84V64a12 12 0 0 1 24 0v20" stroke="var(--text-3)" stroke-width="2" fill="none"/>
    <circle cx="128" cy="44" r="12" fill="#ef4444"/>
    <text x="128" y="48" text-anchor="middle" font-size="10" fill="#fff">3</text>
    <text x="96" y="132" text-anchor="middle" font-size="9" fill="var(--text-3)">计数角标</text>
    <rect x="220" y="52" width="72" height="48" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <rect x="262" y="44" width="40" height="16" rx="8" fill="var(--brand-light)" opacity=".9"/>
    <text x="282" y="55" text-anchor="middle" font-size="8.5" fill="#04211d" font-weight="600">NEW</text>
    <text x="256" y="132" text-anchor="middle" font-size="9" fill="var(--text-3)">状态徽标</text>
    <text x="352" y="66" font-size="10" fill="var(--text-3)">挂在角上，</text>
    <text x="352" y="82" font-size="10" fill="var(--text-3)">不占布局空间，</text>
    <text x="352" y="98" font-size="10" fill="var(--text-3)">所以别用它承载</text>
    <text x="352" y="114" font-size="10" fill="var(--text-3)">关键信息。</text>
  </svg>`,

  '头像（Avatar）': `<svg viewBox="0 0 480 148" role="img" aria-label="头像三种形态">
    <circle cx="90" cy="60" r="34" fill="var(--brand-light)" opacity=".18" stroke="var(--brand-light)" stroke-width="1.4"/>
    <circle cx="90" cy="50" r="12" fill="var(--brand-light)" opacity=".55"/>
    <path d="M68 84a22 22 0 0 1 44 0" fill="var(--brand-light)" opacity=".4"/>
    <text x="90" y="118" text-anchor="middle" font-size="9" fill="var(--text-3)">有照片</text>
    <circle cx="215" cy="60" r="34" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.4"/>
    <text x="215" y="68" text-anchor="middle" font-size="18" fill="var(--text-2)">ZH</text>
    <text x="215" y="118" text-anchor="middle" font-size="9" fill="var(--text-3)">无照片：首字母兜底</text>
    <circle cx="340" cy="60" r="34" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.4"/>
    <circle cx="340" cy="50" r="10" fill="var(--text-3)" opacity=".45"/>
    <path d="M320 82a20 20 0 0 1 40 0" fill="var(--text-3)" opacity=".3"/>
    <text x="340" y="118" text-anchor="middle" font-size="9" fill="var(--text-3)">连首字母都没有：剪影</text>
    <text x="418" y="56" font-size="9.5" fill="var(--text-3)">三档兜底</text>
    <text x="418" y="72" font-size="9.5" fill="var(--text-3)">缺一档就露</text>
    <text x="418" y="88" font-size="9.5" fill="var(--text-3)">出破图</text>
  </svg>`,

  '网格系统（Grid System）': `<svg viewBox="0 0 480 148" role="img" aria-label="栅格系统示意">
    <g fill="var(--brand-light)" opacity=".16">
      <rect x="16" y="30" width="26" height="56" rx="2"/><rect x="54" y="30" width="26" height="56" rx="2"/>
      <rect x="92" y="30" width="26" height="56" rx="2"/><rect x="130" y="30" width="26" height="56" rx="2"/>
      <rect x="168" y="30" width="26" height="56" rx="2"/><rect x="206" y="30" width="26" height="56" rx="2"/>
      <rect x="244" y="30" width="26" height="56" rx="2"/><rect x="282" y="30" width="26" height="56" rx="2"/>
      <rect x="320" y="30" width="26" height="56" rx="2"/><rect x="358" y="30" width="26" height="56" rx="2"/>
      <rect x="396" y="30" width="26" height="56" rx="2"/><rect x="434" y="30" width="26" height="56" rx="2"/>
    </g>
    <rect x="16" y="100" width="120" height="18" rx="3" fill="var(--brand-light)" opacity=".45"/>
    <rect x="148" y="100" width="120" height="18" rx="3" fill="var(--brand-light)" opacity=".3"/>
    <rect x="280" y="100" width="180" height="18" rx="3" fill="var(--brand-light)" opacity=".2"/>
    <path d="M42 22h12M60 18v8M42 18v8" stroke="var(--text-3)" stroke-width="1"/>
    <text x="240" y="18" text-anchor="middle" font-size="9" fill="var(--text-3)">12 栏 · 栏宽一致 · 间距（gutter）固定</text>
    <text x="76" y="134" text-anchor="middle" font-size="9" fill="var(--text-3)">3 栏</text>
    <text x="208" y="134" text-anchor="middle" font-size="9" fill="var(--text-3)">3 栏</text>
    <text x="370" y="134" text-anchor="middle" font-size="9" fill="var(--text-3)">6 栏</text>
  </svg>`,

  /* ---- 布局与结构（D2）---- */
  '容器（Container）': `<svg viewBox="0 0 480 148" role="img" aria-label="固定宽度容器示意">
    <rect x="6" y="10" width="468" height="128" rx="8" fill="none" stroke="var(--border)" stroke-width="1.3" stroke-dasharray="4 3"/>
    <text x="16" y="25" font-size="9" fill="var(--text-3)">视口 viewport</text>
    <rect x="96" y="34" width="288" height="78" rx="6" fill="var(--brand-light)" opacity=".11" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="240" y="58" text-anchor="middle" font-size="11" fill="var(--brand-light)">容器 Container</text>
    <text x="240" y="74" text-anchor="middle" font-size="9" fill="var(--text-2)">max-width: 1200px; margin: auto</text>
    <g fill="var(--text-3)" opacity=".26">
      <rect x="110" y="88" width="60" height="14" rx="3"/><rect x="178" y="88" width="60" height="14" rx="3"/>
      <rect x="246" y="88" width="60" height="14" rx="3"/><rect x="314" y="88" width="56" height="14" rx="3"/>
    </g>
    <path d="M96 122h288M96 118v8M384 118v8" stroke="var(--text-3)" stroke-width="1"/>
    <text x="240" y="140" text-anchor="middle" font-size="9" fill="var(--text-3)">视口越宽，两侧留白越多；内容宽度不跟着无限拉长</text>
  </svg>`,

  '面包屑（Breadcrumb）': `<svg viewBox="0 0 480 148" role="img" aria-label="面包屑导航示意">
    <rect x="6" y="6" width="468" height="136" rx="9" fill="var(--surface-2)" opacity=".45" stroke="var(--border)" stroke-width="1.2"/>
    <text x="20" y="34" font-size="11" fill="var(--text-3)">首页</text>
    <path d="M50 29l5 5-5 5" stroke="var(--text-3)" stroke-width="1.4" fill="none"/>
    <text x="64" y="34" font-size="11" fill="var(--text-3)">课程</text>
    <path d="M94 29l5 5-5 5" stroke="var(--text-3)" stroke-width="1.4" fill="none"/>
    <text x="108" y="34" font-size="11" fill="var(--text-3)">M23</text>
    <path d="M140 29l5 5-5 5" stroke="var(--text-3)" stroke-width="1.4" fill="none"/>
    <text x="154" y="34" font-size="11" fill="var(--brand-light)">术语表</text>
    <path d="M20 50h440" stroke="var(--border)" stroke-width="1.2"/>
    <text x="20" y="72" font-size="10" fill="var(--text-2)">除了最后一级，每一级都是能点回去的链接</text>
    <text x="154" y="72" font-size="10" fill="var(--brand-light)">← 当前位置，不可点</text>
    <g fill="var(--text-3)" opacity=".24">
      <rect x="20" y="88" width="180" height="9" rx="4"/><rect x="20" y="104" width="420" height="7" rx="3.5"/>
      <rect x="20" y="118" width="380" height="7" rx="3.5"/>
    </g>
  </svg>`,

  '抽屉（Drawer）': `<svg viewBox="0 0 480 148" role="img" aria-label="侧边抽屉示意">
    <rect x="6" y="10" width="468" height="128" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="6" y="10" width="314" height="128" rx="8" fill="#000" opacity=".34"/>
    <g fill="var(--text-3)" opacity=".3">
      <rect x="20" y="28" width="120" height="9" rx="4"/><rect x="20" y="48" width="240" height="7" rx="3.5"/>
      <rect x="20" y="64" width="210" height="7" rx="3.5"/><rect x="20" y="80" width="228" height="7" rx="3.5"/>
    </g>
    <path d="M292 74h26m0 0-8-7m8 7-8 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <rect x="322" y="10" width="152" height="128" rx="8" fill="var(--surface)" stroke="var(--brand-light)" stroke-width="1.5"/>
    <text x="336" y="34" font-size="10.5" fill="var(--brand-light)">抽屉 Drawer</text>
    <path d="M455 25l8 8M463 25l-8 8" stroke="var(--text-3)" stroke-width="1.6" stroke-linecap="round"/>
    <g fill="var(--text-3)" opacity=".3">
      <rect x="336" y="50" width="110" height="7" rx="3.5"/><rect x="336" y="66" width="92" height="7" rx="3.5"/>
      <rect x="336" y="82" width="104" height="7" rx="3.5"/>
    </g>
    <text x="398" y="124" text-anchor="middle" font-size="9" fill="var(--text-3)">从边缘滑入，不跳页</text>
  </svg>`,

  '手风琴 / 折叠面板（Accordion）': `<svg viewBox="0 0 480 148" role="img" aria-label="折叠面板展开与收起示意">
    <rect x="26" y="12" width="428" height="30" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="40" y="32" font-size="10.5" fill="var(--text-2)">1. 什么是门禁？</text>
    <path d="M436 22v10M431 27h10" stroke="var(--text-3)" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="26" y="48" width="428" height="30" rx="6" fill="var(--brand-light)" opacity=".13" stroke="var(--brand-light)" stroke-width="1.3"/>
    <text x="40" y="68" font-size="10.5" fill="var(--brand-light)">2. 怎么过门禁？</text>
    <path d="M431 63h10" stroke="var(--brand-light)" stroke-width="1.5" stroke-linecap="round"/>
    <g fill="var(--text-3)" opacity=".3">
      <rect x="42" y="88" width="396" height="6" rx="3"/><rect x="42" y="100" width="350" height="6" rx="3"/>
    </g>
    <rect x="26" y="114" width="428" height="26" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="40" y="131" font-size="10.5" fill="var(--text-2)">3. 门禁失败怎么办？</text>
    <path d="M436 121v10M431 126h10" stroke="var(--text-3)" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  '选项卡（Tabs）': `<svg viewBox="0 0 480 148" role="img" aria-label="选项卡切换示意">
    <path d="M30 40h110M150 40h100M260 40h100" stroke="var(--border)" stroke-width="1.2"/>
    <text x="85" y="36" text-anchor="middle" font-size="10.5" fill="var(--text-3)">概览</text>
    <text x="200" y="36" text-anchor="middle" font-size="10.5" fill="var(--brand-light)">步骤</text>
    <path d="M150 42h100" stroke="var(--brand-light)" stroke-width="2.4"/>
    <text x="310" y="36" text-anchor="middle" font-size="10.5" fill="var(--text-3)">验收</text>
    <rect x="30" y="54" width="420" height="80" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="44" y="76" font-size="10.5" fill="var(--text-2)">选中「步骤」时，下面只显示步骤面板</text>
    <g fill="var(--text-3)" opacity=".28">
      <rect x="44" y="88" width="380" height="7" rx="3.5"/><rect x="44" y="102" width="340" height="7" rx="3.5"/>
      <rect x="44" y="116" width="286" height="7" rx="3.5"/>
    </g>
    <text x="240" y="145" text-anchor="middle" font-size="9" fill="var(--text-3)">同一时刻只露一个面板</text>
  </svg>`,

  '断点（Breakpoint）': `<svg viewBox="0 0 480 148" role="img" aria-label="响应式断点示意">
    <rect x="14" y="26" width="92" height="82" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <text x="60" y="72" text-anchor="middle" font-size="10" fill="var(--text-3)">1 栏</text>
    <text x="60" y="124" text-anchor="middle" font-size="9" fill="var(--text-3)">&lt; 768</text>
    <rect x="132" y="26" width="130" height="82" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <text x="197" y="72" text-anchor="middle" font-size="10" fill="var(--text-3)">2 栏</text>
    <text x="197" y="124" text-anchor="middle" font-size="9" fill="var(--brand-light)">≥ 768</text>
    <rect x="288" y="26" width="178" height="82" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <text x="377" y="72" text-anchor="middle" font-size="10" fill="var(--text-3)">3 栏</text>
    <text x="377" y="124" text-anchor="middle" font-size="9" fill="var(--brand-light)">≥ 1024</text>
    <path d="M112 16v100M270 16v100" stroke="var(--brand-light)" stroke-width="1.2" stroke-dasharray="3 3" opacity=".7"/>
    <text x="240" y="10" text-anchor="middle" font-size="9" fill="var(--text-3)">断点是「布局换挡」的宽度，不是设备型号</text>
  </svg>`,

  '骨架屏（Skeleton Screen）': `<svg viewBox="0 0 480 148" role="img" aria-label="骨架屏占位示意">
    <rect x="10" y="14" width="200" height="120" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="110" y="32" text-anchor="middle" font-size="9.5" fill="var(--text-3)">加载中：骨架屏</text>
    <rect x="24" y="44" width="56" height="56" rx="6" fill="var(--text-3)" opacity=".25"/>
    <g fill="var(--text-3)" opacity=".25"><rect x="92" y="48" width="100" height="8" rx="4"/><rect x="92" y="64" width="76" height="8" rx="4"/><rect x="24" y="112" width="168" height="8" rx="4"/></g>
    <path d="M226 74h28m0 0-8-7m8 7-8 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <rect x="270" y="14" width="200" height="120" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="370" y="32" text-anchor="middle" font-size="9.5" fill="var(--text-3)">加载完：真实内容</text>
    <rect x="284" y="44" width="56" height="56" rx="6" fill="var(--brand-light)" opacity=".3"/>
    <circle cx="312" cy="68" r="9" fill="var(--brand-light)" opacity=".45"/>
    <g fill="var(--text-2)" opacity=".65"><rect x="352" y="48" width="100" height="8" rx="4"/><rect x="352" y="64" width="76" height="8" rx="4"/><rect x="284" y="112" width="168" height="8" rx="4"/></g>
    <text x="370" y="145" text-anchor="middle" font-size="9" fill="var(--text-3)">先给形状，避免内容到位时页面猛地一跳</text>
  </svg>`,

  /* ---- 排版与字体（D3）---- */
  '基线（Baseline）': `<svg viewBox="0 0 480 148" role="img" aria-label="字体基线与上下伸部示意">
    <g stroke-dasharray="4 4" stroke-width="1">
      <path d="M24 44h400" stroke="var(--text-3)" opacity=".5"/>
      <path d="M24 62h400" stroke="var(--brand-light)" opacity=".6"/>
      <path d="M24 90h400" stroke="var(--brand-light)" stroke-width="1.6"/>
      <path d="M24 106h400" stroke="var(--text-3)" opacity=".5"/>
    </g>
    <text x="40" y="94" font-size="44" fill="var(--text)">Hg 网</text>
    <text x="440" y="40" text-anchor="end" font-size="9" fill="var(--text-3)">上伸部线 Ascender</text>
    <text x="440" y="58" text-anchor="end" font-size="9" fill="var(--brand-light)">x-height 线</text>
    <text x="440" y="86" text-anchor="end" font-size="9.5" fill="var(--brand-light)">基线 Baseline</text>
    <text x="440" y="120" text-anchor="end" font-size="9" fill="var(--text-3)">下伸部线 Descender</text>
    <text x="24" y="136" font-size="9" fill="var(--text-3)">几种字号混排时，都贴着同一条基线走，才不会飘</text>
  </svg>`,

  '行高（Leading / Line-height）': `<svg viewBox="0 0 480 148" role="img" aria-label="行高示意">
    <g fill="var(--text-2)" opacity=".8">
      <rect x="40" y="26" width="230" height="9" rx="4"/><rect x="40" y="62" width="286" height="9" rx="4"/>
      <rect x="40" y="98" width="204" height="9" rx="4"/>
    </g>
    <g stroke="var(--brand-light)" stroke-width="1.2" fill="none">
      <path d="M340 26v36m0 0-5-8m5 8 5-8"/><path d="M340 62v36m0 0-5-8m5 8 5-8"/>
    </g>
    <text x="356" y="48" font-size="10" fill="var(--brand-light)">line-height: 1.6</text>
    <text x="356" y="84" font-size="10" fill="var(--brand-light)">= 字号 × 倍数</text>
    <path d="M40 14v116M40 14h8M40 130h8" stroke="var(--text-3)" stroke-width="1"/>
    <text x="40" y="143" font-size="9" fill="var(--text-3)">量的是两行同一位置的间距，不是字与字之间的空隙</text>
  </svg>`,

  '多行截断（Line Clamp）': `<svg viewBox="0 0 480 148" role="img" aria-label="多行截断示意">
    <rect x="34" y="16" width="278" height="112" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g fill="var(--text-2)" opacity=".6">
      <rect x="50" y="34" width="244" height="8" rx="4"/><rect x="50" y="54" width="244" height="8" rx="4"/>
    </g>
    <rect x="50" y="74" width="196" height="8" rx="4" fill="var(--text-2)" opacity=".6"/>
    <text x="250" y="82" font-size="11" fill="var(--brand-light)">…</text>
    <path d="M50 96h244" stroke="var(--brand-light)" stroke-width="1.2" stroke-dasharray="3 3"/>
    <text x="172" y="115" text-anchor="middle" font-size="9" fill="var(--text-3)">第 3 行之后不显示了</text>
    <text x="330" y="52" font-size="10" fill="var(--text-2)">display: -webkit-box</text>
    <text x="330" y="72" font-size="10" fill="var(--text-2)">-webkit-line-clamp: 3</text>
    <text x="330" y="92" font-size="10" fill="var(--text-2)">overflow: hidden</text>
    <text x="330" y="118" font-size="9" fill="var(--text-3)">别把关键信息藏进去</text>
  </svg>`,

  /* ---- 技术实现与文件（D4）---- */
  '懒加载（Lazy Loading）': `<svg viewBox="0 0 480 148" role="img" aria-label="首屏外图片延迟加载示意">
    <rect x="18" y="10" width="176" height="128" rx="8" fill="var(--surface)" stroke="var(--border)" stroke-width="1.3"/>
    <path d="M18 76h176" stroke="var(--brand-light)" stroke-width="1.2" stroke-dasharray="4 3"/>
    <text x="30" y="26" font-size="9" fill="var(--brand-light)">视口之内：立刻加载</text>
    <g fill="var(--brand-light)" opacity=".3"><rect x="30" y="34" width="152" height="34" rx="4"/><rect x="30" y="82" width="152" height="34" rx="4"/></g>
    <text x="30" y="70" font-size="9" fill="var(--text-3)">── 首屏边界 ──</text>
    <g fill="none" stroke="var(--text-3)" stroke-width="1.2" stroke-dasharray="4 3"><rect x="30" y="82" width="152" height="34" rx="4"/></g>
    <text x="30" y="130" font-size="9" fill="var(--text-3)">视口之外：占位，先不加载</text>
    <path d="M212 98h36m0 0-8-7m8 7-8 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <text x="264" y="60" font-size="10" fill="var(--text-2)">滚动到这里</text>
    <text x="264" y="80" font-size="10" fill="var(--text-2)">才发图片请求</text>
    <text x="264" y="108" font-size="10" fill="var(--brand-light)">loading="lazy"</text>
    <text x="264" y="130" font-size="9" fill="var(--text-3)">首屏大图别懒加载</text>
  </svg>`,

  '响应式图片（Responsive Images / srcset）': `<svg viewBox="0 0 480 148" role="img" aria-label="srcset 按屏幕挑选图片示意">
    <rect x="12" y="28" width="160" height="88" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="26" y="48" font-size="10" fill="var(--brand-light)">img srcset=</text>
    <text x="26" y="66" font-size="9.5" fill="var(--text-2)">small.jpg 480w,</text>
    <text x="26" y="82" font-size="9.5" fill="var(--text-2)">big.jpg 960w</text>
    <text x="26" y="104" font-size="9.5" fill="var(--text-3)">sizes="(max-width:600px)</text>
    <path d="M182 72h32m0 0-8-7m8 7-8 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <text x="232" y="28" font-size="9.5" fill="var(--text-3)">浏览器按视口宽度和 DPR 自己挑</text>
    <g stroke="var(--border)" stroke-width="1.2" fill="var(--surface-2)">
      <rect x="232" y="40" width="72" height="34" rx="5"/><rect x="316" y="40" width="72" height="34" rx="5"/><rect x="400" y="40" width="68" height="34" rx="5"/>
    </g>
    <text x="268" y="62" text-anchor="middle" font-size="9" fill="var(--text-3)">480w</text>
    <text x="352" y="62" text-anchor="middle" font-size="9" fill="var(--brand-light)">960w ✓</text>
    <text x="434" y="62" text-anchor="middle" font-size="9" fill="var(--text-3)">2x</text>
    <text x="336" y="98" text-anchor="middle" font-size="10" fill="var(--text-2)">只下载被选中的那一张</text>
    <text x="336" y="124" text-anchor="middle" font-size="9" fill="var(--text-3)">不是 CSS 把大图缩小显示</text>
  </svg>`,

  '文档对象模型（DOM）': `<svg viewBox="0 0 480 148" role="img" aria-label="HTML 字符串解析成 DOM 树示意">
    <rect x="10" y="26" width="190" height="96" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="24" y="48" font-size="10" fill="var(--brand-light)">&lt;main&gt;</text>
    <text x="38" y="68" font-size="10" fill="var(--text-2)">&lt;h1&gt;标题&lt;/h1&gt;</text>
    <text x="24" y="88" font-size="10" fill="var(--brand-light)">&lt;/main&gt;</text>
    <text x="24" y="110" font-size="9" fill="var(--text-3)">源码：一段文本</text>
    <path d="M214 74h36m0 0-8-7m8 7-8 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <text x="232" y="62" text-anchor="middle" font-size="9" fill="var(--text-3)">解析</text>
    <g stroke="var(--brand-light)" stroke-width="1.2" fill="none">
      <path d="M300 40v20M300 60h-56M300 60h56M244 60v16M356 60v16"/>
    </g>
    <rect x="274" y="24" width="52" height="18" rx="4" fill="var(--brand-light)" opacity=".2"/>
    <text x="300" y="37" text-anchor="middle" font-size="9" fill="var(--brand-light)">main</text>
    <rect x="206" y="76" width="74" height="18" rx="4" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="243" y="89" text-anchor="middle" font-size="9" fill="var(--text-2)">h1</text>
    <rect x="322" y="76" width="68" height="18" rx="4" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="356" y="89" text-anchor="middle" font-size="9" fill="var(--text-2)">文本</text>
    <text x="300" y="122" text-anchor="middle" font-size="9" fill="var(--text-3)">DOM：能脚本操作的树，JS 改的是树不是源码</text>
  </svg>`,

  /* ---- 交互、状态与无障碍（D5）---- */
  '交互状态（Interaction State）': `<svg viewBox="0 0 480 148" role="img" aria-label="按钮四种交互状态示意">
    <rect x="16" y="34" width="98" height="40" rx="7" fill="var(--brand-light)" opacity=".85"/>
    <text x="65" y="59" text-anchor="middle" font-size="10.5" fill="#04211d" font-weight="600">默认 Default</text>
    <text x="65" y="94" text-anchor="middle" font-size="9" fill="var(--text-3)">平时长这样</text>
    <rect x="138" y="34" width="98" height="40" rx="7" fill="var(--brand-light)" stroke="#fff" stroke-width="2"/>
    <text x="187" y="59" text-anchor="middle" font-size="10.5" fill="#04211d" font-weight="600">悬停 Hover</text>
    <text x="187" y="94" text-anchor="middle" font-size="9" fill="var(--text-3)">鼠标移上去</text>
    <rect x="260" y="34" width="98" height="40" rx="7" fill="var(--brand-light)" opacity=".5" transform="translate(1 2)"/>
    <text x="309" y="59" text-anchor="middle" font-size="10.5" fill="var(--text)" font-weight="600">按下 Active</text>
    <text x="309" y="94" text-anchor="middle" font-size="9" fill="var(--text-3)">真被点到了</text>
    <rect x="382" y="34" width="82" height="40" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="423" y="59" text-anchor="middle" font-size="10.5" fill="var(--text-3)">禁用</text>
    <text x="423" y="94" text-anchor="middle" font-size="9" fill="var(--text-3)">点了没反应</text>
    <text x="240" y="130" text-anchor="middle" font-size="9.5" fill="var(--text-2)">四种状态都要设计；只画「默认」，上线后就是一堆没反馈的按钮</text>
  </svg>`,

  '聚焦 / 焦点环（Focus / Focus Ring）': `<svg viewBox="0 0 480 148" role="img" aria-label="键盘焦点环示意">
    <rect x="42" y="28" width="84" height="28" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="84" y="47" text-anchor="middle" font-size="10" fill="var(--text-3)">上一个</text>
    <path d="M136 42h30m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <rect x="176" y="22" width="108" height="40" rx="8" fill="var(--brand-light)" opacity=".18" stroke="var(--brand-light)" stroke-width="2.4" stroke-dasharray="5 3"/>
    <rect x="182" y="28" width="96" height="28" rx="6" fill="var(--brand-light)" opacity=".8"/>
    <text x="230" y="47" text-anchor="middle" font-size="10.5" fill="#04211d" font-weight="600">当前焦点</text>
    <path d="M294 42h30m0 0-8-6m8 6-8 6" stroke="var(--text-3)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <rect x="334" y="28" width="84" height="28" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="376" y="47" text-anchor="middle" font-size="10" fill="var(--text-3)">下一个</text>
    <rect x="196" y="88" width="68" height="26" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="230" y="106" text-anchor="middle" font-size="11" fill="var(--text-2)">Tab</text>
    <text x="240" y="138" text-anchor="middle" font-size="9.5" fill="var(--text-3)">焦点环告诉键盘用户「现在轮到谁」；别只为了好看把它去掉</text>
  </svg>`,

  '表单校验（Form Validation）': `<svg viewBox="0 0 480 148" role="img" aria-label="表单成功与错误校验提示示意">
    <text x="20" y="26" font-size="10" fill="var(--text-2)">邮箱</text>
    <rect x="20" y="34" width="200" height="32" rx="6" fill="var(--surface-2)" stroke="#22c55e" stroke-width="1.6"/>
    <text x="32" y="55" font-size="10" fill="var(--text)">name@example.com</text>
    <circle cx="208" cy="50" r="8" fill="#22c55e" opacity=".22"/>
    <path d="M204 50l3 3 6-7" stroke="#22c55e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <text x="20" y="87" font-size="9.5" fill="#22c55e">✓ 格式正确</text>
    <text x="260" y="26" font-size="10" fill="var(--text-2)">邮箱</text>
    <rect x="260" y="34" width="200" height="32" rx="6" fill="var(--surface-2)" stroke="#ef4444" stroke-width="1.6"/>
    <text x="272" y="55" font-size="10" fill="var(--text)">name@example</text>
    <circle cx="448" cy="50" r="8" fill="#ef4444" opacity=".2"/>
    <path d="M444 46l8 8M452 46l-8 8" stroke="#ef4444" stroke-width="1.6" stroke-linecap="round"/>
    <text x="260" y="87" font-size="9.5" fill="#ef4444">✗ 缺少域名后缀</text>
    <rect x="20" y="102" width="440" height="30" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="32" y="122" font-size="9.5" fill="var(--text-3)">写清楚「哪里错了、怎么改」，别只弹一个「输入有误」</text>
  </svg>`,

  '触控目标（Touch Target）': `<svg viewBox="0 0 480 148" role="img" aria-label="触控目标最小尺寸示意">
    <circle cx="96" cy="70" r="11" fill="var(--text-3)" opacity=".35" stroke="#ef4444" stroke-width="1.5"/>
    <text x="96" y="112" text-anchor="middle" font-size="9.5" fill="#ef4444">太小：手指点不准</text>
    <text x="96" y="128" text-anchor="middle" font-size="9" fill="var(--text-3)">约 20 × 20</text>
    <path d="M188 70h30m0 0-8-7m8 7-8 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <circle cx="300" cy="70" r="30" fill="var(--brand-light)" opacity=".2" stroke="var(--brand-light)" stroke-width="1.6"/>
    <circle cx="300" cy="70" r="9" fill="var(--brand-light)"/>
    <text x="300" y="112" text-anchor="middle" font-size="9.5" fill="var(--brand-light)">至少 44 × 44 CSS px</text>
    <text x="300" y="128" text-anchor="middle" font-size="9" fill="var(--text-3)">看得小也没关系，点击区域要够大</text>
    <text x="404" y="64" font-size="9.5" fill="var(--text-3)">相邻目标</text>
    <text x="404" y="80" font-size="9.5" fill="var(--text-3)">之间也要</text>
    <text x="404" y="96" font-size="9.5" fill="var(--text-3)">留间距</text>
  </svg>`,

  /* ---- 性能与 SEO 度量（D8）---- */
  '核心网页指标（Core Web Vitals）': `<svg viewBox="0 0 480 148" role="img" aria-label="三项核心网页指标示意">
    <g stroke="var(--border)" stroke-width="1.2" fill="var(--surface-2)">
      <rect x="14" y="24" width="144" height="96" rx="8"/><rect x="168" y="24" width="144" height="96" rx="8"/><rect x="322" y="24" width="144" height="96" rx="8"/>
    </g>
    <text x="86" y="52" text-anchor="middle" font-size="15" fill="var(--brand-light)" font-family="var(--font-mono)">LCP</text>
    <text x="86" y="74" text-anchor="middle" font-size="9.5" fill="var(--text-2)">最大内容绘制</text>
    <text x="86" y="102" text-anchor="middle" font-size="10" fill="var(--brand-light)">≤ 2.5 s</text>
    <text x="240" y="52" text-anchor="middle" font-size="15" fill="var(--brand-light)" font-family="var(--font-mono)">INP</text>
    <text x="240" y="74" text-anchor="middle" font-size="9.5" fill="var(--text-2)">交互响应时延</text>
    <text x="240" y="102" text-anchor="middle" font-size="10" fill="var(--brand-light)">≤ 200 ms</text>
    <text x="394" y="52" text-anchor="middle" font-size="15" fill="var(--brand-light)" font-family="var(--font-mono)">CLS</text>
    <text x="394" y="74" text-anchor="middle" font-size="9.5" fill="var(--text-2)">累积布局偏移</text>
    <text x="394" y="102" text-anchor="middle" font-size="10" fill="var(--brand-light)">≤ 0.1</text>
    <text x="240" y="140" text-anchor="middle" font-size="9" fill="var(--text-3)">分别管：加载快不快、点了跟不跟手、页面晃不晃</text>
  </svg>`,

  '累积布局偏移（CLS (Cumulative Layout Shift)）': `<svg viewBox="0 0 480 148" role="img" aria-label="图片挤动正文造成布局偏移示意">
    <rect x="14" y="16" width="204" height="116" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="26" y="32" font-size="9.5" fill="var(--text-3)">图片加载前</text>
    <g fill="var(--text-2)" opacity=".6"><rect x="26" y="44" width="180" height="7" rx="3.5"/><rect x="26" y="58" width="156" height="7" rx="3.5"/></g>
    <rect x="26" y="76" width="180" height="42" rx="4" fill="var(--text-3)" opacity=".28" stroke="var(--text-3)" stroke-dasharray="3 3"/>
    <text x="116" y="102" text-anchor="middle" font-size="9" fill="var(--text-3)">图片还没占位置</text>
    <path d="M232 74h26m0 0-8-7m8 7-8 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <rect x="272" y="16" width="194" height="116" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="284" y="32" font-size="9.5" fill="var(--text-3)">图片加载后</text>
    <rect x="284" y="42" width="170" height="42" rx="4" fill="var(--brand-light)" opacity=".3"/>
    <path d="M284 78l46-26 44 22 34-12 46 16" stroke="var(--brand-light)" stroke-width="1.2" fill="none" opacity=".6"/>
    <g fill="var(--text-2)" opacity=".6"><rect x="284" y="94" width="170" height="7" rx="3.5"/><rect x="284" y="108" width="146" height="7" rx="3.5"/></g>
    <path d="M380 60v20m0 0-4-7m4 7 4-7" stroke="#ef4444" stroke-width="1.4" fill="none"/>
    <text x="240" y="143" text-anchor="middle" font-size="9" fill="var(--text-3)">给图片写死 width / height（或 aspect-ratio），正文就不会被挤走</text>
  </svg>`,

  /* ---- 建站流程里的关键机制（S3 / S4）---- */
  'try_files': `<svg viewBox="0 0 480 148" role="img" aria-label="nginx try_files 依次查找示意">
    <rect x="12" y="58" width="82" height="32" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="53" y="79" text-anchor="middle" font-size="10" fill="var(--text-2)">请求 /map</text>
    <path d="M100 74h26m0 0-7-6m7 6-7 6" stroke="var(--brand-light)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <g stroke="var(--border)" stroke-width="1.2" fill="var(--surface-2)">
      <rect x="136" y="18" width="140" height="30" rx="6"/><rect x="136" y="59" width="140" height="30" rx="6"/><rect x="136" y="100" width="140" height="30" rx="6"/>
    </g>
    <text x="150" y="38" font-size="10" fill="var(--brand-light)">① $uri/index.html</text>
    <text x="150" y="79" font-size="10" fill="var(--text-3)">② $uri</text>
    <text x="150" y="120" font-size="10" fill="var(--text-3)">③ $uri.html</text>
    <path d="M282 33h26m0 0-7-6m7 6-7 6" stroke="var(--brand-light)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <rect x="318" y="18" width="144" height="30" rx="6" fill="var(--brand-light)" opacity=".2" stroke="var(--brand-light)" stroke-width="1.2"/>
    <text x="390" y="38" text-anchor="middle" font-size="10" fill="var(--brand-light)">命中 → 直接返回 200</text>
    <text x="318" y="80" font-size="9.5" fill="var(--text-2)">都不存在 → 404</text>
    <text x="318" y="112" font-size="9.5" fill="var(--text-3)">顺序决定行为：</text>
    <text x="318" y="128" font-size="9.5" fill="var(--text-3)">index 要排在 $uri 前面</text>
  </svg>`,

  '公钥与私钥': `<svg viewBox="0 0 480 148" role="img" aria-label="私钥在发起方、公钥在接收方示意">
    <rect x="14" y="24" width="186" height="92" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <text x="28" y="46" font-size="10" fill="var(--text-3)">本机 / Actions</text>
    <text x="28" y="76" font-size="12" fill="var(--brand-light)" font-family="var(--font-mono)">私钥 private key</text>
    <text x="28" y="98" font-size="9.5" fill="var(--text-2)">绝不外传，只用来证明「我是我」</text>
    <path d="M212 70h48m0 0-9-8m9 8-9 8" stroke="var(--brand-light)" stroke-width="2" fill="none" stroke-linecap="round"/>
    <text x="236" y="58" text-anchor="middle" font-size="9" fill="var(--text-3)">握手</text>
    <rect x="272" y="24" width="194" height="92" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <text x="286" y="46" font-size="10" fill="var(--text-3)">服务器 / GitHub</text>
    <text x="286" y="76" font-size="12" fill="var(--brand-light)" font-family="var(--font-mono)">公钥 public key</text>
    <text x="286" y="98" font-size="9.5" fill="var(--text-2)">存在锁的位置，公开也没关系</text>
    <text x="240" y="138" text-anchor="middle" font-size="10" fill="var(--brand-light)">判断只看一条：谁拿私钥，谁就是发起方</text>
  </svg>`,

  '推式部署': `<svg viewBox="0 0 480 148" role="img" aria-label="推式部署链路示意">
    <rect x="14" y="30" width="130" height="78" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="79" y="56" text-anchor="middle" font-size="11" fill="var(--text-2)">GitHub</text>
    <text x="79" y="76" text-anchor="middle" font-size="9.5" fill="var(--text-3)">Actions / Runner</text>
    <text x="79" y="96" text-anchor="middle" font-size="9" fill="var(--brand-light)">私钥在 Secrets 里</text>
    <path d="M156 69h150m0 0-12-9m12 9-12 9" stroke="var(--brand-light)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <text x="231" y="56" text-anchor="middle" font-size="9.5" fill="var(--brand-light)">构建完主动推过去</text>
    <rect x="318" y="30" width="148" height="78" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="392" y="56" text-anchor="middle" font-size="11" fill="var(--text-2)">云服务器</text>
    <text x="392" y="76" text-anchor="middle" font-size="9.5" fill="var(--text-3)">只存公钥和目录</text>
    <text x="392" y="96" text-anchor="middle" font-size="9" fill="var(--text-3)">被动接收</text>
    <text x="240" y="136" text-anchor="middle" font-size="9.5" fill="var(--text-3)">服务器不用出网拉取；但私钥要放进 CI 的 Secrets</text>
  </svg>`,

  '拉取式部署': `<svg viewBox="0 0 480 148" role="img" aria-label="拉取式部署链路示意">
    <rect x="318" y="30" width="148" height="78" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="392" y="56" text-anchor="middle" font-size="11" fill="var(--text-2)">GitHub</text>
    <text x="392" y="76" text-anchor="middle" font-size="9.5" fill="var(--text-3)">源码 / 仓库</text>
    <text x="392" y="96" text-anchor="middle" font-size="9" fill="var(--text-3)">只放公钥或读令牌</text>
    <path d="M312 69H162m0 0 12-9m-12 9 12 9" stroke="var(--brand-light)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <text x="237" y="56" text-anchor="middle" font-size="9.5" fill="var(--brand-light)">服务器定时拉回来</text>
    <rect x="14" y="30" width="140" height="78" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="84" y="56" text-anchor="middle" font-size="11" fill="var(--text-2)">云服务器</text>
    <text x="84" y="76" text-anchor="middle" font-size="9.5" fill="var(--text-3)">私钥留在本机</text>
    <text x="84" y="96" text-anchor="middle" font-size="9" fill="var(--text-3)">cron / webhook 触发</text>
    <text x="240" y="136" text-anchor="middle" font-size="9.5" fill="var(--text-3)">私钥不必进 CI；但服务器要能出网，且拉取有延迟</text>
  </svg>`,

  /* ---- 更多视觉元素（D1）---- */
  '社交分享图（OG Image (Open Graph Image)）': `<svg viewBox="0 0 480 148" role="img" aria-label="社交分享卡片示意">
    <rect x="14" y="12" width="272" height="124" rx="9" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="28" y="32" font-size="9.5" fill="var(--text-3)">在聊天里粘贴一个链接</text>
    <rect x="28" y="42" width="244" height="78" rx="6" fill="var(--surface)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="36" y="50" width="62" height="62" rx="5" fill="var(--brand-light)" opacity=".26"/>
    <circle cx="67" cy="72" r="9" fill="var(--brand-light)" opacity=".5"/>
    <path d="M44 104l22-20 18 14 14-9 6 15" stroke="var(--brand-light)" stroke-width="1.2" fill="none" opacity=".6"/>
    <text x="108" y="64" font-size="10.5" fill="var(--text)">标题 og:title</text>
    <text x="108" y="82" font-size="9.5" fill="var(--text-2)">摘要 og:description</text>
    <text x="108" y="104" font-size="9" fill="var(--text-3)">www.example.com</text>
    <text x="304" y="56" font-size="10" fill="var(--brand-light)">og:image → 缩略图</text>
    <text x="304" y="80" font-size="10" fill="var(--brand-light)">og:title → 标题</text>
    <text x="304" y="104" font-size="10" fill="var(--brand-light)">og:desc → 摘要</text>
    <text x="304" y="130" font-size="9" fill="var(--text-3)">不写就随机抓图</text>
  </svg>`,

  '遮罩层 / 蒙层（Overlay）': `<svg viewBox="0 0 480 148" role="img" aria-label="遮罩层示意">
    <rect x="10" y="10" width="460" height="128" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g fill="var(--text-3)" opacity=".3">
      <rect x="24" y="24" width="120" height="10" rx="5"/><rect x="24" y="44" width="400" height="7" rx="3.5"/>
      <rect x="24" y="60" width="360" height="7" rx="3.5"/><rect x="24" y="76" width="380" height="7" rx="3.5"/>
    </g>
    <rect x="10" y="10" width="460" height="128" rx="8" fill="#000" opacity=".55"/>
    <rect x="158" y="34" width="164" height="80" rx="8" fill="var(--surface)" stroke="var(--brand-light)" stroke-width="1.5"/>
    <text x="240" y="58" text-anchor="middle" font-size="11" fill="var(--brand-light)">遮罩层 Overlay</text>
    <text x="240" y="78" text-anchor="middle" font-size="9.5" fill="var(--text-2)">盖住底层，自己可以点</text>
    <rect x="196" y="90" width="88" height="14" rx="7" fill="var(--brand-light)" opacity=".8"/>
    <text x="240" y="101" text-anchor="middle" font-size="8.5" fill="#04211d">知道了</text>
    <text x="240" y="142" text-anchor="middle" font-size="9" fill="var(--text-3)">它只负责「盖」和「挡」，内容仍在上面那张卡里</text>
  </svg>`,

  '通栏满幅（Full-bleed）': `<svg viewBox="0 0 480 148" role="img" aria-label="通栏满幅与容器宽度对比">
    <text x="16" y="16" font-size="9.5" fill="var(--text-3)">普通容器</text>
    <rect x="16" y="24" width="196" height="102" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="40" y="38" width="148" height="74" rx="4" fill="var(--brand-light)" opacity=".24"/>
    <text x="114" y="79" text-anchor="middle" font-size="10" fill="var(--text-2)">图片被收在内容区</text>
    <text x="244" y="16" font-size="9.5" fill="var(--brand-light)">通栏满幅</text>
    <rect x="244" y="24" width="220" height="102" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2" stroke-dasharray="4 3"/>
    <rect x="244" y="38" width="220" height="74" fill="var(--brand-light)" opacity=".3"/>
    <text x="354" y="79" text-anchor="middle" font-size="10" fill="var(--text)">图片冲到视口两边</text>
    <text x="240" y="142" text-anchor="middle" font-size="9" fill="var(--text-3)">只让背景或大图通栏；正文仍留在容器里，否则行宽失控</text>
  </svg>`,

  '图标集（Icon Set）': `<svg viewBox="0 0 480 148" role="img" aria-label="成套图标风格一致示意">
    <text x="16" y="16" font-size="9.5" fill="var(--text-3)">同一套：线宽、圆角、视角都一致</text>
    <g stroke="var(--brand-light)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="34" y="40" width="30" height="30" rx="5"/><path d="M42 70V54h14v16"/>
      <circle cx="126" cy="55" r="14"/><path d="M112 82a14 14 0 0 1 28 0"/>
      <path d="M186 70l10-28 10 28M192 61h8"/>
      <rect x="228" y="40" width="30" height="30" rx="5"/><path d="M243 48v14M236 55h14"/>
      <path d="M298 40l24 15-24 15z"/>
      <rect x="352" y="40" width="30" height="30" rx="5"/><path d="M360 50h14M360 57h14M360 64h10"/>
    </g>
    <g font-size="9" fill="var(--text-3)" text-anchor="middle">
      <text x="49" y="92">首页</text><text x="126" y="92">用户</text><text x="196" y="92">警告</text>
      <text x="243" y="92">新增</text><text x="310" y="92">播放</text><text x="367" y="92">菜单</text>
    </g>
    <text x="240" y="118" text-anchor="middle" font-size="10" fill="var(--text-2)">一样粗的线、一样大的圆角 → 扫一眼就是一家人</text>
    <text x="240" y="140" text-anchor="middle" font-size="9" fill="var(--text-3)">混搭描边、填充、立体图标，会显得东拼西凑</text>
  </svg>`,

  /* ---- 更多布局与结构（D2）---- */
  '内边距（Padding）': `<svg viewBox="0 0 480 148" role="img" aria-label="内边距示意">
    <text x="16" y="16" font-size="9.5" fill="var(--text-3)">盒子边框 → 内容</text>
    <rect x="70" y="30" width="250" height="90" rx="8" fill="var(--surface-2)" stroke="var(--brand-light)" stroke-width="1.6"/>
    <rect x="106" y="50" width="178" height="50" rx="5" fill="var(--brand-light)" opacity=".18" stroke="var(--brand-light)" stroke-width="1.2" stroke-dasharray="4 3"/>
    <text x="195" y="80" text-anchor="middle" font-size="11" fill="var(--text)">内容区</text>
    <path d="M72 44h32m0 0-7-5m7 5-7 5" stroke="var(--brand-light)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <text x="88" y="38" text-anchor="middle" font-size="9" fill="var(--brand-light)">padding</text>
    <path d="M180 32v16m0 0-5-6m5 6 5-6" stroke="var(--brand-light)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <text x="344" y="62" font-size="10" fill="var(--text-2)">padding 撑开盒子内部</text>
    <text x="344" y="84" font-size="10" fill="var(--text-2)">背景色会铺满这一圈</text>
    <text x="344" y="116" font-size="9" fill="var(--text-3)">不写就是 0，文字贴边</text>
  </svg>`,

  '外边距（Margin）': `<svg viewBox="0 0 480 148" role="img" aria-label="外边距示意">
    <rect x="30" y="38" width="140" height="70" rx="7" fill="var(--brand-light)" opacity=".2" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="100" y="80" text-anchor="middle" font-size="11" fill="var(--text)">盒子 A</text>
    <rect x="290" y="38" width="140" height="70" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.4"/>
    <text x="360" y="80" text-anchor="middle" font-size="11" fill="var(--text)">盒子 B</text>
    <path d="M176 73h110m0 0-9-7m9 7-9 7" stroke="var(--text-3)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <text x="230" y="62" text-anchor="middle" font-size="10" fill="var(--brand-light)">margin</text>
    <text x="230" y="100" text-anchor="middle" font-size="9" fill="var(--text-3)">两个盒子之间的距离</text>
    <text x="240" y="136" text-anchor="middle" font-size="9.5" fill="var(--text-2)">margin 是「推开别人」，padding 是「撑开自己」</text>
  </svg>`,

  '线框图（Wireframe）': `<svg viewBox="0 0 480 148" role="img" aria-label="线框图示意">
    <rect x="30" y="14" width="200" height="120" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="42" y="26" width="176" height="20" rx="3" fill="var(--text-3)" opacity=".2"/>
    <text x="130" y="41" text-anchor="middle" font-size="9.5" fill="var(--text-3)">导航</text>
    <rect x="42" y="54" width="176" height="46" rx="3" fill="var(--text-3)" opacity=".3"/>
    <text x="130" y="81" text-anchor="middle" font-size="10" fill="var(--text-2)">大图 / 主标题</text>
    <g fill="var(--text-3)" opacity=".18">
      <rect x="42" y="108" width="52" height="16" rx="2"/><rect x="104" y="108" width="52" height="16" rx="2"/><rect x="166" y="108" width="52" height="16" rx="2"/>
    </g>
    <text x="252" y="40" font-size="10" fill="var(--brand-light)">先定位置和优先级</text>
    <text x="252" y="64" font-size="10" fill="var(--text-2)">不谈颜色、图片、字体</text>
    <text x="252" y="88" font-size="10" fill="var(--text-2)">这三块谁先谁后</text>
    <text x="252" y="112" font-size="10" fill="var(--text-2)">一眼就能吵明白</text>
    <text x="252" y="136" font-size="9" fill="var(--text-3)">改线框便宜，改成品贵</text>
  </svg>`,

  '层级（Z-index）': `<svg viewBox="0 0 480 148" role="img" aria-label="z-index 叠放层级示意">
    <rect x="52" y="34" width="200" height="80" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="152" y="80" text-anchor="middle" font-size="10" fill="var(--text-3)">页面 z: auto</text>
    <rect x="112" y="24" width="200" height="72" rx="7" fill="var(--brand-light)" opacity=".14" stroke="var(--brand-light)" stroke-width="1.2"/>
    <text x="212" y="66" text-anchor="middle" font-size="10" fill="var(--brand-light)">导航 z: 10</text>
    <rect x="168" y="50" width="120" height="50" rx="7" fill="var(--brand-light)" opacity=".32" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="228" y="80" text-anchor="middle" font-size="10" fill="var(--text)">弹窗 z: 100</text>
    <text x="312" y="58" font-size="10" fill="var(--text-2)">数字越大，越靠前</text>
    <text x="312" y="80" font-size="10" fill="var(--text-2)">同一层叠上下文里</text>
    <text x="312" y="102" font-size="10" fill="var(--text-2)">比较才有意义</text>
    <text x="240" y="143" text-anchor="middle" font-size="9" fill="var(--text-3)">要生效还得有定位：position 不能是 static</text>
  </svg>`,

  '空状态（Empty State）': `<svg viewBox="0 0 480 148" role="img" aria-label="空状态示意">
    <rect x="14" y="12" width="452" height="124" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <path d="M186 68h108l-12 34h-84z" fill="var(--brand-light)" opacity=".18" stroke="var(--brand-light)" stroke-width="1.4"/>
    <path d="M186 68l18-22h72l18 22" fill="none" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="240" y="120" text-anchor="middle" font-size="10.5" fill="var(--text)">这里还没有内容</text>
    <text x="60" y="52" font-size="10" fill="var(--text-2)">光说「暂无数据」</text>
    <text x="60" y="76" font-size="10" fill="var(--text-2)">用户不知道下一步</text>
    <text x="60" y="106" font-size="10" fill="var(--brand-light)">补一句为什么空，</text>
    <text x="60" y="126" font-size="10" fill="var(--brand-light)">再给一个能点的按钮</text>
    <path d="M196 84h-30m0 0 8-6m-8 6 8 6" stroke="var(--text-3)" stroke-width="1.3" fill="none"/>
    <text x="350" y="52" font-size="10" fill="var(--text-2)">好设计会告诉你：</text>
    <text x="350" y="76" font-size="10" fill="var(--text-2)">空是正常的，</text>
    <text x="350" y="100" font-size="10" fill="var(--text-2)">而且有路可走</text>
  </svg>`,

  /* ---- 更多排版（D3）---- */
  '字号阶梯（Type Scale）': `<svg viewBox="0 0 480 148" role="img" aria-label="字号阶梯示意">
    <path d="M16 30v100" stroke="var(--border)" stroke-width="1"/>
    <text x="28" y="46" font-size="26" fill="var(--text)">标题 H1</text>
    <text x="344" y="44" font-size="10" fill="var(--brand-light)">32 / 40</text>
    <text x="28" y="76" font-size="20" fill="var(--text)">小标题 H2</text>
    <text x="344" y="74" font-size="10" fill="var(--text-2)">24 / 32</text>
    <text x="28" y="102" font-size="15" fill="var(--text-2)">段落标题 H3</text>
    <text x="344" y="100" font-size="10" fill="var(--text-2)">18 / 26</text>
    <text x="28" y="124" font-size="12" fill="var(--text-3)">正文内容，读起来不累</text>
    <text x="344" y="122" font-size="10" fill="var(--text-2)">14 / 24</text>
    <text x="240" y="143" text-anchor="middle" font-size="9" fill="var(--text-3)">字号 / 行高成对定义，别每页现拍脑袋</text>
  </svg>`,

  '行宽（Measure / Line Length）': `<svg viewBox="0 0 480 148" role="img" aria-label="阅读行宽示意">
    <rect x="16" y="20" width="100" height="112" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g fill="var(--text-3)" opacity=".3">
      <rect x="26" y="34" width="76" height="5" rx="2.5"/><rect x="26" y="46" width="76" height="5" rx="2.5"/><rect x="26" y="58" width="76" height="5" rx="2.5"/>
    </g>
    <text x="66" y="96" text-anchor="middle" font-size="9" fill="var(--text-3)">太窄：频繁换行</text>
    <rect x="140" y="20" width="200" height="112" rx="6" fill="var(--brand-light)" opacity=".09" stroke="var(--brand-light)" stroke-width="1.4"/>
    <g fill="var(--text-2)" opacity=".5">
      <rect x="152" y="34" width="176" height="5" rx="2.5"/><rect x="152" y="46" width="176" height="5" rx="2.5"/>
      <rect x="152" y="58" width="176" height="5" rx="2.5"/><rect x="152" y="70" width="176" height="5" rx="2.5"/>
    </g>
    <text x="240" y="98" text-anchor="middle" font-size="10" fill="var(--brand-light)">45–75 字符</text>
    <text x="240" y="116" text-anchor="middle" font-size="9" fill="var(--text-3)">眼睛跟得上换行</text>
    <rect x="364" y="20" width="100" height="112" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g fill="var(--text-3)" opacity=".3">
      <rect x="374" y="34" width="80" height="5" rx="2.5"/><rect x="374" y="46" width="80" height="5" rx="2.5"/><rect x="374" y="58" width="80" height="5" rx="2.5"/>
    </g>
    <text x="414" y="96" text-anchor="middle" font-size="9" fill="var(--text-3)">太宽：回到行首难</text>
    <text x="240" y="144" text-anchor="middle" font-size="9" fill="var(--text-3)">身体正文控制在 45–75 字符，比设固定像素更靠谱</text>
  </svg>`,

  '字体栈（Font Stack）': `<svg viewBox="0 0 480 148" role="img" aria-label="字体栈回退顺序示意">
    <text x="20" y="36" font-size="10.5" fill="var(--text-2)">font-family:</text>
    <rect x="118" y="20" width="216" height="24" rx="5" fill="var(--brand-light)" opacity=".18" stroke="var(--brand-light)" stroke-width="1.2"/>
    <text x="226" y="37" text-anchor="middle" font-size="9.5" fill="var(--brand-light)">Inter, 苹方, sans-serif</text>
    <rect x="30" y="66" width="120" height="30" rx="6" fill="var(--brand-light)" opacity=".22" stroke="var(--brand-light)"/>
    <text x="90" y="86" text-anchor="middle" font-size="10" fill="var(--text)">① 首选字体</text>
    <path d="M158 81h28m0 0-8-6m8 6-8 6" stroke="var(--text-3)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <text x="172" y="72" text-anchor="middle" font-size="8.5" fill="var(--text-3)">没装</text>
    <rect x="194" y="66" width="120" height="30" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="254" y="86" text-anchor="middle" font-size="10" fill="var(--text-2)">② 后备字体</text>
    <path d="M322 81h28m0 0-8-6m8 6-8 6" stroke="var(--text-3)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <text x="336" y="72" text-anchor="middle" font-size="8.5" fill="var(--text-3)">也没有</text>
    <rect x="358" y="66" width="106" height="30" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="411" y="86" text-anchor="middle" font-size="10" fill="var(--text-2)">③ 兜底类别</text>
    <text x="240" y="124" text-anchor="middle" font-size="10" fill="var(--text-2)">最后一项必须写通用类别，不然会露出浏览器默认字体</text>
    <text x="240" y="142" text-anchor="middle" font-size="9" fill="var(--text-3)">中文字体栈记得给「微软雅黑 / PingFang SC」留位置</text>
  </svg>`,

  /* ---- 更多技术实现（D4）---- */
  '雪碧图（Image Sprite）': `<svg viewBox="0 0 480 148" role="img" aria-label="雪碧图裁切示意">
    <text x="16" y="16" font-size="9.5" fill="var(--text-3)">一张大图，几个图标排在一起</text>
    <rect x="30" y="28" width="112" height="112" rx="5" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g stroke="var(--brand-light)" stroke-width="2" fill="none">
      <rect x="38" y="36" width="44" height="44" rx="6"/><circle cx="98" cy="58" r="18"/>
      <rect x="38" y="96" width="44" height="44" rx="6"/><path d="M80 128l36-22 12 26z"/>
    </g>
    <path d="M158 84h34m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <text x="175" y="72" text-anchor="middle" font-size="9" fill="var(--text-3)">挪背景</text>
    <rect x="220" y="28" width="112" height="112" rx="5" fill="var(--surface-2)" stroke="var(--brand-light)" stroke-width="1.4"/>
    <rect x="244" y="52" width="44" height="44" rx="6" fill="none" stroke="var(--brand-light)" stroke-width="2"/>
    <text x="276" y="124" text-anchor="middle" font-size="9" fill="var(--text-3)">只露其中一个</text>
    <text x="358" y="60" font-size="10" fill="var(--text-2)">一次请求拿回全部图标</text>
    <text x="358" y="84" font-size="10" fill="var(--text-2)">靠 background-position</text>
    <text x="358" y="108" font-size="10" fill="var(--text-2)">定位到要显示的那个</text>
    <text x="358" y="132" font-size="9" fill="var(--text-3)">HTTP/2 之后收益变小</text>
  </svg>`,

  '矢量图 / 位图（Vector / Raster）': `<svg viewBox="0 0 480 148" role="img" aria-label="矢量图与位图放大对比">
    <text x="56" y="18" text-anchor="middle" font-size="9.5" fill="var(--brand-light)">矢量放大：仍然光滑</text>
    <circle cx="40" cy="70" r="38" fill="none" stroke="var(--brand-light)" stroke-width="2.4"/>
    <path d="M16 70l18 18 30-38" fill="none" stroke="var(--brand-light)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="60" y="128" text-anchor="middle" font-size="9" fill="var(--text-3)">SVG，适合图标和 Logo</text>
    <text x="300" y="18" text-anchor="middle" font-size="9.5" fill="#ef4444">位图放大：看出方块</text>
    <g fill="var(--brand-light)" opacity=".42">
      <rect x="282" y="32" width="14" height="14"/><rect x="296" y="32" width="14" height="14"/><rect x="310" y="32" width="14" height="14"/>
      <rect x="268" y="46" width="14" height="14"/><rect x="282" y="46" width="14" height="14"/><rect x="296" y="46" width="14" height="14"/><rect x="310" y="46" width="14" height="14"/><rect x="324" y="46" width="14" height="14"/>
      <rect x="268" y="60" width="14" height="14"/><rect x="282" y="60" width="14" height="14"/><rect x="296" y="60" width="14" height="14"/><rect x="310" y="60" width="14" height="14"/><rect x="324" y="60" width="14" height="14"/>
      <rect x="282" y="74" width="14" height="14"/><rect x="296" y="74" width="14" height="14"/><rect x="310" y="74" width="14" height="14"/>
    </g>
    <text x="300" y="128" text-anchor="middle" font-size="9" fill="var(--text-3)">JPG / PNG，适合照片</text>
    <text x="410" y="68" font-size="10" fill="var(--text-2)">位图按像素存，</text>
    <text x="410" y="90" font-size="10" fill="var(--text-2)">放大就露马脚；</text>
    <text x="410" y="112" font-size="9" fill="var(--text-3)">所以要出二倍图</text>
  </svg>`,

  '替代文本（Alt Text）': `<svg viewBox="0 0 480 148" role="img" aria-label="替代文本兜底示意">
    <rect x="16" y="18" width="200" height="110" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <path d="M36 38l26 26M62 38L36 64" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
    <text x="116" y="58" text-anchor="middle" font-size="11" fill="var(--text-2)">团队合影：左起…</text>
    <text x="116" y="82" text-anchor="middle" font-size="9" fill="var(--text-3)">图片加载失败时显示</text>
    <text x="116" y="106" text-anchor="middle" font-size="9" fill="var(--brand-light)">alt="团队合影：左起…"</text>
    <path d="M232 72h32m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <text x="286" y="48" font-size="10" fill="var(--text-2)">屏幕阅读器也读它</text>
    <text x="286" y="72" font-size="10" fill="var(--text-2)">搜索爬虫也看它</text>
    <text x="286" y="96" font-size="10" fill="var(--text-2)">纯装饰图写 alt=""</text>
    <text x="286" y="126" font-size="9" fill="var(--text-3)">别写「图片 01」这种废话</text>
  </svg>`,

  '语义化标记（Semantic HTML）': `<svg viewBox="0 0 480 148" role="img" aria-label="语义化标签示意">
    <text x="18" y="18" font-size="9.5" fill="var(--text-3)">全是 div</text>
    <g fill="var(--text-3)" opacity=".22" stroke="var(--border)" stroke-width="1">
      <rect x="18" y="28" width="190" height="18" rx="3"/><rect x="18" y="52" width="190" height="18" rx="3"/><rect x="18" y="76" width="190" height="48" rx="3"/>
    </g>
    <text x="113" y="106" text-anchor="middle" font-size="9.5" fill="var(--text-3)">div div div</text>
    <path d="M222 74h30m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <text x="272" y="18" font-size="9.5" fill="var(--brand-light)">语义化标签</text>
    <g stroke="var(--brand-light)" stroke-width="1.2">
      <rect x="272" y="28" width="190" height="18" rx="3" fill="var(--brand-light)" opacity=".22"/>
      <rect x="272" y="52" width="190" height="18" rx="3" fill="var(--brand-light)" opacity=".3"/>
      <rect x="272" y="76" width="190" height="48" rx="3" fill="var(--brand-light)" opacity=".16"/>
    </g>
    <g font-size="9.5" fill="var(--text)">
      <text x="282" y="42">header</text><text x="282" y="66">nav</text><text x="282" y="102">main</text>
    </g>
    <text x="240" y="143" text-anchor="middle" font-size="9.5" fill="var(--text-2)">标签本身就在说「我是什么」，辅助技术和爬虫不用猜</text>
  </svg>`,

  /* ---- 更多交互与无障碍（D5）---- */
  '工具提示（Tooltip）': `<svg viewBox="0 0 480 148" role="img" aria-label="工具提示示意">
    <rect x="60" y="86" width="120" height="34" rx="7" fill="var(--brand-light)" opacity=".8"/>
    <text x="120" y="108" text-anchor="middle" font-size="11" fill="#04211d">保存</text>
    <path d="M120 82V70" stroke="var(--brand-light)" stroke-width="1.2"/>
    <rect x="52" y="34" width="136" height="34" rx="6" fill="var(--surface)" stroke="var(--brand-light)" stroke-width="1.4"/>
    <path d="M116 68l6 7 6-7" fill="var(--surface)" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="120" y="56" text-anchor="middle" font-size="10" fill="var(--text)">保存当前草稿</text>
    <path d="M94 124l12 20 6-10 10 2z" fill="var(--text-3)" opacity=".7"/>
    <text x="240" y="52" font-size="10" fill="var(--text-2)">悬停或聚焦才出现</text>
    <text x="240" y="76" font-size="10" fill="var(--text-2)">只放一句补充说明</text>
    <text x="240" y="100" font-size="10" fill="var(--text-2)">别把关键操作藏进去</text>
    <text x="240" y="128" font-size="9" fill="var(--text-3)">触屏没有 hover，得留别的入口</text>
  </svg>`,

  '轻提示（Toast / Snackbar）': `<svg viewBox="0 0 480 148" role="img" aria-label="轻提示示意">
    <rect x="14" y="12" width="452" height="124" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g fill="var(--text-3)" opacity=".24">
      <rect x="30" y="30" width="180" height="8" rx="4"/><rect x="30" y="48" width="300" height="6" rx="3"/>
      <rect x="30" y="62" width="260" height="6" rx="3"/>
    </g>
    <text x="240" y="54" text-anchor="middle" font-size="10" fill="var(--text-2)">从底部冒出来，几秒后自己消失</text>
    <text x="240" y="74" text-anchor="middle" font-size="9" fill="var(--text-3)">不打断当前操作，也别塞长文案</text>
    <rect x="110" y="94" width="260" height="34" rx="7" fill="var(--surface)" stroke="var(--brand-light)" stroke-width="1.3"/>
    <circle cx="130" cy="110" r="7" fill="#22c55e" opacity=".24"/>
    <path d="M126 110l3 3 6-7" stroke="#22c55e" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <text x="146" y="115" font-size="10" fill="var(--text)">已保存草稿</text>
    <text x="286" y="115" font-size="10" fill="var(--brand-light)">撤销</text>
    <path d="M110 125h124" stroke="var(--brand-light)" stroke-width="2" opacity=".7"/>
  </svg>`,

  '跳转链接（Skip Link）': `<svg viewBox="0 0 480 148" role="img" aria-label="跳转链接示意">
    <text x="240" y="20" text-anchor="middle" font-size="10" fill="var(--text-2)">平时藏着不碍眼，键盘用户第一下就能用</text>
    <rect x="14" y="30" width="452" height="104" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="26" y="42" width="120" height="22" rx="5" fill="var(--brand-light)" opacity=".9"/>
    <text x="86" y="58" text-anchor="middle" font-size="10" fill="#04211d">跳到正文</text>
    <text x="160" y="58" font-size="9.5" fill="var(--text-3)">← 按第一下 Tab 时出现</text>
    <path d="M26 74h428" stroke="var(--border)" stroke-width="1.2"/>
    <g fill="var(--text-3)" opacity=".25">
      <rect x="26" y="86" width="180" height="8" rx="4"/><rect x="26" y="102" width="400" height="6" rx="3"/><rect x="26" y="116" width="360" height="6" rx="3"/>
    </g>
    <text x="240" y="145" text-anchor="middle" font-size="9.5" fill="var(--text-3)">别让用户按几十次 Tab 才能跳过导航</text>
  </svg>`,

  '对比度（Contrast Ratio）': `<svg viewBox="0 0 480 148" role="img" aria-label="文字对比度示意">
    <rect x="20" y="24" width="200" height="92" rx="7" fill="#f5f5f5"/>
    <text x="36" y="62" font-size="16" fill="#111">正文文字</text>
    <text x="36" y="86" font-size="10" fill="#555">次级说明文字</text>
    <text x="36" y="105" font-size="9" fill="#16a34a">✓ 4.5:1 以上，合格</text>
    <rect x="260" y="24" width="200" height="92" rx="7" fill="#f5f5f5"/>
    <text x="276" y="62" font-size="16" fill="#bbb">正文文字</text>
    <text x="276" y="86" font-size="10" fill="#ccc">次级说明文字</text>
    <text x="276" y="105" font-size="9" fill="#ef4444">✗ 2.1:1，看不清</text>
    <text x="240" y="140" text-anchor="middle" font-size="9.5" fill="var(--text-2)">正文至少 4.5:1，大字至少 3:1；浅灰字在白底上常不合格</text>
  </svg>`,

  /* ---- 更多设计流程（D6）---- */
  '信息架构（IA (Information Architecture)）': `<svg viewBox="0 0 480 148" role="img" aria-label="站点信息架构树示意">
    <rect x="186" y="14" width="108" height="24" rx="5" fill="var(--brand-light)" opacity=".22" stroke="var(--brand-light)"/>
    <text x="240" y="31" text-anchor="middle" font-size="10" fill="var(--text)">首页</text>
    <path d="M240 38v16M104 54h272M104 54v8M240 54v8M376 54v8" stroke="var(--border)" stroke-width="1.2" fill="none"/>
    <rect x="54" y="62" width="100" height="22" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="104" y="78" text-anchor="middle" font-size="9.5" fill="var(--text-2)">课程</text>
    <rect x="190" y="62" width="100" height="22" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="240" y="78" text-anchor="middle" font-size="9.5" fill="var(--text-2)">门禁与红线</text>
    <rect x="326" y="62" width="100" height="22" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="376" y="78" text-anchor="middle" font-size="9.5" fill="var(--text-2)">术语表</text>
    <g font-size="8.5" fill="var(--text-3)" text-anchor="middle">
      <text x="104" y="102">M01…M32</text><text x="240" y="102">四道门禁</text><text x="376" y="102">292 条</text>
    </g>
    <text x="240" y="132" text-anchor="middle" font-size="10" fill="var(--text-2)">先把东西放哪儿定下来，再谈页面长什么样</text>
  </svg>`,

  'A/B 测试（A/B Test）': `<svg viewBox="0 0 480 148" role="img" aria-label="A/B 测试分流示意">
    <rect x="184" y="16" width="112" height="26" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="240" y="34" text-anchor="middle" font-size="10" fill="var(--text)">进站访客</text>
    <path d="M226 42v16l-70 16M254 42v16l70 16" stroke="var(--brand-light)" stroke-width="1.3" fill="none"/>
    <text x="240" y="56" text-anchor="middle" font-size="9" fill="var(--text-3)">各 50%</text>
    <rect x="70" y="78" width="140" height="44" rx="6" fill="var(--brand-light)" opacity=".16" stroke="var(--brand-light)"/>
    <text x="140" y="98" text-anchor="middle" font-size="11" fill="var(--text)">A 版</text>
    <text x="140" y="114" text-anchor="middle" font-size="9" fill="var(--text-3)">转化率 3.1%</text>
    <rect x="270" y="78" width="140" height="44" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="340" y="98" text-anchor="middle" font-size="11" fill="var(--text)">B 版</text>
    <text x="340" y="114" text-anchor="middle" font-size="9" fill="var(--text-3)">转化率 4.4%</text>
    <text x="240" y="143" text-anchor="middle" font-size="9.5" fill="var(--text-2)">只改一个变量；样本量不够就别急着宣布谁赢了</text>
  </svg>`,

  /* ---- 更多性能度量（D8）---- */
  '渲染阻塞（Render Blocking）': `<svg viewBox="0 0 480 148" role="img" aria-label="渲染阻塞时间线示意">
    <path d="M30 70h420" stroke="var(--border)" stroke-width="1.2"/>
    <circle cx="40" cy="70" r="4" fill="var(--brand-light)"/>
    <circle cx="180" cy="70" r="5" fill="#ef4444"/>
    <circle cx="300" cy="70" r="4" fill="var(--brand-light)"/>
    <circle cx="440" cy="70" r="4" fill="var(--brand-light)"/>
    <g font-size="9.5" text-anchor="middle">
      <text x="40" y="58" fill="var(--text-2)">HTML 解析</text>
      <text x="180" y="58" fill="#ef4444">遇到 CSS / JS</text>
      <text x="300" y="58" fill="var(--text-2)">继续解析</text>
      <text x="440" y="58" fill="var(--text-2)">首屏出现</text>
    </g>
    <path d="M180 84h110" stroke="#ef4444" stroke-width="3"/>
    <text x="235" y="104" text-anchor="middle" font-size="9.5" fill="#ef4444">这段时间是白屏</text>
    <text x="240" y="132" text-anchor="middle" font-size="10" fill="var(--text-2)">CSS 放 head，脚本加 defer，别让它们挡住第一屏</text>
  </svg>`,

  '搜索结果页（SERP）': `<svg viewBox="0 0 480 148" role="img" aria-label="搜索结果页构成示意">
    <rect x="14" y="12" width="452" height="124" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="28" y="24" width="300" height="22" rx="11" fill="var(--surface)" stroke="var(--brand-light)" stroke-width="1.2"/>
    <text x="42" y="40" font-size="10" fill="var(--text-3)">网站建设 实训课</text>
    <rect x="340" y="24" width="112" height="22" rx="6" fill="var(--brand-light)" opacity=".8"/>
    <text x="396" y="40" text-anchor="middle" font-size="9.5" fill="#04211d">搜索</text>
    <rect x="28" y="58" width="424" height="24" rx="4" fill="var(--brand-light)" opacity=".13" stroke="var(--brand-light)" stroke-width="1" stroke-dasharray="3 2"/>
    <text x="38" y="75" font-size="9.5" fill="var(--text-3)">广告位（会标「广告」）</text>
    <text x="30" y="102" font-size="11" fill="var(--brand-light)">自然结果第一条 · 标题</text>
    <text x="30" y="120" font-size="9" fill="var(--text-3)">www.example.com › 路径 · 摘要 + 富摘要（评分 / 价格 / 步骤）</text>
  </svg>`,

  /* ---- 更多建站机制（S1 / S2 / S3 / S4 / S7）---- */
  '合并冲突': `<svg viewBox="0 0 480 148" role="img" aria-label="Git 合并冲突标记示意">
    <rect x="24" y="12" width="432" height="118" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g font-family="var(--font-mono)" font-size="10">
      <text x="38" y="38" fill="#ef4444">&lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD</text>
      <text x="38" y="58" fill="var(--text)">这里是你的改动</text>
      <text x="38" y="76" fill="#ef4444">=======</text>
      <text x="38" y="94" fill="var(--text)">这里是远端的改动</text>
      <text x="38" y="112" fill="#ef4444">&gt;&gt;&gt;&gt;&gt;&gt;&gt; feature</text>
    </g>
    <text x="240" y="144" text-anchor="middle" font-size="9.5" fill="var(--text-2)">别删标记假装没事：读懂两边，改完再提交</text>
  </svg>`,

  'A 记录 / CNAME': `<svg viewBox="0 0 480 148" role="img" aria-label="A 记录与 CNAME 区别示意">
    <text x="20" y="22" font-size="10" fill="var(--brand-light)">A 记录：名字 → IP</text>
    <rect x="30" y="34" width="140" height="28" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="100" y="53" text-anchor="middle" font-size="10" fill="var(--text)">www.example.com</text>
    <path d="M176 48h60m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <rect x="242" y="34" width="120" height="28" rx="5" fill="var(--brand-light)" opacity=".2" stroke="var(--brand-light)"/>
    <text x="302" y="53" text-anchor="middle" font-size="10" fill="var(--text)">1.2.3.4</text>
    <text x="20" y="86" font-size="10" fill="var(--text-2)">CNAME：名字 → 另一个名字</text>
    <rect x="30" y="98" width="140" height="28" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="100" y="117" text-anchor="middle" font-size="10" fill="var(--text)">shop.example.com</text>
    <path d="M176 112h60m0 0-8-6m8 6-8 6" stroke="var(--text-3)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <rect x="242" y="98" width="180" height="28" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="332" y="117" text-anchor="middle" font-size="9.5" fill="var(--text-2)">cname.provider.com → IP</text>
    <text x="240" y="144" text-anchor="middle" font-size="9" fill="var(--text-3)">CNAME 最终还是要落到某条 A 记录上</text>
  </svg>`,

  '反向代理与 proxy_pass': `<svg viewBox="0 0 480 148" role="img" aria-label="反向代理链路示意">
    <rect x="18" y="40" width="110" height="60" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="73" y="76" text-anchor="middle" font-size="10.5" fill="var(--text)">访客浏览器</text>
    <path d="M134 70h44m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <text x="156" y="58" text-anchor="middle" font-size="9" fill="var(--text-3)">:443</text>
    <rect x="186" y="28" width="112" height="84" rx="7" fill="var(--brand-light)" opacity=".15" stroke="var(--brand-light)" stroke-width="1.5"/>
    <text x="242" y="56" text-anchor="middle" font-size="11" fill="var(--brand-light)">nginx</text>
    <text x="242" y="76" text-anchor="middle" font-size="9" fill="var(--text-2)">终止 TLS / 静站</text>
    <text x="242" y="94" text-anchor="middle" font-size="9" fill="var(--text-2)">location 分流</text>
    <path d="M304 70h44m0 0-9-7m9 7-9 7" stroke="var(--text-3)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <text x="326" y="58" text-anchor="middle" font-size="9" fill="var(--text-3)">proxy_pass</text>
    <rect x="356" y="40" width="106" height="60" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="409" y="70" text-anchor="middle" font-size="10.5" fill="var(--text)">后端应用</text>
    <text x="409" y="88" text-anchor="middle" font-size="9" fill="var(--text-3)">127.0.0.1:3000</text>
    <text x="240" y="136" text-anchor="middle" font-size="9.5" fill="var(--text-2)">访客只看见 nginx；后端端口不必对外开放</text>
  </svg>`,

  '原子发布': `<svg viewBox="0 0 480 148" role="img" aria-label="原子发布软链切换示意">
    <text x="16" y="18" font-size="9.5" fill="var(--text-3)">发布前</text>
    <rect x="30" y="28" width="120" height="34" rx="5" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="90" y="50" text-anchor="middle" font-size="10" fill="var(--text-2)">current → v1</text>
    <path d="M186 46h26m0 0-8-6m8 6-8 6" stroke="var(--text-3)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <rect x="220" y="28" width="120" height="34" rx="5" fill="var(--brand-light)" opacity=".2" stroke="var(--brand-light)"/>
    <text x="280" y="50" text-anchor="middle" font-size="10" fill="var(--text)">v2 已备好</text>
    <text x="360" y="50" font-size="9" fill="var(--text-3)">先备好新版</text>
    <text x="16" y="94" font-size="9.5" fill="var(--brand-light)">切换一瞬间</text>
    <rect x="30" y="104" width="120" height="34" rx="5" fill="var(--brand-light)" opacity=".3" stroke="var(--brand-light)"/>
    <text x="90" y="126" text-anchor="middle" font-size="10" fill="var(--text)">current → v2</text>
    <text x="220" y="110" font-size="10" fill="var(--text-2)">改软链或原子换目录</text>
    <text x="220" y="132" font-size="10" fill="var(--text-2)">请求要么旧版，要么新版</text>
    <text x="360" y="94" font-size="9" fill="var(--text-3)">不出现半新半旧</text>
  </svg>`,

  'CDN': `<svg viewBox="0 0 480 148" role="img" aria-label="CDN 边缘节点回源示意">
    <rect x="20" y="52" width="92" height="44" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="66" y="80" text-anchor="middle" font-size="10.5" fill="var(--text)">访客</text>
    <path d="M118 74h52m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <rect x="178" y="38" width="124" height="72" rx="7" fill="var(--brand-light)" opacity=".16" stroke="var(--brand-light)" stroke-width="1.5"/>
    <text x="240" y="64" text-anchor="middle" font-size="10.5" fill="var(--brand-light)">边缘节点</text>
    <text x="240" y="84" text-anchor="middle" font-size="9" fill="var(--text-2)">有缓存就直返</text>
    <text x="240" y="100" text-anchor="middle" font-size="9" fill="var(--text-3)">没有就回源</text>
    <path d="M308 74h48m0 0-9-7m9 7-9 7" stroke="var(--text-3)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <rect x="364" y="52" width="96" height="44" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="412" y="80" text-anchor="middle" font-size="10.5" fill="var(--text)">源站</text>
    <text x="240" y="140" text-anchor="middle" font-size="9.5" fill="var(--text-2)">静态资源放 CDN，离用户近，还替源站挡流量</text>
  </svg>`,

  /* ---- 第三阶段补充：心智模型与工程基础（S0 / S1）---- */
  '静态站 / 单页应用': `<svg viewBox="0 0 480 148" role="img" aria-label="静态站与单页应用对比">
    <rect x="14" y="22" width="206" height="108" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="117" y="43" text-anchor="middle" font-size="11" fill="var(--brand-light)">静态站</text>
    <text x="117" y="64" text-anchor="middle" font-size="9.5" fill="var(--text-2)">每个地址一份 HTML</text>
    <g fill="var(--text-3)" opacity=".28">
      <rect x="30" y="78" width="54" height="22" rx="4"/><rect x="90" y="78" width="54" height="22" rx="4"/><rect x="150" y="78" width="54" height="22" rx="4"/>
    </g>
    <g font-size="8.5" fill="var(--text-3)" text-anchor="middle">
      <text x="57" y="93">/</text><text x="117" y="93">/about</text><text x="177" y="93">/contact</text>
    </g>
    <text x="117" y="122" text-anchor="middle" font-size="9" fill="var(--text-3)">翻页 = 整页重新加载</text>
    <path d="M228 76h24m0 0-8-6m8 6-8 6" stroke="var(--text-3)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <rect x="260" y="22" width="206" height="108" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="363" y="43" text-anchor="middle" font-size="11" fill="var(--brand-light)">单页应用 SPA</text>
    <text x="363" y="64" text-anchor="middle" font-size="9.5" fill="var(--text-2)">一个 HTML 壳 + JS 接管</text>
    <rect x="300" y="78" width="126" height="22" rx="4" fill="var(--brand-light)" opacity=".24"/>
    <text x="363" y="93" text-anchor="middle" font-size="9" fill="var(--text-2)">前端路由切换视图</text>
    <text x="363" y="122" text-anchor="middle" font-size="9" fill="var(--text-3)">翻页 = 换内容，不重载</text>
    <text x="240" y="144" text-anchor="middle" font-size="9" fill="var(--text-3)">按交互复杂度选，不是越新越好</text>
  </svg>`,

  '客户端与服务端': `<svg viewBox="0 0 480 148" role="img" aria-label="客户端与服务端请求响应示意">
    <rect x="16" y="40" width="140" height="64" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="86" y="66" text-anchor="middle" font-size="11" fill="var(--text)">浏览器 / 客户端</text>
    <text x="86" y="86" text-anchor="middle" font-size="9" fill="var(--text-3)">负责显示和交互</text>
    <path d="M162 62h140m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <text x="232" y="52" text-anchor="middle" font-size="9.5" fill="var(--brand-light)">请求 request</text>
    <path d="M302 90H162m0 0 9-7m-9 7 9 7" stroke="var(--text-3)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <text x="232" y="108" text-anchor="middle" font-size="9.5" fill="var(--text-3)">响应 response</text>
    <rect x="310" y="40" width="154" height="64" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="387" y="66" text-anchor="middle" font-size="11" fill="var(--text)">服务器 / 服务端</text>
    <text x="387" y="86" text-anchor="middle" font-size="9" fill="var(--text-3)">负责存储和计算</text>
    <text x="240" y="136" text-anchor="middle" font-size="9.5" fill="var(--text-2)">谁发起、谁等待，先分清再谈接口和密钥</text>
  </svg>`,

  'HTML / CSS / JavaScript': `<svg viewBox="0 0 480 148" role="img" aria-label="HTML CSS JavaScript 三层职责示意">
    <rect x="30" y="20" width="200" height="30" rx="5" fill="var(--brand-light)" opacity=".22" stroke="var(--brand-light)" stroke-width="1.2"/>
    <text x="44" y="40" font-size="10.5" fill="var(--text)">HTML　结构：有什么</text>
    <rect x="30" y="59" width="200" height="30" rx="5" fill="var(--brand-light)" opacity=".16" stroke="var(--brand-light)" stroke-width="1.2"/>
    <text x="44" y="79" font-size="10.5" fill="var(--text)">CSS　　样式：长什么样</text>
    <rect x="30" y="98" width="200" height="30" rx="5" fill="var(--brand-light)" opacity=".1" stroke="var(--brand-light)" stroke-width="1.2"/>
    <text x="44" y="118" font-size="10.5" fill="var(--text)">JS　　 行为：能做什么</text>
    <text x="256" y="48" font-size="10" fill="var(--text-2)">像盖房子：</text>
    <text x="256" y="72" font-size="10" fill="var(--text-2)">骨架 / 装修 / 水电</text>
    <text x="256" y="100" font-size="10" fill="var(--brand-light)">三层各管各的，</text>
    <text x="256" y="122" font-size="10" fill="var(--brand-light)">别用 JS 硬写样式</text>
  </svg>`,

  'favicon': `<svg viewBox="0 0 480 148" role="img" aria-label="网站 favicon 位置示意">
    <rect x="34" y="20" width="246" height="104" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <path d="M34 50h246" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="34" y="20" width="116" height="30" rx="8" fill="var(--surface)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="48" y="29" width="13" height="13" rx="3" fill="var(--brand-light)" opacity=".75"/>
    <text x="68" y="41" font-size="9.5" fill="var(--text-2)">我的网站</text>
    <rect x="152" y="20" width="110" height="30" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <circle cx="166" cy="35" r="6" fill="var(--text-3)" opacity=".3"/>
    <text x="68" y="80" font-size="10" fill="var(--text-2)">标签页上那枚小图标</text>
    <text x="68" y="104" font-size="9" fill="var(--text-3)">16×16 最常见，也叫网站图标</text>
    <text x="300" y="48" font-size="9.5" fill="var(--text-2)">放站点根目录 favicon.ico</text>
    <text x="300" y="70" font-size="9.5" fill="var(--text-2)">或用 link rel="icon" 指定</text>
    <text x="300" y="94" font-size="9.5" fill="var(--brand-light)">不放就显示默认地球</text>
    <text x="300" y="116" font-size="9" fill="var(--text-3)">它也是搜索结果里的小图</text>
  </svg>`,

  '工程目录三件套': `<svg viewBox="0 0 480 148" role="img" aria-label="工程目录三件套示意">
    <rect x="20" y="16" width="250" height="116" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g font-family="var(--font-mono)" font-size="10.5" fill="var(--text-2)">
      <text x="34" y="40">my-site/</text>
      <text x="48" y="64">├─ index.html</text>
      <text x="48" y="88">├─ assets/</text>
      <text x="48" y="112">└─ package.json</text>
    </g>
    <g font-size="9" fill="var(--text-3)">
      <text x="170" y="64">页面入口</text>
      <text x="170" y="88">样式 图片 脚本</text>
      <text x="170" y="112">依赖和命令</text>
    </g>
    <text x="294" y="48" font-size="10" fill="var(--brand-light)">入口页面：必须有</text>
    <text x="294" y="72" font-size="10" fill="var(--brand-light)">静态资源：基本都要</text>
    <text x="294" y="96" font-size="10" fill="var(--text-2)">package.json：</text>
    <text x="306" y="116" font-size="9.5" fill="var(--text-3)">零构建可以没有</text>
    <text x="240" y="145" text-anchor="middle" font-size="9" fill="var(--text-3)">先有这三样，再谈框架和构建工具</text>
  </svg>`,

  '工作区与暂存区': `<svg viewBox="0 0 480 148" role="img" aria-label="Git 工作区暂存区仓库示意">
    <rect x="16" y="40" width="126" height="62" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="79" y="66" text-anchor="middle" font-size="11" fill="var(--text)">工作区</text>
    <text x="79" y="86" text-anchor="middle" font-size="9" fill="var(--text-3)">你正在改的文件</text>
    <path d="M148 71h38m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <text x="167" y="60" text-anchor="middle" font-size="8.5" fill="var(--brand-light)">git add</text>
    <rect x="192" y="40" width="126" height="62" rx="7" fill="var(--brand-light)" opacity=".16" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="255" y="66" text-anchor="middle" font-size="11" fill="var(--text)">暂存区</text>
    <text x="255" y="86" text-anchor="middle" font-size="9" fill="var(--text-3)">准备提交的内容</text>
    <path d="M324 71h38m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <text x="343" y="60" text-anchor="middle" font-size="8.5" fill="var(--brand-light)">commit</text>
    <rect x="368" y="40" width="96" height="62" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="416" y="66" text-anchor="middle" font-size="11" fill="var(--text)">仓库</text>
    <text x="416" y="86" text-anchor="middle" font-size="9" fill="var(--text-3)">历史快照</text>
    <text x="240" y="132" text-anchor="middle" font-size="10" fill="var(--text-2)">commit 只拍暂存区；没 add 的改动不会进这次提交</text>
  </svg>`,

  '分支': `<svg viewBox="0 0 480 148" role="img" aria-label="Git 分支示意">
    <path d="M36 94h408" stroke="var(--border)" stroke-width="2"/>
    <path d="M150 94c0-40 30-52 80-52h70c40 0 50 20 50 52" stroke="var(--brand-light)" stroke-width="2" fill="none"/>
    <g fill="var(--border)"><circle cx="60" cy="94" r="5"/><circle cx="110" cy="94" r="5"/><circle cx="150" cy="94" r="5"/></g>
    <g fill="var(--brand-light)"><circle cx="230" cy="42" r="5"/><circle cx="300" cy="42" r="5"/></g>
    <g fill="var(--border)"><circle cx="380" cy="94" r="5"/><circle cx="430" cy="94" r="5"/></g>
    <text x="36" y="82" font-size="10" fill="var(--text-3)">main</text>
    <text x="230" y="30" text-anchor="middle" font-size="10" fill="var(--brand-light)">feature</text>
    <path d="M350 42v52m0 0-6-9m6 9 6-9" stroke="var(--brand-light)" stroke-width="1.5" fill="none"/>
    <text x="366" y="70" font-size="9" fill="var(--text-3)">合并回来</text>
    <text x="240" y="136" text-anchor="middle" font-size="9.5" fill="var(--text-2)">分支是平行推进的副本；主分支保持能上线，新功能在旁边做</text>
  </svg>`,

  'tag 与 Release': `<svg viewBox="0 0 480 148" role="img" aria-label="tag 与 Release 关系示意">
    <path d="M30 76h420" stroke="var(--border)" stroke-width="1.6"/>
    <g fill="var(--text-3)"><circle cx="70" cy="76" r="5"/><circle cx="150" cy="76" r="5"/><circle cx="230" cy="76" r="5"/><circle cx="390" cy="76" r="5"/></g>
    <circle cx="310" cy="76" r="7" fill="var(--brand-light)"/>
    <path d="M310 69v-18" stroke="var(--brand-light)" stroke-width="1.3"/>
    <rect x="266" y="30" width="88" height="22" rx="5" fill="var(--brand-light)" opacity=".22" stroke="var(--brand-light)"/>
    <text x="310" y="45" text-anchor="middle" font-size="10" fill="var(--brand-light)">tag v2.9.0</text>
    <path d="M360 76h44m0 0-9-7m9 7-9 7" stroke="var(--text-3)" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <rect x="410" y="52" width="60" height="48" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="440" y="72" text-anchor="middle" font-size="9.5" fill="var(--text)">Release</text>
    <text x="440" y="88" text-anchor="middle" font-size="8" fill="var(--text-3)">说明 + 产物</text>
    <text x="240" y="120" text-anchor="middle" font-size="10" fill="var(--text-2)">tag 是给某次提交起名字，Release 是挂在这个名字上的说明书</text>
    <text x="240" y="141" text-anchor="middle" font-size="9" fill="var(--text-3)">版本要对得上源码，别靠记忆</text>
  </svg>`,

  /* ---- 第三阶段补充：服务器与核验（S2 / S3 / S4 / S5）---- */
  '端口': `<svg viewBox="0 0 480 148" role="img" aria-label="服务器端口示意">
    <rect x="160" y="20" width="160" height="112" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.4"/>
    <text x="240" y="44" text-anchor="middle" font-size="11" fill="var(--text)">一台服务器</text>
    <text x="240" y="62" text-anchor="middle" font-size="9" fill="var(--text-3)">同一个 IP</text>
    <g stroke="var(--brand-light)" stroke-width="1.3" fill="var(--brand-light)" opacity=".2">
      <rect x="178" y="76" width="124" height="20" rx="4"/><rect x="178" y="102" width="124" height="20" rx="4"/>
    </g>
    <g font-family="var(--font-mono)" font-size="9.5" fill="var(--text)" text-anchor="middle">
      <text x="240" y="90">:443　HTTPS</text><text x="240" y="116">:22　 SSH</text>
    </g>
    <text x="24" y="88" font-size="10" fill="var(--text-2)">端口是服务器上的门牌号</text>
    <text x="24" y="110" font-size="10" fill="var(--text-2)">一个 IP 可以开很多门</text>
    <text x="346" y="80" font-size="10" fill="var(--brand-light)">80 → 443</text>
    <text x="346" y="104" font-size="10" fill="var(--text-2)">对外只开该开的</text>
    <text x="346" y="128" font-size="9" fill="var(--text-3)">其余交给防火墙</text>
  </svg>`,

  '安全组 / 防火墙': `<svg viewBox="0 0 480 148" role="img" aria-label="安全组放行与拦截示意">
    <path d="M152 20v108M170 20v108" stroke="var(--brand-light)" stroke-width="1.4" stroke-dasharray="4 3" opacity=".7"/>
    <text x="161" y="14" text-anchor="middle" font-size="9" fill="var(--brand-light)">安全组</text>
    <rect x="20" y="38" width="116" height="66" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="78" y="78" text-anchor="middle" font-size="10.5" fill="var(--text)">公网访客</text>
    <path d="M144 62h40m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.7" fill="none"/>
    <text x="196" y="54" font-size="9.5" fill="#22c55e">443 放行 ✓</text>
    <path d="M144 94h26" stroke="#ef4444" stroke-width="1.7"/>
    <path d="M170 88l12 12M182 88l-12 12" stroke="#ef4444" stroke-width="1.7"/>
    <text x="196" y="98" font-size="9.5" fill="#ef4444">3306 拒绝 ✗</text>
    <rect x="300" y="38" width="156" height="66" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="378" y="66" text-anchor="middle" font-size="10.5" fill="var(--text)">服务器</text>
    <text x="378" y="86" text-anchor="middle" font-size="9" fill="var(--text-3)">网站 + 数据库</text>
    <text x="240" y="136" text-anchor="middle" font-size="9.5" fill="var(--text-2)">默认全拒绝，只放行需要的端口和来源 IP</text>
  </svg>`,

  'HTTPS / TLS': `<svg viewBox="0 0 480 148" role="img" aria-label="HTTPS 加密链路示意">
    <rect x="18" y="42" width="120" height="62" rx="7" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="78" y="78" text-anchor="middle" font-size="10.5" fill="var(--text)">浏览器</text>
    <rect x="150" y="34" width="180" height="78" rx="8" fill="var(--brand-light)" opacity=".12" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="240" y="58" text-anchor="middle" font-size="10.5" fill="var(--brand-light)">TLS 加密通道</text>
    <path d="M174 74h132" stroke="var(--brand-light)" stroke-width="2" stroke-dasharray="6 4"/>
    <text x="240" y="96" text-anchor="middle" font-size="9" fill="var(--text-3)">证书验身份 → 协商密钥 → 内容加密</text>
    <rect x="342" y="42" width="120" height="62" rx="7" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="402" y="78" text-anchor="middle" font-size="10.5" fill="var(--text)">服务器</text>
    <text x="240" y="138" text-anchor="middle" font-size="9.5" fill="var(--text-2)">HTTPS = HTTP 套上 TLS；防的是中途偷看和篡改</text>
  </svg>`,

  '三层核验': `<svg viewBox="0 0 480 148" role="img" aria-label="发布三层核验示意">
    <g stroke="var(--border)" stroke-width="1.2" fill="var(--surface-2)">
      <rect x="16" y="30" width="130" height="66" rx="7"/><rect x="175" y="30" width="130" height="66" rx="7"/><rect x="334" y="30" width="130" height="66" rx="7"/>
    </g>
    <g font-size="10.5" fill="var(--text)" text-anchor="middle">
      <text x="81" y="54">本地构建</text><text x="240" y="54">线上返回</text><text x="399" y="54">服务器落盘</text>
    </g>
    <g font-family="var(--font-mono)" font-size="11" fill="var(--brand-light)" text-anchor="middle">
      <text x="81" y="80">a1b2c3</text><text x="240" y="80">a1b2c3</text><text x="399" y="80">a1b2c3</text>
    </g>
    <text x="153" y="65" text-anchor="middle" font-size="14" fill="var(--brand-light)">=</text>
    <text x="312" y="65" text-anchor="middle" font-size="14" fill="var(--brand-light)">=</text>
    <text x="240" y="120" text-anchor="middle" font-size="10" fill="var(--text-2)">三处哈希一致，才算真的发布成功</text>
    <text x="240" y="141" text-anchor="middle" font-size="9" fill="var(--text-3)">只看状态码 200，很可能是缓存或旧版本撑门面</text>
  </svg>`,

  '环境变量与 .env': `<svg viewBox="0 0 480 148" role="img" aria-label="环境变量与 env 文件示意">
    <rect x="18" y="38" width="106" height="66" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="71" y="64" text-anchor="middle" font-size="10.5" fill="var(--text)">.env 文件</text>
    <text x="71" y="84" text-anchor="middle" font-size="9" fill="#ef4444">不进 git</text>
    <path d="M130 71h34m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.6" fill="none"/>
    <rect x="170" y="38" width="120" height="66" rx="6" fill="var(--brand-light)" opacity=".15" stroke="var(--brand-light)"/>
    <text x="230" y="64" text-anchor="middle" font-size="10.5" fill="var(--text)">运行时环境</text>
    <text x="230" y="84" text-anchor="middle" font-size="9" fill="var(--text-3)">或 CI 的 Secrets</text>
    <path d="M296 71h34m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.6" fill="none"/>
    <rect x="336" y="38" width="126" height="66" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="399" y="64" text-anchor="middle" font-size="10.5" fill="var(--text)">程序读取</text>
    <text x="399" y="84" text-anchor="middle" font-size="9" fill="var(--text-3)">process.env</text>
    <text x="240" y="132" text-anchor="middle" font-size="10" fill="var(--text-2)">口令写进源码，就等于写进公开仓库</text>
  </svg>`,

  /* ---- 按「看不到图就讲不清」的标准再收尾一批机制类 ---- */
  '缓存与 Cache-Control': `<svg viewBox="0 0 480 148" role="img" aria-label="浏览器缓存决策示意">
    <rect x="28" y="30" width="120" height="44" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="88" y="58" text-anchor="middle" font-size="10.5" fill="var(--text)">再次请求资源</text>
    <path d="M154 52h32m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.6" fill="none"/>
    <rect x="192" y="30" width="128" height="44" rx="6" fill="var(--brand-light)" opacity=".16" stroke="var(--brand-light)"/>
    <text x="256" y="58" text-anchor="middle" font-size="10.5" fill="var(--text)">缓存还有效？</text>
    <path d="M256 80v22h-92m0 0 8-7m-8 7 8 7" stroke="#22c55e" stroke-width="1.6" fill="none"/>
    <text x="180" y="116" text-anchor="middle" font-size="9.5" fill="#22c55e">是：直接读本地</text>
    <path d="M256 80v22h104m0 0-8-7m8 7-8 7" stroke="var(--text-3)" stroke-width="1.6" fill="none"/>
    <text x="342" y="116" text-anchor="middle" font-size="9.5" fill="var(--text-2)">否：问服务器 / 回源</text>
    <text x="240" y="142" text-anchor="middle" font-size="9" fill="var(--text-3)">Cache-Control 决定「能不能缓存、缓存多久」</text>
  </svg>`,

  '回滚': `<svg viewBox="0 0 480 148" role="img" aria-label="版本回滚示意">
    <path d="M40 86h400" stroke="var(--border)" stroke-width="1.6"/>
    <g fill="var(--text-3)"><circle cx="80" cy="86" r="6"/><circle cx="220" cy="86" r="6"/></g>
    <circle cx="360" cy="86" r="7" fill="#ef4444"/>
    <g font-size="10" text-anchor="middle">
      <text x="80" y="110" fill="var(--brand-light)">v1 正常</text><text x="220" y="110" fill="var(--text-2)">v2 上线</text><text x="360" y="110" fill="#ef4444">出错</text>
    </g>
    <path d="M360 74c0-34-50-44-140-44" stroke="var(--brand-light)" stroke-width="1.8" fill="none"/>
    <path d="M220 30l-10-7m10 7-10 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <text x="292" y="22" text-anchor="middle" font-size="9.5" fill="var(--brand-light)">切回 v1</text>
    <text x="240" y="140" text-anchor="middle" font-size="9.5" fill="var(--text-2)">回滚不是重做，是把指针拨回上一个可用的版本</text>
  </svg>`,

  '404 页（404 Page）': `<svg viewBox="0 0 480 148" role="img" aria-label="404 页面示意">
    <rect x="20" y="14" width="440" height="120" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <path d="M20 40h440" stroke="var(--border)" stroke-width="1.2"/>
    <circle cx="36" cy="27" r="3.5" fill="var(--text-3)" opacity=".5"/><circle cx="48" cy="27" r="3.5" fill="var(--text-3)" opacity=".35"/><circle cx="60" cy="27" r="3.5" fill="var(--text-3)" opacity=".35"/>
    <text x="240" y="82" text-anchor="middle" font-size="30" fill="var(--brand-light)" font-family="var(--font-mono)">404</text>
    <text x="240" y="104" text-anchor="middle" font-size="10" fill="var(--text-2)">这个地址没有内容</text>
    <rect x="190" y="112" width="100" height="16" rx="8" fill="var(--brand-light)" opacity=".25"/>
    <text x="240" y="124" text-anchor="middle" font-size="8.5" fill="var(--text)">返回首页</text>
    <text x="320" y="70" font-size="9.5" fill="var(--text-2)">给出口，别只报错</text>
    <text x="320" y="92" font-size="9.5" fill="var(--text-2)">带搜索或导航链接</text>
  </svg>`,

  '加载态（Loading State）': `<svg viewBox="0 0 480 148" role="img" aria-label="加载状态示意">
    <circle cx="88" cy="60" r="22" fill="none" stroke="var(--border)" stroke-width="4"/>
    <path d="M88 38a22 22 0 0 1 22 22" fill="none" stroke="var(--brand-light)" stroke-width="4" stroke-linecap="round"/>
    <text x="88" y="112" text-anchor="middle" font-size="9.5" fill="var(--text-3)">转圈：等多久不知道</text>
    <rect x="190" y="52" width="180" height="16" rx="8" fill="var(--surface-2)" stroke="var(--border)"/>
    <rect x="190" y="52" width="116" height="16" rx="8" fill="var(--brand-light)" opacity=".7"/>
    <text x="280" y="112" text-anchor="middle" font-size="9.5" fill="var(--text-3)">进度条：知道大概多久</text>
    <rect x="400" y="48" width="64" height="26" rx="6" fill="var(--brand-light)" opacity=".5"/>
    <text x="432" y="66" text-anchor="middle" font-size="9.5" fill="var(--text)">提交中…</text>
    <text x="432" y="112" text-anchor="middle" font-size="9" fill="var(--text-3)">按钮：防重复点</text>
    <text x="240" y="140" text-anchor="middle" font-size="9.5" fill="var(--text-2)">光有转圈不够：告诉用户在等什么、大概等多久</text>
  </svg>`,

  '健康检查': `<svg viewBox="0 0 480 148" role="img" aria-label="健康检查探针示意">
    <rect x="22" y="44" width="120" height="58" rx="7" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="82" y="78" text-anchor="middle" font-size="10.5" fill="var(--text)">监控 / 探针</text>
    <path d="M148 72h56m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.7" fill="none"/>
    <text x="176" y="60" text-anchor="middle" font-size="8.5" fill="var(--text-3)">定期访问</text>
    <rect x="210" y="44" width="120" height="58" rx="7" fill="var(--brand-light)" opacity=".15" stroke="var(--brand-light)"/>
    <text x="270" y="68" text-anchor="middle" font-size="10.5" fill="var(--text)">/health</text>
    <text x="270" y="88" text-anchor="middle" font-size="9" fill="var(--text-3)">返回 200 + 简单 JSON</text>
    <path d="M336 72h56m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.7" fill="none"/>
    <rect x="398" y="44" width="64" height="58" rx="7" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="430" y="68" text-anchor="middle" font-size="9.5" fill="#22c55e">活着 ✓</text>
    <text x="430" y="88" text-anchor="middle" font-size="8.5" fill="var(--text-3)">否则告警</text>
    <text x="240" y="130" text-anchor="middle" font-size="10" fill="var(--text-2)">探针要轻：别查数据库一大圈，把自己查挂了</text>
  </svg>`,

  '301 重定向': `<svg viewBox="0 0 480 148" role="img" aria-label="301 永久重定向示意">
    <rect x="18" y="46" width="128" height="52" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="82" y="78" text-anchor="middle" font-size="9.5" fill="var(--text-2)">旧地址</text>
    <path d="M152 72h150m0 0-10-8m10 8-10 8" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <rect x="70" y="24" width="110" height="22" rx="5" fill="var(--brand-light)" opacity=".2" stroke="var(--brand-light)"/>
    <text x="125" y="40" text-anchor="middle" font-size="10" fill="var(--brand-light)">301 永久搬家</text>
    <rect x="310" y="46" width="152" height="52" rx="6" fill="var(--brand-light)" opacity=".15" stroke="var(--brand-light)"/>
    <text x="386" y="78" text-anchor="middle" font-size="9.5" fill="var(--text)">新地址 + 200</text>
    <text x="240" y="126" text-anchor="middle" font-size="10" fill="var(--text-2)">HTTP → HTTPS、裸域 → www，都用 301 把权重和访客一起带过去</text>
    <text x="240" y="144" text-anchor="middle" font-size="9" fill="var(--text-3)">临时挪动用 302，别混用</text>
  </svg>`,

  'webhook': `<svg viewBox="0 0 480 148" role="img" aria-label="webhook 事件推送示意">
    <rect x="18" y="42" width="130" height="60" rx="7" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="83" y="70" text-anchor="middle" font-size="10.5" fill="var(--text)">GitHub</text>
    <text x="83" y="88" text-anchor="middle" font-size="9" fill="var(--text-3)">push / merge 发生</text>
    <path d="M154 72h58m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <text x="183" y="60" text-anchor="middle" font-size="8.5" fill="var(--brand-light)">主动 POST</text>
    <rect x="218" y="42" width="140" height="60" rx="7" fill="var(--brand-light)" opacity=".14" stroke="var(--brand-light)"/>
    <text x="288" y="70" text-anchor="middle" font-size="10.5" fill="var(--text)">接收端</text>
    <text x="288" y="88" text-anchor="middle" font-size="9" fill="var(--text-3)">校验签名后执行</text>
    <path d="M364 72h46m0 0-9-7m9 7-9 7" stroke="var(--text-3)" stroke-width="1.6" fill="none"/>
    <text x="414" y="60" text-anchor="middle" font-size="10" fill="var(--text-2)">自动部署</text>
    <text x="240" y="132" text-anchor="middle" font-size="10" fill="var(--text-2)">webhook 是「事件到了通知你」，不用自己傻等轮询</text>
  </svg>`,

  'Bearer Token': `<svg viewBox="0 0 480 148" role="img" aria-label="Bearer Token 请求头示意">
    <rect x="18" y="24" width="444" height="58" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <text x="34" y="46" font-size="9.5" fill="var(--text-3)">GET /api/me HTTP/1.1</text>
    <text x="34" y="68" font-size="9.5" fill="var(--brand-light)">Authorization: Bearer eyJhbGciOi…</text>
    <path d="M232 90v22m0 0-6-8m6 8 6-8" stroke="var(--brand-light)" stroke-width="1.5" fill="none"/>
    <text x="70" y="126" font-size="10" fill="var(--text-2)">Bearer = 「拿着这个令牌的人」</text>
    <text x="300" y="112" font-size="10" fill="var(--text-2)">服务端验签后认身份</text>
    <text x="300" y="132" font-size="9" fill="var(--text-3)">放 URL 里会进日志，别那么干</text>
  </svg>`,

  'SNI': `<svg viewBox="0 0 480 148" role="img" aria-label="SNI 多证书选择示意">
    <rect x="18" y="46" width="116" height="56" rx="7" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="76" y="76" text-anchor="middle" font-size="10.5" fill="var(--text)">访客</text>
    <text x="76" y="94" text-anchor="middle" font-size="8.5" fill="var(--text-3)">要访问 a.com</text>
    <path d="M140 74h34m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.6" fill="none"/>
    <rect x="180" y="32" width="132" height="84" rx="7" fill="var(--brand-light)" opacity=".14" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="246" y="56" text-anchor="middle" font-size="10.5" fill="var(--brand-light)">同一个 IP:443</text>
    <text x="246" y="78" text-anchor="middle" font-size="9" fill="var(--text-2)">读取 SNI 里的域名</text>
    <text x="246" y="98" text-anchor="middle" font-size="9" fill="var(--text-2)">挑对应证书握手</text>
    <path d="M318 74h34m0 0-8-6m8 6-8 6" stroke="var(--brand-light)" stroke-width="1.6" fill="none"/>
    <rect x="358" y="46" width="104" height="56" rx="7" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="410" y="76" text-anchor="middle" font-size="9.5" fill="var(--text)">a.com 证书</text>
    <text x="410" y="94" text-anchor="middle" font-size="8.5" fill="var(--text-3)">不是 b.com 的</text>
    <text x="240" y="140" text-anchor="middle" font-size="9.5" fill="var(--text-2)">一台服务器多个 HTTPS 站点，靠 SNI 分辨你要哪家证书</text>
  </svg>`,

  /* ---- 补足到 100：同样是「看不到图就不知道长什么样」的词条 ---- */
  '触摸图标（Touch Icon）': `<svg viewBox="0 0 480 148" role="img" aria-label="触摸图标位置示意">
    <rect x="24" y="20" width="120" height="108" rx="18" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <rect x="56" y="40" width="56" height="56" rx="13" fill="var(--brand-light)" opacity=".3" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="84" y="74" text-anchor="middle" font-size="16" fill="var(--brand-light)">站</text>
    <text x="84" y="112" text-anchor="middle" font-size="8.5" fill="var(--text-3)">我的网站</text>
    <path d="M160 74h40m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.6" fill="none"/>
    <text x="220" y="52" font-size="10.5" fill="var(--brand-light)">加到主屏幕时用的图标</text>
    <text x="220" y="76" font-size="10" fill="var(--text-2)">比 favicon 大，一般 180×180 起</text>
    <text x="220" y="100" font-size="10" fill="var(--text-2)">四角会被系统裁圆，别放关键信息</text>
    <text x="220" y="126" font-size="9" fill="var(--text-3)">用 link rel="apple-touch-icon" 指定</text>
  </svg>`,

  '启动图 / 开屏页（Splash Screen）': `<svg viewBox="0 0 480 148" role="img" aria-label="启动图示意">
    <rect x="60" y="14" width="100" height="120" rx="16" fill="var(--brand-light)" opacity=".18" stroke="var(--border)" stroke-width="1.3"/>
    <circle cx="110" cy="60" r="18" fill="var(--brand-light)" opacity=".45"/>
    <text x="110" y="98" text-anchor="middle" font-size="9.5" fill="var(--text-2)">品牌名</text>
    <text x="110" y="116" text-anchor="middle" font-size="8" fill="var(--text-3)">启动中…</text>
    <path d="M178 74h44m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.7" fill="none"/>
    <rect x="232" y="14" width="100" height="120" rx="16" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <g fill="var(--text-3)" opacity=".28">
      <rect x="244" y="34" width="76" height="8" rx="4"/><rect x="244" y="52" width="76" height="8" rx="4"/><rect x="244" y="70" width="76" height="8" rx="4"/>
    </g>
    <text x="282" y="112" text-anchor="middle" font-size="8.5" fill="var(--text-3)">真正的应用界面</text>
    <text x="356" y="58" font-size="10" fill="var(--text-2)">先露品牌页，</text>
    <text x="356" y="80" font-size="10" fill="var(--text-2)">别让用户对着白屏等</text>
    <text x="356" y="106" font-size="9" fill="var(--text-3)">但别为了露而拖长</text>
  </svg>`,

  '下拉菜单（Dropdown）': `<svg viewBox="0 0 480 148" role="img" aria-label="下拉菜单示意">
    <rect x="40" y="20" width="150" height="30" rx="6" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.3"/>
    <text x="54" y="40" font-size="10" fill="var(--text-2)">选择语言</text>
    <path d="M170 31l6 6 6-6" stroke="var(--text-3)" stroke-width="1.5" fill="none"/>
    <rect x="40" y="54" width="150" height="82" rx="6" fill="var(--surface)" stroke="var(--brand-light)" stroke-width="1.4"/>
    <g font-size="10" fill="var(--text-2)">
      <text x="54" y="76">简体中文</text><text x="54" y="100">English</text><text x="54" y="124">日本語</text>
    </g>
    <rect x="40" y="62" width="150" height="18" rx="3" fill="var(--brand-light)" opacity=".16"/>
    <text x="212" y="72" font-size="10" fill="var(--brand-light)">点开才占位置</text>
    <text x="212" y="96" font-size="10" fill="var(--text-2)">当前项要标出来</text>
    <text x="212" y="120" font-size="10" fill="var(--text-2)">键盘也能上下选</text>
    <text x="212" y="142" font-size="9" fill="var(--text-3)">选中后要能收起来</text>
  </svg>`,

  '汉堡菜单（Hamburger Menu）': `<svg viewBox="0 0 480 148" role="img" aria-label="汉堡菜单展开示意">
    <rect x="40" y="44" width="120" height="58" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g stroke="var(--brand-light)" stroke-width="2.4" stroke-linecap="round">
      <path d="M78 62h44M78 73h44M78 84h44"/>
    </g>
    <text x="100" y="126" text-anchor="middle" font-size="9" fill="var(--text-3)">收起时只是一个图标</text>
    <path d="M176 73h40m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.7" fill="none"/>
    <rect x="226" y="20" width="200" height="108" rx="8" fill="var(--surface-2)" stroke="var(--brand-light)" stroke-width="1.4"/>
    <g font-size="10.5" fill="var(--text-2)">
      <text x="246" y="48">首页</text><text x="246" y="76">课程</text><text x="246" y="104">术语表</text>
    </g>
    <path d="M396 40l10 10M406 40l-10 10" stroke="var(--text-3)" stroke-width="1.6" stroke-linecap="round"/>
    <text x="326" y="142" text-anchor="middle" font-size="9" fill="var(--text-3)">展开后要有明确的关闭方式</text>
  </svg>`,

  '自动填充 / 联想（Autocomplete）': `<svg viewBox="0 0 480 148" role="img" aria-label="输入框联想列表示意">
    <rect x="34" y="24" width="240" height="32" rx="6" fill="var(--surface-2)" stroke="var(--brand-light)" stroke-width="1.4"/>
    <text x="48" y="45" font-size="10.5" fill="var(--text)">web</text>
    <path d="M70 48v26" stroke="var(--text-3)" stroke-width="1"/>
    <rect x="34" y="60" width="240" height="76" rx="6" fill="var(--surface)" stroke="var(--border)" stroke-width="1.2"/>
    <g font-size="10" fill="var(--text-2)"><text x="48" y="82">web training</text><text x="48" y="104">website design</text><text x="48" y="126">webhook</text></g>
    <rect x="34" y="66" width="240" height="18" fill="var(--brand-light)" opacity=".14"/>
    <text x="296" y="70" font-size="10" fill="var(--brand-light)">输一半就给候选</text>
    <text x="296" y="94" font-size="10" fill="var(--text-2)">键盘能选、能跳过</text>
    <text x="296" y="118" font-size="10" fill="var(--text-2)">别挡住下面的表单</text>
  </svg>`,

  '步进器（Stepper）': `<svg viewBox="0 0 480 148" role="img" aria-label="数量步进器示意">
    <rect x="40" y="54" width="36" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <path d="M52 72h12" stroke="var(--text-3)" stroke-width="2"/>
    <rect x="80" y="54" width="56" height="36" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="108" y="78" text-anchor="middle" font-size="14" fill="var(--text)">1</text>
    <rect x="140" y="54" width="36" height="36" rx="6" fill="var(--brand-light)" opacity=".5"/>
    <path d="M152 72h12M158 66v12" stroke="#04211d" stroke-width="2"/>
    <text x="108" y="116" text-anchor="middle" font-size="9.5" fill="var(--text-3)">到下限就禁用减号</text>
    <path d="M196 72h40m0 0-9-7m9 7-9 7" stroke="var(--text-3)" stroke-width="1.6" fill="none"/>
    <text x="260" y="60" font-size="10" fill="var(--text-2)">一屏能看清数量</text>
    <text x="260" y="84" font-size="10" fill="var(--text-2)">比让用户手输数字稳</text>
    <text x="260" y="108" font-size="9" fill="var(--text-3)">记得设上下限</text>
  </svg>`,

  '分页（Pagination）': `<svg viewBox="0 0 480 148" role="img" aria-label="分页控件示意">
    <rect x="40" y="56" width="52" height="32" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="66" y="77" text-anchor="middle" font-size="10" fill="var(--text-3)">上一页</text>
    <g>
      <rect x="100" y="56" width="30" height="32" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
      <rect x="136" y="56" width="30" height="32" rx="6" fill="var(--brand-light)" opacity=".85"/>
      <rect x="172" y="56" width="30" height="32" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
      <rect x="208" y="56" width="30" height="32" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
      <rect x="244" y="56" width="30" height="32" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    </g>
    <g font-size="11" text-anchor="middle" fill="var(--text-2)">
      <text x="115" y="78">1</text><text x="151" y="78" fill="#04211d">2</text><text x="187" y="78">3</text><text x="223" y="78">4</text><text x="259" y="78">…</text>
    </g>
    <rect x="282" y="56" width="52" height="32" rx="6" fill="var(--surface-2)" stroke="var(--border)"/>
    <text x="308" y="77" text-anchor="middle" font-size="10" fill="var(--text-3)">下一页</text>
    <text x="356" y="70" font-size="10" fill="var(--brand-light)">当前页要一眼看出</text>
    <text x="356" y="94" font-size="10" fill="var(--text-2)">首页 / 末页给快捷入口</text>
    <text x="356" y="118" font-size="9" fill="var(--text-3)">换页后要滚回列表顶部</text>
  </svg>`,

  '无限滚动（Infinite Scroll）': `<svg viewBox="0 0 480 148" role="img" aria-label="无限滚动示意">
    <rect x="40" y="14" width="200" height="120" rx="8" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <g stroke="var(--border)" stroke-width="1.2">
      <rect x="52" y="26" width="176" height="26" rx="4"/><rect x="52" y="60" width="176" height="26" rx="4"/><rect x="52" y="94" width="176" height="26" rx="4"/>
    </g>
    <path d="M140 116v18m0 0-5-8m5 8 5-8" stroke="var(--brand-light)" stroke-width="1.5" fill="none"/>
    <text x="140" y="146" text-anchor="middle" font-size="9" fill="var(--brand-light)">滚到底自动加载下一批</text>
    <text x="262" y="52" font-size="10" fill="var(--text-2)">没有页码，一路往下</text>
    <text x="262" y="76" font-size="10" fill="var(--text-2)">要给「正在加载」反馈</text>
    <text x="262" y="100" font-size="10" fill="var(--text-2)">到底了也要明说</text>
    <text x="262" y="126" font-size="9" fill="var(--text-3)">否则用户不知道有没有下一页</text>
  </svg>`,

  '字偶间距（Kerning）': `<svg viewBox="0 0 480 148" role="img" aria-label="字偶间距示意">
    <text x="40" y="30" font-size="10" fill="var(--text-3)">不调：A 和 V 之间空得难受</text>
    <text x="40" y="76" font-size="46" fill="var(--text-3)">AV</text>
    <path d="M40 88h104" stroke="#ef4444" stroke-width="1.4" stroke-dasharray="4 3"/>
    <text x="40" y="108" font-size="10" fill="#ef4444">▲ 这一对要单独收一收</text>
    <text x="260" y="30" font-size="10" fill="var(--text-3)">调过：贴得刚好</text>
    <text x="260" y="76" font-size="46" fill="var(--brand-light)">AV</text>
    <path d="M260 88h104" stroke="var(--brand-light)" stroke-width="1.4" stroke-dasharray="4 3"/>
    <text x="260" y="108" font-size="10" fill="var(--brand-light)">▲ 字偶间距按「一对」算</text>
    <text x="240" y="136" text-anchor="middle" font-size="9.5" fill="var(--text-2)">不是所有字距都一样；字母组合不同，该收的多少也不同</text>
  </svg>`,

  '字间距（Tracking / Letter-spacing）': `<svg viewBox="0 0 480 148" role="img" aria-label="字间距示意">
    <text x="30" y="40" font-size="10" fill="var(--text-3)">紧</text>
    <text x="80" y="42" font-size="18" fill="var(--text-2)">字体排版</text>
    <text x="30" y="86" font-size="10" fill="var(--brand-light)">适中</text>
    <text x="80" y="88" font-size="18" fill="var(--text)" letter-spacing="2">字体排版</text>
    <text x="30" y="132" font-size="10" fill="var(--text-3)">松</text>
    <text x="80" y="134" font-size="18" fill="var(--text-3)" letter-spacing="7">字体排版</text>
    <path d="M250 44h60m0 0-7-5m7 5-7 5" stroke="var(--brand-light)" stroke-width="1.4" fill="none"/>
    <text x="322" y="48" font-size="10" fill="var(--text-2)">整段统一加或减</text>
    <text x="250" y="88" font-size="10" fill="var(--text-2)">中文标题略松更透气</text>
    <text x="250" y="112" font-size="10" fill="var(--text-2)">正文别拉太开，会散</text>
    <text x="250" y="136" font-size="9" fill="var(--text-3)">字间距是「整段」，字偶间距是「一对」</text>
  </svg>`,

  /* ---- 最后 10 张：位置与形态类，仍不拿纯文字概念凑数 ---- */
  '首屏（Above the Fold）': `<svg viewBox="0 0 480 148" role="img" aria-label="首屏折叠线示意">
    <rect x="36" y="12" width="180" height="124" rx="7" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.2"/>
    <rect x="36" y="12" width="180" height="72" fill="var(--brand-light)" opacity=".14"/>
    <path d="M36 84h180" stroke="var(--brand-light)" stroke-width="1.6" stroke-dasharray="5 3"/>
    <text x="126" y="50" text-anchor="middle" font-size="11" fill="var(--brand-light)">首屏 Above the Fold</text>
    <text x="126" y="70" text-anchor="middle" font-size="9" fill="var(--text-3)">不用滚就能看到</text>
    <text x="126" y="108" text-anchor="middle" font-size="9.5" fill="var(--text-3)">↓ 要滚一下才看到</text>
    <text x="240" y="46" font-size="10" fill="var(--brand-light)">这条线说的是「初始视口」</text>
    <text x="240" y="72" font-size="10" fill="var(--text-2)">不是固定的像素高度</text>
    <text x="240" y="98" font-size="10" fill="var(--text-2)">手机和电脑的位置不一样</text>
    <text x="240" y="126" font-size="9" fill="var(--text-3)">重要的东西别埋在线下面</text>
  </svg>`,

  '视口（Viewport）': `<svg viewBox="0 0 480 148" role="img" aria-label="视口示意">
    <rect x="36" y="18" width="176" height="104" rx="12" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.4"/>
    <text x="124" y="40" text-anchor="middle" font-size="9" fill="var(--text-3)">浏览器窗口</text>
    <rect x="52" y="52" width="144" height="62" rx="4" fill="var(--brand-light)" opacity=".18" stroke="var(--brand-light)" stroke-width="1.2" stroke-dasharray="4 3"/>
    <text x="124" y="88" text-anchor="middle" font-size="10.5" fill="var(--brand-light)">viewport</text>
    <path d="M226 70h40m0 0-9-7m9 7-9 7" stroke="var(--brand-light)" stroke-width="1.6" fill="none"/>
    <text x="286" y="52" font-size="10" fill="var(--text-2)">用户实际能看见的那块区域</text>
    <text x="286" y="76" font-size="10" fill="var(--text-2)">媒体查询按它来判断宽度</text>
    <text x="286" y="100" font-size="10" fill="var(--text-2)">写 width=device-width 才跟设备一致</text>
    <text x="286" y="126" font-size="9" fill="var(--text-3)">别忘了还有 meta viewport 这一行</text>
  </svg>`,

  '安全区（Safe Area）': `<svg viewBox="0 0 480 148" role="img" aria-label="手机安全区示意">
    <rect x="130" y="10" width="160" height="128" rx="22" fill="var(--surface-2)" stroke="var(--border)" stroke-width="1.5"/>
    <rect x="142" y="26" width="136" height="18" rx="9" fill="var(--text-3)" opacity=".35"/>
    <rect x="142" y="104" width="136" height="22" rx="6" fill="var(--text-3)" opacity=".2"/>
    <rect x="148" y="48" width="124" height="52" rx="4" fill="var(--brand-light)" opacity=".16" stroke="var(--brand-light)" stroke-width="1.3" stroke-dasharray="4 3"/>
    <text x="210" y="80" text-anchor="middle" font-size="10" fill="var(--brand-light)">安全区</text>
    <text x="20" y="56" font-size="9.5" fill="#ef4444">刘海 / 摄像头</text>
    <path d="M100 44h30m0 0-7-5m7 5-7 5" stroke="#ef4444" stroke-width="1.3" fill="none"/>
    <text x="310" y="60" font-size="10" fill="var(--text-2)">底部小黑条</text>
    <path d="M278 112h32m0 0-7-5m7 5-7 5" stroke="var(--text-3)" stroke-width="1.3" fill="none"/>
    <text x="316" y="94" font-size="10" fill="var(--text-2)">内容留在虚线内</text>
    <text x="316" y="118" font-size="9" fill="var(--text-3)">别被刘海和横条挡住</text>
    <text x="240" y="146" text-anchor="middle" font-size="9" fill="var(--text-3)">用 env(safe-area-inset-*) 留出边距</text>
  </svg>`,

  '吸顶导航（Sticky Header）': `<svg viewBox="0 0 480 148" role="img" aria-label="吸顶导航滚动示意">
    <text x="24" y="22" font-size="9.5" fill="var(--text-3)">滚动前</text>
    <rect x="24" y="30" width="180" height="100" rx="7" fill="var(--surface-2)" stroke="var(--border)"/>
    <rect x="24" y="30" width="180" height="22" rx="7" fill="var(--brand-light)" opacity=".28"/>
    <text x="114" y="46" text-anchor="middle" font-size="9.5" fill="var(--text)">导航在顶部</text>
    <g fill="var(--text-3)" opacity=".24"><rect x="36" y="66" width="156" height="7" rx="3.5"/><rect x="36" y="82" width="130" height="7" rx="3.5"/></g>
    <text x="230" y="82" text-anchor="middle" font-size="18" fill="var(--brand-light)">→</text>
    <text x="274" y="22" font-size="9.5" fill="var(--text-3)">滚动后</text>
    <rect x="274" y="30" width="180" height="100" rx="7" fill="var(--surface-2)" stroke="var(--border)"/>
    <rect x="274" y="30" width="180" height="22" rx="7" fill="var(--brand-light)" opacity=".55"/>
    <text x="364" y="46" text-anchor="middle" font-size="9.5" fill="var(--text)">导航还钉在上面</text>
    <g fill="var(--text-3)" opacity=".24"><rect x="286" y="66" width="156" height="7" rx="3.5"/><rect x="286" y="82" width="130" height="7" rx="3.5"/></g>
    <text x="240" y="145" text-anchor="middle" font-size="9" fill="var(--text-3)">position: sticky; top: 0；别忘了给内容留出被遮住的高度</text>
  </svg>`,

  '轮播（Carousel / Slider）': `<svg viewBox="0 0 480 148" role="img" aria-label="轮播组件示意">
    <rect x="70" y="30" width="250" height="80" rx="6" fill="var(--brand-light)" opacity=".22" stroke="var(--brand-light)" stroke-width="1.3"/>
    <path d="M70 92l60-34 50 28 44-24 96 30" stroke="var(--brand-light)" stroke-width="1.3" fill="none" opacity=".6"/>
    <circle cx="122" cy="56" r="8" fill="var(--brand-light)" opacity=".45"/>
    <text x="195" y="140" text-anchor="middle" font-size="9" fill="var(--text-3)">当前这张</text>
    <circle cx="48" cy="70" r="15" fill="var(--surface-2)" stroke="var(--border)"/>
    <path d="M52 70l-8-6v12z" fill="var(--text-3)"/>
    <circle cx="342" cy="70" r="15" fill="var(--surface-2)" stroke="var(--border)"/>
    <path d="M338 64l8 6-8 6z" fill="var(--text-3)"/>
    <g fill="var(--text-3)" opacity=".35">
      <circle cx="166" cy="122" r="4"/><circle cx="180" cy="122" r="4"/><circle cx="194" cy="122" r="4"/>
    </g>
    <circle cx="180" cy="122" r="4" fill="var(--brand-light)"/>
    <text x="378" y="62" font-size="10" fill="var(--text-2)">一次只露一张</text>
    <text x="378" y="86" font-size="10" fill="var(--text-2)">要有指示点和箭头</text>
    <text x="378" y="110" font-size="9" fill="var(--text-3)">自动播要能暂停</text>
  </svg>`,

  '瀑布流（Masonry）': `<svg viewBox="0 0 480 148" role="img" aria-label="瀑布流布局示意">
    <g stroke="var(--border)" stroke-width="1.2" fill="var(--surface-2)">
      <rect x="30" y="18" width="96" height="62" rx="4"/><rect x="30" y="88" width="96" height="44" rx="4"/>
      <rect x="136" y="18" width="96" height="42" rx="4"/><rect x="136" y="68" width="96" height="64" rx="4"/>
      <rect x="242" y="18" width="96" height="74" rx="4"/><rect x="242" y="100" width="96" height="32" rx="4"/>
    </g>
    <g fill="var(--brand-light)" opacity=".24">
      <rect x="30" y="18" width="96" height="62" rx="4"/><rect x="136" y="68" width="96" height="64" rx="4"/><rect x="242" y="18" width="96" height="74" rx="4"/>
    </g>
    <text x="360" y="52" font-size="10" fill="var(--brand-light)">高度不齐，依次往上填</text>
    <text x="360" y="76" font-size="10" fill="var(--text-2)">不是整齐的网格</text>
    <text x="360" y="100" font-size="10" fill="var(--text-2)">图片墙常用这种</text>
    <text x="360" y="126" font-size="9" fill="var(--text-3)">先定宽，高度让内容决定</text>
  </svg>`,

  '等宽数字（Tabular Figures）': `<svg viewBox="0 0 480 148" role="img" aria-label="等宽数字对齐示意">
    <text x="24" y="26" font-size="9.5" fill="var(--text-3)">比例数字：宽度不一，小数点歪</text>
    <g font-family="var(--font-mono)" font-size="16" fill="var(--text-3)">
      <text x="40" y="54">1,234.00</text><text x="40" y="82">98.50</text><text x="40" y="110">7.20</text>
    </g>
    <path d="M126 40v76" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="3 3"/>
    <text x="264" y="26" font-size="9.5" fill="var(--brand-light)">等宽数字：每一位一样宽，对齐</text>
    <g font-family="var(--font-mono)" font-size="16" fill="var(--text)" font-variant-numeric="tabular-nums">
      <text x="280" y="54">1,234.00</text><text x="280" y="82">　 98.50</text><text x="280" y="110">　　7.20</text>
    </g>
    <path d="M366 40v76" stroke="var(--brand-light)" stroke-width="1.2" stroke-dasharray="3 3"/>
    <text x="240" y="140" text-anchor="middle" font-size="9.5" fill="var(--text-2)">表格、价格、倒计时用它，数字跳动时不会左右晃</text>
  </svg>`,

  '字重（Font Weight）': `<svg viewBox="0 0 480 148" role="img" aria-label="字重示意">
    <text x="30" y="46" font-size="22" font-weight="300" fill="var(--text-3)">细 Light</text>
    <text x="200" y="46" font-size="22" font-weight="400" fill="var(--text-2)">常规 Regular</text>
    <text x="30" y="94" font-size="22" font-weight="600" fill="var(--text)">中等 Semibold</text>
    <text x="200" y="94" font-size="22" font-weight="800" fill="var(--text)">粗 Bold</text>
    <text x="30" y="130" font-size="10" fill="var(--text-3)">同一字体才有多档字重</text>
    <text x="260" y="130" font-size="10" fill="var(--brand-light)">靠字重分层，比换字体干净</text>
  </svg>`,

  '最大内容绘制（LCP (Largest Contentful Paint)）': `<svg viewBox="0 0 480 148" role="img" aria-label="LCP 时间线示意">
    <path d="M40 90h400" stroke="var(--border)" stroke-width="1.4"/>
    <g fill="var(--text-3)"><circle cx="70" cy="90" r="4"/><circle cx="160" cy="90" r="4"/><circle cx="300" cy="90" r="6"/></g>
    <g font-size="9.5" text-anchor="middle">
      <text x="70" y="110" fill="var(--text-3)">0 s</text>
      <text x="160" y="110" fill="var(--text-3)">1.1 s 标题</text>
      <text x="300" y="110" fill="var(--brand-light)">2.1 s 大图</text>
    </g>
    <text x="300" y="76" text-anchor="middle" font-size="10" fill="var(--brand-light)">LCP = 2.1 s</text>
    <path d="M380 90v-30" stroke="#ef4444" stroke-width="1.4" stroke-dasharray="4 3"/>
    <text x="386" y="64" font-size="9.5" fill="#ef4444">红线 2.5 s</text>
    <text x="240" y="140" text-anchor="middle" font-size="9.5" fill="var(--text-2)">量的是「最大的那块内容什么时候画出来」，通常是首屏大图或大标题</text>
  </svg>`,

  '预发布': `<svg viewBox="0 0 480 148" role="img" aria-label="三个环境示意">
    <g stroke="var(--border)" stroke-width="1.2" fill="var(--surface-2)">
      <rect x="20" y="38" width="126" height="66" rx="7"/><rect x="177" y="38" width="126" height="66" rx="7"/><rect x="334" y="38" width="126" height="66" rx="7"/>
    </g>
    <g font-size="11" fill="var(--text)" text-anchor="middle">
      <text x="83" y="66">开发 dev</text><text x="240" y="66">预发布 staging</text><text x="397" y="66">生产 prod</text>
    </g>
    <g font-size="9" fill="var(--text-3)" text-anchor="middle">
      <text x="83" y="88">随便改</text><text x="240" y="88">和线上一样</text><text x="397" y="88">给真用户</text>
    </g>
    <path d="M152 71h21m0 0-7-5m7 5-7 5" stroke="var(--brand-light)" stroke-width="1.5" fill="none"/>
    <path d="M309 71h21m0 0-7-5m7 5-7 5" stroke="var(--brand-light)" stroke-width="1.5" fill="none"/>
    <text x="240" y="128" text-anchor="middle" font-size="10" fill="var(--text-2)">在像线上的地方先过一遍，别拿用户当测试</text>
  </svg>`,
};

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
  const L = links('../../');
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
    prefix: '../../',
    canon: `/lessons/${mod.no}`,
  })}
<body data-page="lesson" data-total="${TOTAL}" data-mod="${mod.no}">
${topbar({ base: '../../', current: '' })}
<a class="skip" href="#main">跳到正文</a>

<div class="shell lesson">
  <div class="lesson-grid">
    <main class="lesson-main" id="main">
      <div class="crumb">
        <a href="${L.home}">总览</a><span class="sep">/</span>
        <a href="${L.map}">课程地图</a><span class="sep">/</span>
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
          ${mod.pts.map(p => `<li>${inline(p)}</li>`).join('\n          ')}
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
        <h2><span class="i">${num()}</span>本讲术语<span class="n"><a href="${L.glossary}">全部 ${GLOSSARY.length} 条</a></span></h2>
        <ul class="pts">
          ${terms.map(t => `<li><b><a href="${L.glossary}#${t.id}">${esc(t.name)}</a></b>：${esc(t.desc)}</li>`).join('\n          ')}
        </ul>
      </section>
` : ''}
      <div class="pager">
        ${prev ? `<a class="prev" href="${L.lesson(prev.no)}"><span class="dir">← 上一讲</span><span class="tt">${prev.no} ${esc(prev.t)}</span></a>` : '<span class="sp"></span>'}
        ${next ? `<a class="next" href="${L.lesson(next.no)}"><span class="dir">下一讲 →</span><span class="tt">${next.no} ${esc(next.t)}</span></a>` : '<span class="sp"></span>'}
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
          ${stage.mods.map(x => `<li><a href="${L.lesson(x.no)}"${x.no === mod.no ? ' class="on" aria-current="page"' : ''}>${x.no} ${esc(x.t)}</a></li>`).join('\n          ')}
        </ol>
      </div>
      ${next ? `<div class="blk"><p class="rail-h">下一讲</p><a class="nex" href="${L.lesson(next.no)}"><span>${next.no}</span>${esc(next.t)}</a></div>` : ''}
    </aside>
  </div>
</div>

${footer({ prefix: '../../', base: '../../' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="../../assets/app.js"></script>
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
    prefix: '../',
    canon: '/map',
  })}
<body data-page="map" data-total="${TOTAL}">
${topbar({ base: '../', current: 'map' })}
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

${footer({ prefix: '../', base: '../' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="../assets/app.js"></script>
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
    prefix: '../',
    canon: '/gates',
  })}
<body data-page="gates" data-total="${TOTAL}">
${topbar({ base: '../', current: 'gates' })}
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

${footer({ prefix: '../', base: '../' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="../assets/app.js"></script>
</body>
</html>
`;
}

/* ============================== 术语页 ============================== */

function glossaryPage() {
  /* 术语按「所属阶段」分组：字典按阅读顺序排，比一长串平铺好查得多。
     每条术语第三位是阶段号（S0…S9），没有的落到「通用」。 */
  // 第四位是可选的「明细」：像 HTTP 状态码、DNS 记录类型这种天然是表格的，
  // 压成一句话就废了。用两列小表渲染，仍挂在同一条术语下。
  const rowOf = i => {
    const g = GLOSSARY[i];
    const rows = Array.isArray(g[3]) && g[3].length
      ? `<dl class="gl-sub">${g[3].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
      : '';
    const fig = FIGURES[g[0]] ? `<figure class="gl-fig">${FIGURES[g[0]]}</figure>` : '';
    return `<div id="${termId(i)}"${fig ? ' class="has-fig"' : ''}><dt>${esc(g[0])}</dt><dd>${esc(g[1])}</dd>${rows}${fig}</div>`;
  };
  const idxOf = sid => GLOSSARY.map((g, i) => (g[2] === sid ? i : -1)).filter(i => i >= 0);
  const figN = Object.keys(FIGURES).filter(k => GLOSSARY.some(g => g[0] === k)).length;
  const GROUP_LIST = [...STAGES.map(st => [st.id, st.name]), ...D_CATS];
  const groups = GROUP_LIST.map(([id, name]) => {
    const idx = idxOf(id);
    if (!idx.length) return '';
    return `<h2 class="gl-head" id="${id.toLowerCase()}">${id} ${esc(name)}<span class="n">${idx.length} 条</span></h2>
    <div class="gloss">
      ${idx.map(rowOf).join('\n      ')}
    </div>`;
  }).filter(Boolean).join('\n    ');

  const chip = id => {
    const n = idxOf(id).length;
    return n ? `<a href="#${id.toLowerCase()}">${id}<b>${n}</b></a>` : '';
  };
  const jumpStage = STAGES.map(st => chip(st.id)).filter(Boolean).join('');
  const jumpCat = D_CATS.map(([id]) => chip(id)).filter(Boolean).join('');

  /* 每条术语反查：哪几讲讲到了它 —— 让术语表不只是词典，还能当索引用 */
  const usedIn = GLOSSARY.map((g, i) => {
    const hit = MODULES.filter(m => termsOf(m).some(t => t.id === termId(i)));
    return { name: g[0], id: termId(i), mods: hit };
  });

  const index = usedIn.filter(x => x.mods.length).map(x =>
    `<div class="gi-row"><a class="gi-t" href="#${x.id}">${esc(x.name)}</a><span class="gi-m">${x.mods.map(m => `<a href="../lessons/${m.no}/">${m.no}</a>`).join('')}</span></div>`
  ).join('\n      ');

  return `${head({
    title: '术语表 · 从 0 到上线',
    desc: `共 ${GLOSSARY.length} 条术语，附出处讲次与反查索引。凡本站自造的词（门禁、打通、假绿、哨兵）都在这里有定义 —— 自造的词必须在使用处给定义。`,
    prefix: '../',
    canon: '/glossary',
  })}
<body data-page="glossary" data-total="${TOTAL}">
${topbar({ base: '../', current: 'glossary' })}
<a class="skip" href="#main">跳到正文</a>

<main id="main">
<section class="hero sm">
  <div class="shell">
    <div class="kicker">Reference · 术语</div>
    <h1>术语表</h1>
    <p class="lead">共 ${GLOSSARY.length} 条：${STAGES.filter(s => idxOf(s.id).length).length} 组按课程阶段，${D_CATS.filter(([c]) => idxOf(c).length).length} 组按设计类别。通用术语取自建站全流程，本站自造的词（门禁、打通、假绿、哨兵…）也在里面 —— 这是第 ${REDLINES.length} 条红线：<b>自造的词必须在使用处给定义，否则就是给别人留债</b>。其中 ${figN} 条配了示意图 —— 光看文字想不出来的，画出来。</p>
  </div>
</section>

<section class="sec" id="list">
  <div class="shell">
    <div class="gl-search">
      <input id="gl-q" type="search" autocomplete="off" placeholder="搜术语：中文、英文、缩写都行（如 状态码 / Hero / CWV）" aria-label="搜索术语">
      <button type="button" id="gl-clear" class="gl-clear" hidden aria-label="清空搜索">×</button>
      <span class="gl-count" id="gl-count" aria-live="polite"></span>
    </div>

    <nav class="gl-jump" aria-label="按阶段跳转">
      <span class="gl-jump-t">按阶段</span>${jumpStage}
    </nav>
    <nav class="gl-jump" aria-label="按类别跳转">
      <span class="gl-jump-t">按类别</span>${jumpCat}
    </nav>
    ${groups}
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

${footer({ prefix: '../', base: '../' })}
<button class="totop" type="button" aria-label="回到顶部">↑</button>
<script src="../assets/app.js"></script>
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
    return `<a class="mod" href="/lessons/${m.no}/"><span class="no">${m.no}</span><h3>${esc(m.t)}</h3><p>${esc(m.q)}</p></a>`;
  }).join('\n      ');

  return `${head({
    title: '页面不存在 · 从 0 到上线',
    desc: '这个地址没有对应页面 —— 可能是链接打错了一个字，也可能这页还没写。回到课程总览，或从下面这几讲开始。',
    prefix: '/',
    canon: '/404',
    extra: '<meta name="robots" content="noindex">',
  })}
<body data-page="404" data-total="${TOTAL}">
${topbar({ base: '/', current: '' })}
<a class="skip" href="#main">跳到正文</a>

<main id="main">
<section class="hero sm">
  <div class="shell">
    <div class="kicker">404 · Not Found</div>
    <h1>这个地址没有页面</h1>
    <p class="lead">可能是链接打错了一个字，也可能这页还没写。下面三个入口都能回到正题。</p>
    <div class="cta">
      <a class="btn btn-primary" href="/">回课程总览 <span class="ar">→</span></a>
      <a class="btn btn-ghost" href="/map/">看课程地图</a>
      <a class="btn btn-ghost" href="/glossary/">术语表</a>
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

${footer({ prefix: '/', base: '/' })}
<script src="/assets/app.js"></script>
</body>
</html>
`;
}

/* ============================== 留言 / 后台 ============================== */

/**
 * 读者留言。为什么要有它：
 *   课程里每一步都实测过，但平台会改版、套餐会变、地域与账号类型也会造成差异。
 *   没有回馈渠道，读者只能在别处憋着；有渠道但没有"具体到哪一讲"的结构，
 *   收到的都是"打不开"。故表单第一项就是"涉及讲次"，而不是让读者自己措辞。
 */
function feedbackPage() {
  const base = '../';
  return `${head({
    title: '读者留言 · 从 0 到上线',
    desc: '课程内容的纠错与补充渠道：发现哪一讲、哪一步与你的实际操作不符，可以在这里具体指出，仅作者可见。',
    prefix: base,
    canon: '/feedback',
  })}
<body>
${topbar({ base, current: 'feedback' })}
<main>

<section class="hero sm">
  <div class="shell">
    <span class="kicker">FEEDBACK</span>
    <h1>读者留言</h1>
    <p class="lead">
      课程里每一步都实测过，但平台会改版、套餐会变，地域与账号类型也会造成差异。
      发现哪一讲、哪一步与你的实际操作不符，请在这里指出——
      <b>写清"哪一讲 + 哪一步 + 报了什么错"，比"打不开"有用得多。</b>
    </p>
  </div>
</section>

<section class="sec">
  <div class="shell">
    <div class="fb-box">
      <div class="fb-lead-note">
        留言<b>不会公开展示</b>，也不会出现在任何页面上，只有作者能在后台查看。
        若留了联系方式，仅用于回复你的问题。
      </div>

      <div class="fb-card">
        <h2>填写反馈</h2>
        <form id="fb-form" novalidate>
          <!-- 草稿恢复提示：assets/feedback.js 检测到本地草稿时才显示。
               用本站已有的 .hint 类，不新造样式。 -->
          <p class="hint" id="fb-draft-hint" hidden>
            已恢复上次未提交的内容（保存在你自己的浏览器里，7 天后自动清除）。不需要的话直接删掉即可。
          </p>

          <div class="fb-field">
            <label for="fb-page">涉及讲次 / 页面</label>
            <select id="fb-page">
              <option>总览（首页）</option>
              <option>课程地图</option>
              <option>门禁与红线</option>
              <option>术语表</option>
              <option>具体某一讲（请在描述里写明讲号，如 M13）</option>
              <option>其它 / 未指明</option>
            </select>
          </div>

          <div class="fb-field">
            <div class="fb-meta">
              <label for="fb-content">问题描述 <span class="req">*</span></label>
              <span class="count" id="fb-count">0 / 4000</span>
            </div>
            <textarea id="fb-content" rows="10" placeholder="建议写清四点：&#10;1. 走到哪一讲、哪一步（讲号 + 步骤标题）&#10;2. 你执行的命令或点的按钮&#10;3. 实际看到的结果 / 完整报错&#10;4. 你的云厂商、系统版本、域名是否备案等前置条件"></textarea>
          </div>

          <div class="fb-field">
            <label for="fb-contact">联系方式 <span class="opt">（可选，便于回复你）</span></label>
            <input id="fb-contact" type="text" maxlength="200" placeholder="邮箱 / 微信号，留空也可以" autocomplete="off">
          </div>

          <div class="fb-field">
            <label for="fb-files">附图 / 附件 <span class="opt">（可选，最多 3 个，单个 ≤ 2 MB）</span></label>
            <input id="fb-files" type="file" multiple class="fb-file-input"
                   accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv">
            <p class="fb-hint">支持 PNG / JPEG / WebP / GIF / PDF / TXT / CSV。报错截图、终端输出、配置文件片段都可以直接附上——比转述准确得多。</p>
            <ul class="fb-pick-list" id="fb-file-list" hidden></ul>
            <p class="fb-hint fb-hint-err" id="fb-file-err"></p>
          </div>

          <!-- 蜜罐：对真人不可见，机器人会填。填了则服务端静默丢弃。 -->
          <div style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden" aria-hidden="true">
            <label for="fb-website">Website</label>
            <input id="fb-website" type="text" tabindex="-1" autocomplete="off">
          </div>

          <div class="fb-alert" id="fb-alert" hidden></div>

          <div class="fb-actions">
            <p class="hint">提交即为同意作者在改进课程时参考该反馈。</p>
            <button type="submit" class="btn btn-primary" id="fb-submit" disabled>提交</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</section>

</main>

${footer({ prefix: base, base })}
<script src="../assets/feedback.js" defer></script>
</body>
</html>
`;
}

/** 后台：登录 / 一次性令牌设定密码 / 留言列表。不进 sitemap，且 noindex。 */
function adminPage() {
  const base = '../';
  return `${head({
    title: '后台 · 读者留言',
    desc: '课程站后台，仅作者本人可访问。',
    prefix: base,
    canon: '/admin',
    extra: '<meta name="robots" content="noindex,nofollow">\n',
  })}
<body>
${topbar({ base, current: '' })}
<main>

<section class="sec">
  <div class="shell">
    <h1 class="page-h1">后台 · 读者留言</h1>
    <div class="fb-box" id="fb-admin">
      <div class="fb-alert" id="fb-alert" hidden></div>

      <div class="fb-card" id="fb-login-card" hidden>
        <h2>登录</h2>
        <p class="hint" style="font-size:12.5px;color:var(--text-3);margin-bottom:16px;line-height:1.75">
          只有作者能查看读者留言。首次使用或忘记密码，请到服务器上运行
          <code style="font-family:var(--font-mono)">init-site.mjs --site web-training</code>
          取得一次性令牌。
        </p>
        <form id="fb-login-form">
          <div class="fb-field">
            <label for="fb-user">用户名</label>
            <input id="fb-user" type="text" value="power-admin" autocomplete="username" required>
          </div>
          <div class="fb-field">
            <label for="fb-pass">密码</label>
            <input id="fb-pass" type="password" autocomplete="current-password" required>
          </div>
          <!-- 登录失败提示放这里，不复用页面顶部的 #fb-alert：
               登录失败要「先提示、再切回登录页」，而切页会清掉页面级提示。 -->
          <div class="fb-alert err" id="fb-login-err" hidden></div>

          <div class="fb-actions">
            <a href="#" id="fb-to-setup" style="font-size:12px;color:var(--text-3)">首次使用，或忘记密码？</a>
            <button type="submit" class="btn btn-primary" id="fb-login-btn">登录</button>
          </div>
        </form>
      </div>

      <div class="fb-card" id="fb-setup-card" hidden>
        <h2>设定后台密码</h2>
        <p class="hint" style="font-size:12.5px;color:var(--text-3);margin-bottom:16px;line-height:1.75">
          凭服务器上生成的一次性令牌设定密码。令牌 60 分钟内有效，用一次即失效；
          密码不经任何中间环节，直接在这里设定。
        </p>
        <form id="fb-setup-form">
          <div class="fb-field">
            <label for="fb-setup-token">一次性令牌 <span class="req">*</span></label>
            <input id="fb-setup-token" type="text" autocomplete="off" spellcheck="false"
                   style="font-family:var(--font-mono);font-size:12px" required>
          </div>
          <div class="fb-field">
            <label for="fb-setup-user">用户名</label>
            <input id="fb-setup-user" type="text" value="power-admin" autocomplete="username" required>
          </div>
          <div class="fb-field">
            <label for="fb-setup-pass">新密码 <span class="opt">（至少 10 位）</span></label>
            <input id="fb-setup-pass" type="password" autocomplete="new-password" minlength="10" required>
          </div>
          <div class="fb-field">
            <label for="fb-setup-pass2">确认新密码</label>
            <input id="fb-setup-pass2" type="password" autocomplete="off" minlength="10" required>
          </div>
          <div class="fb-actions">
            <a href="#" id="fb-to-login" style="font-size:12px;color:var(--text-3)">← 返回登录</a>
            <button type="submit" class="btn btn-primary" id="fb-setup-btn">设定密码</button>
          </div>
        </form>
      </div>

      <div id="fb-panel" hidden>
        <div class="fb-toolbar">
          <div>
            <h2 style="font-size:19px;font-weight:600">读者留言</h2>
            <p style="font-size:12px;color:var(--text-3);margin-top:4px" id="fb-who"></p>
          </div>
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-ghost" id="fb-refresh">刷新</button>
            <button type="button" class="btn btn-ghost" id="fb-logout">退出</button>
          </div>
        </div>

        <div class="fb-filters" id="fb-filters">
          <button type="button" class="fb-filter active" data-status="all">全部<span class="n">0</span></button>
          <button type="button" class="fb-filter" data-status="new">未读<span class="n">0</span></button>
          <button type="button" class="fb-filter" data-status="read">已读<span class="n">0</span></button>
          <button type="button" class="fb-filter" data-status="archived">已归档<span class="n">0</span></button>
        </div>

        <div id="fb-list"></div>

        <div class="fb-card" style="margin-top:22px">
          <h2>修改密码</h2>
          <p class="hint" style="font-size:12.5px;color:var(--text-3);margin-bottom:16px">
            修改后其它设备上的登录立即失效，仅当前浏览器保持登录。
          </p>
          <form id="fb-pw-form">
            <div class="fb-field">
              <label for="fb-pw-cur">当前密码</label>
              <input id="fb-pw-cur" type="password" autocomplete="current-password" required>
            </div>
            <div class="fb-field">
              <label for="fb-pw-new">新密码 <span class="opt">（至少 10 位）</span></label>
              <input id="fb-pw-new" type="password" autocomplete="new-password" minlength="10" required>
            </div>
            <div class="fb-field">
              <label for="fb-pw-new2">确认新密码</label>
              <input id="fb-pw-new2" type="password" autocomplete="off" minlength="10" required>
            </div>
            <div class="fb-actions">
              <span></span>
              <button type="submit" class="btn btn-primary" id="fb-pw-btn">更新密码</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</section>

</main>

${footer({ prefix: base, base })}
<script src="../assets/feedback.js" defer></script>
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
  const f = path.join('lessons', m.no, 'index.html');
  bytes += write(f, lessonPage(m, st));
  files.push(f);
}));
bytes += write(path.join('gates', 'index.html'), gatesPage()); files.push('gates/index.html');
bytes += write(path.join('glossary', 'index.html'), glossaryPage()); files.push('glossary/index.html');
bytes += write(path.join('map', 'index.html'), renderMapPage()); files.push('map/index.html');
bytes += write(path.join('feedback', 'index.html'), feedbackPage()); files.push('feedback/index.html');
bytes += write(path.join('admin', 'index.html'), adminPage()); files.push('admin/index.html');
bytes += write('404.html', notFoundPage()); files.push('404.html');

/* ---- sitemap.xml / robots.txt：M13 与 M29 都在讲它们，本站自己没有就说不过去 ---- */
const smEntries = [
  { loc: '/', pri: '1.0' },
  { loc: '/map', pri: '0.9' },
  { loc: '/gates', pri: '0.8' },
  { loc: '/glossary', pri: '0.7' },
  // /admin 刻意不进 sitemap：它是后台，不该被收录（robots.txt 里另行 Disallow）。
  { loc: '/feedback', pri: '0.5' },
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
Disallow: /admin/

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`, 'utf8');

/* favicon：与顶栏 Logo 共用同一段 GLOBE 几何，不另写一份 */
fs.writeFileSync(path.join(OUT, 'assets', 'favicon.svg'), FAVICON_SVG, 'utf8');

/* ============================== 自检 ============================== */

const checks = [];
const need = ['index.html', 'map/index.html', 'gates/index.html', 'glossary/index.html',
  'feedback/index.html', 'admin/index.html', '404.html',
  'sitemap.xml', 'robots.txt',
  ...MODULES.map(m => `lessons/${m.no}/index.html`)];
checks.push([`页面数 = ${TOTAL + 7}`, files.length === TOTAL + 7]);
checks.push(['文件全部落盘', need.every(f => fs.existsSync(path.join(OUT, f)))]);
const home = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const mapHtml = fs.readFileSync(path.join(OUT, 'map', 'index.html'), 'utf8');
// 31 张卡在 /map 上（首页只剩 9 行阶段索引），这两项自检跟着搬过去
checks.push([`地图页含全部 ${TOTAL} 张卡`, (mapHtml.match(/class="mod" href=/g) || []).length === TOTAL]);
checks.push(['地图页路径计数与数据一致', Object.entries(PATH_COUNT).every(([k]) => mapHtml.includes(`data-path="${k}"`))]);
checks.push(['首页只放阶段索引，不再重复卡片', !/class="mod" href=/.test(home)]);
const m01 = fs.readFileSync(path.join(OUT, 'lessons', 'M01', 'index.html'), 'utf8');
checks.push(['讲义页带 data-mod', m01.includes('data-mod="M01"')]);
checks.push(['讲义页无「待补充」', !m01.includes('待补充')]);
const allLessons = MODULES.map(m => fs.readFileSync(path.join(OUT, 'lessons', m.no, 'index.html'), 'utf8'));
checks.push([`${TOTAL} 讲都含自检表`, allLessons.every(h => h.includes('class="check"'))]);
checks.push([`${TOTAL} 讲都含返回总览`, allLessons.every(h => h.includes('class="crumb"') && h.includes('href="../../">总览</a>'))]);
// 全站统一干净 URL：页面里不该再出现 .html 的站内链接（文件本身仍是 .html）
const glossaryHtml = fs.readFileSync(path.join(OUT, 'glossary', 'index.html'), 'utf8');
const allHtml = [...allLessons, home, mapHtml,
  fs.readFileSync(path.join(OUT, 'gates', 'index.html'), 'utf8'), glossaryHtml];
// 示意图的 key 必须与术语名完全一致；写错一个字就会静默不出图，这里兜住
const figKeys = Object.keys(FIGURES);
const figAlive = figKeys.filter(k => GLOSSARY.some(g => g[0] === k));
checks.push([`${figKeys.length} 张示意图的键名都对应真实术语`, figAlive.length === figKeys.length]);
checks.push([`${figAlive.length} 张示意图全部输出到术语页`,
  (glossaryHtml.match(/<figure class="gl-fig">/g) || []).length === figAlive.length]);
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
