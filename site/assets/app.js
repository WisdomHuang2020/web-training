/* 从 0 到上线 · 全站脚本
 * 只用浏览器原生能力，不依赖任何框架与 CDN —— 断网、直接双击打开文件都能用
 * （localStorage 在 file:// 下也可写；隐私模式禁写时静默降级为「不记忆」）。
 *
 * 职责：
 *   ① 讲义自检勾选落盘 + 单讲进度条
 *   ② 全站完成度（顶栏 x / 30、首页卡片打勾）
 *   ③ 首页按路径过滤 + 关键词搜索
 *   ④ 讲义右栏目录随滚动高亮
 *   ⑤ 代码复制、回到顶部
 */
(function () {
  'use strict';

  // 讲数由生成器写在 <body data-total>，不在这里写死 —— 加一讲不用再改脚本
  var TOTAL = parseInt(document.body.dataset.total, 10) || 0;
  var SUB_KEY = 'wk.check.';   // + M01 + .v1  → 单讲勾选明细
  var DONE_KEY = 'wk.done.';   // + M01        → 该讲全部勾完的标记

  /* ---------------- 存储（全部 try/catch，坏数据不炸页面） ---------------- */
  function lsGet(k, dflt) {
    try {
      var v = localStorage.getItem(k);
      return v === null ? dflt : v;
    } catch (e) { return dflt; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* 隐私模式：忽略 */ }
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) { /* 同上 */ }
  }

  function readState(mod) {
    try {
      var o = JSON.parse(lsGet(SUB_KEY + mod + '.v1', '{}'));
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function writeState(mod, state) {
    lsSet(SUB_KEY + mod + '.v1', JSON.stringify(state));
  }

  function countDone() {
    var n = 0;
    for (var i = 1; i <= TOTAL; i++) {
      if (lsGet(DONE_KEY + 'M' + (i < 10 ? '0' : '') + i, null)) n++;
    }
    return n;
  }

  /* ---------------- 顶栏进度胶囊 ----------------
   * 一个指示器只允许有一个含义，但含义随页面变：
   *   讲义页 → 「本讲 3 / 6」：勾一项就动，回答「这讲我还差多少」
   *   首页   → 「已学 4 / 30」：整讲自检全勾算一讲，回答「整个课我走到哪」
   *   其它页 → 不显示：门禁、术语表没有"进度"这回事，挂个数字只会是装饰
   *
   * 早期版本只有一个「全站 0 / 30」且只在整讲全勾时才 +1，
   * 结果是学习过程中它永远停在 0 —— 不是没做，是阈值定错了。
   */
  function paintPill(cur, total, label) {
    var pill = document.querySelector('[data-progress]');
    if (!pill) return;
    if (!total) { pill.hidden = true; return; }
    pill.hidden = false;

    var txt = pill.querySelector('[data-ptxt]');
    var bar = pill.querySelector('[data-pbar]');
    if (txt) txt.textContent = label + ' ' + cur + ' / ' + total;
    if (bar) bar.style.width = (cur / total * 100) + '%';
    pill.setAttribute('aria-label', label + '进度 ' + cur + ' / ' + total);
  }

  /** 首页口径：整讲自检全部勾完，才算学过一讲。
   *  一讲都没学完时不显示 —— 首屏已经有「30 讲」，再挂一个空的 0/30 就是纯装饰。
   *  学完第一讲，它就自己出现。 */
  function paintCoursePill() {
    var n = countDone();
    paintPill(n, n ? TOTAL : 0, '已学');
  }

  /* ---------------- 讲义页 ---------------- */
  function initLesson() {
    var mod = document.body.dataset.mod;
    if (!mod) return;

    var boxes = Array.prototype.slice.call(document.querySelectorAll('input[data-k]'));
    if (!boxes.length) return;
    var state = readState(mod);

    function paint() {
      var n = boxes.filter(function (b) { return b.checked; }).length;
      var ptxt = document.getElementById('ptxt');
      var pbar = document.getElementById('pbar');
      if (ptxt) ptxt.textContent = n + ' / ' + boxes.length;
      if (pbar) pbar.style.width = (n / boxes.length * 100) + '%';
      if (n === boxes.length) lsSet(DONE_KEY + mod, '1');
      else lsDel(DONE_KEY + mod);
      // 讲义页顶栏说的是本讲，不是全站
      paintPill(n, boxes.length, '本讲');
    }

    boxes.forEach(function (b) {
      var k = b.dataset.k;
      if (state[k]) b.checked = true;
      b.addEventListener('change', function () {
        state[k] = b.checked ? 1 : 0;
        writeState(mod, state);
        paint();
      });
    });
    paint();
  }

  /* ---------------- 课程地图页（/map）---------------- */
  function initMapPage() {
    var grid = document.getElementById('map-list');
    if (!grid) return;

    var btns = Array.prototype.slice.call(document.querySelectorAll('.fbtn[data-path]'));
    var input = document.getElementById('q');
    var hint = document.getElementById('fhint');
    var stages = Array.prototype.slice.call(grid.querySelectorAll('.stage'));
    var activePath = 'ALL';

    function labelOf(p) {
      var b = document.querySelector('.fbtn[data-path="' + p + '"]');
      if (!b) return p;
      return (b.firstChild && b.firstChild.textContent || p).trim();
    }

    function apply() {
      var kw = ((input && input.value) || '').trim().toLowerCase();
      var shown = 0;

      stages.forEach(function (st) {
        var visible = 0;
        Array.prototype.forEach.call(st.querySelectorAll('.mod'), function (m) {
          var paths = (m.dataset.p || '').split(' ');
          var okPath = activePath === 'ALL' || paths.indexOf(activePath) >= 0;
          var okKw = !kw || (m.dataset.kw || '').toLowerCase().indexOf(kw) >= 0;
          var show = okPath && okKw;
          m.hidden = !show;
          if (show) { visible++; shown++; }
        });
        st.hidden = visible === 0;
        var cnt = st.querySelector('[data-visible]');
        if (cnt) cnt.textContent = visible + ' 讲';
      });

      if (hint) {
        hint.textContent = kw
          ? '筛选「' + labelOf(activePath) + '」+ 关键词“' + input.value.trim() + '”：命中 ' + shown + ' 讲'
          : '筛选「' + labelOf(activePath) + '」：共 ' + shown + ' 讲';
      }
    }

    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        activePath = b.dataset.path;
        btns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        apply();
      });
    });
    if (input) {
      input.addEventListener('input', apply);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { input.value = ''; apply(); input.blur(); }
      });
    }

    Array.prototype.forEach.call(grid.querySelectorAll('.mod[data-mod]'), function (m) {
      if (lsGet(DONE_KEY + m.dataset.mod, null)) m.classList.add('done');
    });
    paintCoursePill();
    apply();
  }

  /* ---------------- 讲义目录高亮 ---------------- */
  function initToc() {
    // 只取「本讲目录」这一个 ol：之前写 .rail ol a 会把「同阶段」里的当前讲高亮一起清掉
    var links = Array.prototype.slice.call(document.querySelectorAll('.rail ol.toc a'));
    if (!links.length || !('IntersectionObserver' in window)) return;

    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('on'); });
        var a = map[en.target.id];
        if (a) a.classList.add('on');
      });
    }, { rootMargin: '-88px 0px -70% 0px', threshold: 0 });

    Array.prototype.forEach.call(document.querySelectorAll('.lsec[id]'), function (s) { io.observe(s); });
  }

  /* ---------------- 代码复制 ---------------- */
  function initCopy() {
    Array.prototype.forEach.call(document.querySelectorAll('.code-wrap'), function (w) {
      var btn = w.querySelector('.copy');
      var code = w.querySelector('pre');
      if (!btn || !code) return;
      btn.addEventListener('click', function () {
        var text = code.innerText;
        function done() {
          btn.textContent = '已复制';
          setTimeout(function () { btn.textContent = '复制'; }, 1400);
        }
        function fallback() {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); done(); }
          catch (e) { btn.textContent = '请手动选中'; }
          document.body.removeChild(ta);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else { fallback(); }
      });
    });
  }

  /* ---------------- 回到顶部 ---------------- */
  function initTop() {
    var b = document.querySelector('.totop');
    if (!b) return;
    window.addEventListener('scroll', function () {
      b.classList.toggle('show', window.scrollY > 700);
    }, { passive: true });
    b.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function boot() {
    var p = document.body.dataset.page;
    if (p === 'lesson') initLesson();
    if (p === 'map') initMapPage();
    if (p === 'home') paintCoursePill();
    initToc();
    initCopy();
    initTop();
    // 门禁 / 术语表 / 404 没有"进度"这回事，直接把胶囊摘掉
    if (p !== 'lesson' && p !== 'home' && p !== 'map') paintPill(0, 0, '');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ── 页面风格切换（8 套配色）─────────────────────────────────────────
   与 style.css 末尾的 html[data-theme="x"] 块配套。
   持久化 localStorage['pk-theme']；?theme= 优先，方便截图与分享。
   head 里还有一段内联防闪脚本，二者校验规则必须一致。 */
;(function () {
  var THEMES = [
    { id: 'dark-teal', name: '深墨 teal', dot: '#14b8a6' },
    { id: 'blue', name: '蓝调浅色', dot: '#0070c0' },
    { id: 'navy-tech', name: '深蓝科技', dot: '#3aa0e8' },
    { id: 'graphite', name: '石墨灰', dot: '#3f4855' },
    { id: 'warm-paper', name: '米白手册', dot: '#9a5b13' },
    { id: 'forest', name: '森林墨绿', dot: '#3fbf7f' },
    { id: 'indigo', name: '靛紫柔光', dot: '#5b4bd6' },
    { id: 'sea-salt', name: '海盐青', dot: '#0e7490' }
  ]
  var KEY = 'pk-theme'
  var btn = document.querySelector('[data-theme-btn]')
  var menu = document.querySelector('[data-theme-menu]')
  var dot = document.querySelector('[data-theme-dot]')
  if (!btn || !menu) return

  function valid(v) { return !!v && THEMES.some(function (t) { return t.id === v }) }
  function current() {
    var q = null, s = null
    try { q = new URLSearchParams(location.search).get('theme') } catch (e) {}
    if (valid(q)) return q
    try { s = localStorage.getItem(KEY) } catch (e) {}
    return valid(s) ? s : 'dark-teal'
  }
  function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false') }
  function apply(id, save) {
    document.documentElement.dataset.theme = id
    var t = THEMES.filter(function (x) { return x.id === id })[0] || THEMES[0]
    if (dot) dot.style.background = t.dot
    Array.prototype.forEach.call(menu.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-id') === id
      b.setAttribute('aria-checked', on ? 'true' : 'false')
      var tick = b.querySelector('.tick')
      if (tick) tick.textContent = on ? '✓' : ''
    })
    if (save) { try { localStorage.setItem(KEY, id) } catch (e) {} }
  }

  menu.innerHTML = '<p class="theme-menu-hint">页面风格 · ' + THEMES.length + ' 种（本机记住）</p>'
  THEMES.forEach(function (t) {
    var b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('data-id', t.id)
    b.setAttribute('role', 'menuitemradio')
    b.innerHTML = '<span class="swatch" style="background:' + t.dot + '"></span><span>' + t.name + '</span><span class="tick"></span>'
    b.addEventListener('click', function () { apply(t.id, true); close() })
    menu.appendChild(b)
  })

  btn.addEventListener('click', function (e) {
    e.stopPropagation()
    var willOpen = menu.hidden
    menu.hidden = !willOpen
    btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false')
  })
  document.addEventListener('click', function (e) {
    if (!menu.hidden && !menu.contains(e.target)) close()
  })
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close() })

  apply(current(), false)
})()
