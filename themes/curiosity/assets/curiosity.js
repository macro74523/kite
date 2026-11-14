(() => {
  'use strict';
  const root = document.documentElement;
  let stored = null;
  try { stored = localStorage.getItem('curiosity-theme'); } catch (_) {}
  // 默认暗黑模式，不跟随系统；仅当用户显式选择亮色时才记忆亮色
  const effective = () => stored === 'light' ? 'light' : 'dark';
  root.setAttribute('data-theme', effective());
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (root.getAttribute('data-theme') === 'dark') {
        // 暗黑 → 亮色，记忆亮色
        stored = 'light';
        try { localStorage.setItem('curiosity-theme', 'light'); } catch (_) {}
      } else {
        // 亮色 → 暗黑，清除记忆回到默认暗黑
        stored = null;
        try { localStorage.removeItem('curiosity-theme'); } catch (_) {}
      }
      root.setAttribute('data-theme', effective());
    });
  }

  // 大数字防溢出：全站统计统一紧凑格式 12,345 → 12.3k、1,234,567 → 1.2m
  const fmtCompact = n => {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  };

  // 统计动效：占位呼吸 → 数值按顺序浮现 → 数值增加时数字滚动加上去，落定后右上角弹「+N」
  const statFx = (() => {
    const key = 'curiosity:stat-prev:' + (document.body.dataset.storageKey || location.pathname);
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { prev = null; }
    const next = Object.assign({}, prev || {});
    const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      reveal(el, order) {
        if (!el) return;
        el.style.animationDelay = ((order || 0) * 70) + 'ms';
        el.classList.add('stat-reveal');
      },
      stagger(selector) {
        document.querySelectorAll(selector).forEach((el, i) => this.reveal(el, i));
      },
      // display：字符串（原样填充）或格式化函数（增量时用于逐帧渲染跳动数字）
      fill(el, display, raw, field) {
        if (!el) return;
        const num = Number(raw);
        const fmt = typeof display === 'function' ? display : null;
        const show = v => { if (fmt) el.textContent = fmt(v); else el.innerHTML = display; };
        el.classList.remove('is-pending');
        cancelAnimationFrame(el._statRaf || 0);
        el.querySelectorAll('.stat-delta').forEach(t => t.remove());
        const delta = (field && Number.isFinite(num) && prev && Number.isFinite(prev[field]) && num > prev[field])
          ? num - prev[field] : 0;
        const popBadge = () => {
          const tip = document.createElement('span');
          tip.className = 'stat-delta';
          tip.textContent = '+' + delta;
          el.appendChild(tip);
          setTimeout(() => { tip.classList.add('is-out'); setTimeout(() => tip.remove(), 400); }, 7000);
        };
        if (delta > 0 && fmt && !reduceMotion()) {
          // 弹簧物理滚动：从旧值弹到新值，带轻微回弹，读起来更"活"
          const from = num - delta;
          const STIFFNESS = 80, DAMPING = 11;
          let y = from, v = 0, last = performance.now();
          const tick = t => {
            let dt = Math.min(0.05, (t - last) / 1000);
            last = t;
            while (dt > 0) {
              const s = Math.min(dt, 1 / 120);
              dt -= s;
              const a = -STIFFNESS * (y - num) - DAMPING * v;
              v += a * s;
              y += v * s;
            }
            show(Math.max(from, Math.round(y)));
            if (Math.abs(y - num) < 0.5 && Math.abs(v) < 0.5) {
              show(num);
              popBadge();
            } else {
              el._statRaf = requestAnimationFrame(tick);
            }
          };
          el._statRaf = requestAnimationFrame(tick);
        } else {
          show(num);
          if (delta > 0) popBadge();
        }
        if (field && Number.isFinite(num)) {
          next[field] = num;
          try { localStorage.setItem(key, JSON.stringify(next)); } catch (_) { }
        }
      }
    };
  })();

  // Theme-toggle skins. The Halloween skin takes over for ten days each year:
  // Oct 26 - Nov 4. Append ?skin=purple|halloween|mono to any URL to preview a skin.
  (() => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const now = new Date();
    const y = now.getFullYear();
    const halloween = now >= new Date(y, 9, 26) && now < new Date(y, 10, 5);
    const forced = new URLSearchParams(location.search).get('skin');
    const skins = ['purple', 'halloween', 'mono'];
    const seasonal = halloween ? 'halloween' : 'purple';
    const skin = skins.includes(forced) ? forced : seasonal;
    btn.dataset.skin = skin;
    root.setAttribute('data-page-skin', skin);
  })();

  // 留言条目渲染：列表页与「阅读原文」抽屉共用，所以放在模块外
  const memoPad = (n) => String(n).padStart(2, '0');
  const MEMO_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  // 评论区时间：英文月份 + TODAY / YESTERDAY，保留精确分钟
  const memoStamp = (ms) => {
    const d = new Date(ms), now = new Date();
    const clock = memoPad(d.getHours()) + ':' + memoPad(d.getMinutes());
    const mins = Math.floor((now - d) / 60000);
    const sameYear = d.getFullYear() === now.getFullYear();
    const sameDay = sameYear && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const isYest = d.getFullYear() === yest.getFullYear() && d.getMonth() === yest.getMonth() && d.getDate() === yest.getDate();
    let label;
    if (mins >= 0 && mins < 1) label = 'JUST NOW';
    else if (mins < 60) label = mins + ' MIN AGO';
    else if (sameDay) label = 'TODAY';
    else if (isYest) label = 'YESTERDAY';
    else label = (sameYear ? '' : d.getFullYear() + ' ') + MEMO_MONTHS[d.getMonth()] + ' ' + memoPad(d.getDate());
    return { label, clock, full: `${d.getFullYear()}.${memoPad(d.getMonth() + 1)}.${memoPad(d.getDate())} ${clock}` };
  };
  const memoSource = (c) => {
    if (c.orig) return c.orig;
    const box = document.createElement('div');
    box.innerHTML = c.comment || '';
    return box.textContent || '';
  };
  // 昵称填 QQ 号时用 QQ 头像，其余沿用 Waline 返回的头像
  const qqOf = (s) => { const v = String(s || '').trim(); return /^\d{5,11}$/.test(v) ? v : ''; };
  const qqAvatar = (qq) => 'https://q1.qlogo.cn/g?b=qq&nk=' + qq + '&s=100';
  // 评论列表里用可爱贴纸盖住 QQ 号中段，头像仍用完整号码取图
  const qqPatchVariant = (qq) => (Number(qq.slice(-1)) % 3) + 1;
  const maskedNick = (qq) => {
    const frag = document.createDocumentFragment();
    const keep = qq.length >= 7 ? 2 : 1;
    frag.append(qq.slice(0, keep));
    const patch = document.createElement('span');
    patch.className = 'qq-patch qq-patch-' + qqPatchVariant(qq);
    patch.title = 'QQ 号已隐藏';
    patch.setAttribute('aria-label', 'QQ 号已隐藏');
    if (patch.classList.contains('qq-patch-2')) patch.textContent = '♥';
    else if (patch.classList.contains('qq-patch-3')) patch.textContent = '✦';
    else for (let i = 0; i < 3; i++) patch.append(document.createElement('i'));
    frag.append(patch, qq.slice(-keep));
    return frag;
  };
  function memoRow(c) {
    const row = document.createElement('article');
    row.className = 'memo-item';
    const who = document.createElement('span');
    who.className = 'memo-avatar';
    const rawNick = (c.nick || '匿名').trim();
    const qq = qqOf(rawNick);
    const avatar = qq ? qqAvatar(qq) : c.avatar;
    if (avatar) { const img = document.createElement('img'); img.src = avatar; img.alt = ''; img.loading = 'lazy'; who.append(img); }
    else who.textContent = rawNick.charAt(0).toUpperCase();
    const body = document.createElement('div');
    body.className = 'memo-body';
    const head = document.createElement('header');
    const nick = document.createElement('strong');
    if (qq) nick.append(maskedNick(qq));
    else nick.textContent = rawNick.length > 5 ? rawNick.slice(0, 5) + '…' : rawNick;
    if (c.link) { const a = document.createElement('a'); a.href = c.link; a.target = '_blank'; a.rel = 'noopener nofollow'; a.append(nick); head.append(a); }
    else head.append(nick);
    const ms = Number(c.insertedAtMs) || Number(c.time) || Date.parse(String(c.insertedAt || '').replace(' ', 'T')) || 0;
    if (ms) {
      const stamp = memoStamp(ms);
      const time = document.createElement('time');
      time.dateTime = new Date(ms).toISOString();
      time.title = stamp.full;
      const date = document.createElement('span');
      date.className = 'memo-date';
      date.textContent = stamp.label;
      const sep = document.createElement('span');
      sep.className = 'memo-sep';
      sep.textContent = '·';
      const clock = document.createElement('span');
      clock.className = 'memo-clock';
      clock.textContent = stamp.clock;
      time.append(date, sep, clock);
      head.append(time);
    }
    const p = document.createElement('p');
    p.className = 'memo-text';
    p.textContent = memoSource(c);
    body.append(head, p);
    row.append(who, body);
    return row;
  }
  window.kiteMemoRow = memoRow;
  function memoEmpty() {
    const box = document.createElement('p');
    box.className = 'quiet memo-empty';
    box.innerHTML = '<svg viewBox="0 0 28 22" width="30" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3.5" width="16" height="7" rx="2.6"/><rect x="2.5" y="10.8" width="23" height="6.4" rx="2.6"/><path d="M5.4 17.2v2.4M22.6 17.2v2.4"/></svg><span>还没有人留言，还不快来抢沙发</span>';
    return box;
  }
  window.kiteMemoEmpty = memoEmpty;

  // 弹簧物理动画工具：a = -stiffness*(y-target) - damping*v
  const spring = (opts) => {
    const { from, to, stiffness = 80, damping = 11, onUpdate, onDone } = opts;
    let y = from, v = 0, last = performance.now(), raf = 0;
    const tick = t => {
      let dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      while (dt > 0) {
        const s = Math.min(dt, 1 / 120);
        dt -= s;
        const a = -stiffness * (y - to) - damping * v;
        v += a * s;
        y += v * s;
      }
      onUpdate(y);
      if (Math.abs(y - to) < 0.005 && Math.abs(v) < 0.05) {
        onUpdate(to);
        if (onDone) onDone();
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  };

  // 一瞬页留言板：直接读 Waline 的 REST 接口，编辑框在页头、列表在右栏。
  (() => {
    const host = document.getElementById('memo-board');
    const listEl = document.getElementById('memo-list');
    if (!host || !listEl) return;
    const server = (host.dataset.server || '').replace(/\/+$/, '');
    if (!server) return;
    const path = host.dataset.path || location.pathname;
    const form = document.getElementById('memo-form');
    const statusEl = document.getElementById('memo-status');
    const countEl = document.getElementById('memo-count');

    const say = (text, kind) => { if (statusEl) { statusEl.textContent = text; statusEl.dataset.kind = kind || ''; } };
    const settled = (el) => { if (el) el.classList.remove('is-pending'); };

    function render(items, count) {
      if (countEl) countEl.textContent = count ? `${fmtCompact(count)} 条` : '';
      const statMsg = document.getElementById('stat-messages');
      statFx.fill(statMsg, fmtCompact, count || 0, 'messages');
      paintLast();
      if (!items.length) { listEl.innerHTML = ''; listEl.append(memoEmpty()); return; }
      listEl.innerHTML = '';
      items.forEach((c) => listEl.append(memoRow(c)));
    }

    async function load() {
      try {
        const q = '?type=comment&path=' + encodeURIComponent(path) + '&page=1&pageSize=20&sortBy=insertedAt_desc';
        const res = await fetch(server + '/api/comment' + q, { headers: { Accept: 'application/json' } });
        const json = await res.json();
        if (!res.ok || json.errno) throw new Error(json.errmsg || 'http ' + res.status);
        const data = json.data || {};
        render(data.data || [], data.count || 0);
      } catch (e) {
        listEl.innerHTML = '<p class="quiet memo-empty">留言暂时读不到，稍后再试</p>';
      }
    }

    if (form) {
      const dlg = document.getElementById('memo-dialog');
      const openBtns = document.querySelectorAll('.memo-open');
      const closeBtn = document.getElementById('memo-close');
      const nickInput = form.querySelector('[name="nick"]');
      const nickAvatar = document.getElementById('memo-nick-avatar');
      const paintNickAvatar = () => {
        if (!nickAvatar) return;
        const v = nickInput ? (nickInput.value || '').trim() : '';
        const qq = qqOf(v);
        nickAvatar.classList.toggle('is-img', !!qq);
        nickAvatar.style.backgroundImage = qq ? 'url("' + qqAvatar(qq) + '")' : '';
        nickAvatar.textContent = qq ? '' : v.charAt(0).toUpperCase();
      };
      if (nickInput) nickInput.addEventListener('input', paintNickAvatar);
      const NICK_KEY = 'memo-nick';
      const storedNick = () => { try { return localStorage.getItem(NICK_KEY) || ''; } catch (e) { return ''; } };
      const rememberNick = (v) => { try { localStorage.setItem(NICK_KEY, v); } catch (e) { } };
      if (nickInput && !nickInput.value) nickInput.value = storedNick();
      paintNickAvatar();
      if (openBtns.length && dlg) openBtns.forEach((btn) => btn.addEventListener('click', () => {
        say('');
        if (nickInput && !nickInput.value) nickInput.value = storedNick();
        paintNickAvatar();
        dlg.showModal();
        if (nickInput && !nickInput.value) nickInput.focus();
        else form.querySelector('textarea').focus();
      }));
      if (closeBtn && dlg) closeBtn.addEventListener('click', () => dlg.close());
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const field = (name) => { const el = form.querySelector('[name="' + name + '"]'); return el ? (el.value || '').trim() : ''; };
        const nick = field('nick'), comment = field('comment');
        if (!nick || !comment) return say('昵称和留言都要填', 'warn');
        const btn = form.querySelector('.memo-submit');
        btn.disabled = true;
        say('发送中…');
        try {
          const res = await fetch(server + '/api/comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nick, mail: host.dataset.mail || 'guest@macro.wang', link: '', comment, url: path })
          });
          const json = await res.json();
          if (!res.ok || json.errno) throw new Error(json.errmsg || 'http ' + res.status);
          form.querySelector('textarea').value = '';
          rememberNick(nick);
          say('留言已送达', 'ok');
          load();
          if (dlg) setTimeout(() => dlg.close(), 800);
        } catch (err) {
          say('发送失败：' + (err.message || '网络异常'), 'warn');
        }
        btn.disabled = false;
      });
    }

    // 统计数据懒加载：滚动到统计卡附近再拉接口，避免首屏就发跨域请求
    const moments = () => Array.from(document.querySelectorAll('.moment-card'));
    const TZ = 'Asia/Shanghai';
    const TZ_PARTS = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const stamp = (ms) => {
      const p = {};
      TZ_PARTS.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
      return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, key: Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) };
    };
    const momentStamps = () => moments()
      .map((c) => (c.dataset.time ? Date.parse(c.dataset.time.replace(' ', 'T') + ':00+08:00') : 0))
      .filter((n) => n);
    const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function paintLast() {
      const stamps = momentStamps();
      const last = stamps.length ? Math.max(...stamps) : 0;
      const el = document.getElementById('stat-last');
      if (el && last) {
        const s = stamp(last);
        statFx.fill(el, '<span class="last-day">' + MONTHS_EN[Number(s.m) - 1] + ' ' + Number(s.d) + '</span><span class="last-clock">' + s.h + ':' + s.mi + '</span>');
      }
      const daysEl = document.getElementById('stat-days');
      if (!daysEl) return;
      if (stamps.length) {
        const start = stamp(Math.min(...stamps)).key;
        const today = stamp(Date.now()).key;
        const days = Math.max(1, Math.round((today - start) / 86400000) + 1);
        statFx.fill(daysEl, fmtCompact, days, 'days');
      }
    }
    const loadVisitors = () => {
      const el = document.getElementById('stat-visitors');
      const S = window.curiosityStats;
      if (!el || !S) { settled(el); return; }
      const q = `${S.base}/api/websites/${S.website}/stats?startAt=0&endAt=${Date.now()}&url=${encodeURIComponent(path)}`;
      fetch(q, { headers: { 'x-umami-share-token': S.token } })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j) { settled(el); return; }
          const pv = j.pageviews;
          const total = Array.isArray(pv)
            ? pv.reduce((sum, p) => sum + (Number(p.y) || 0), 0)
            : (pv && typeof pv === 'object' ? Number(pv.value) || 0 : 0);
          statFx.fill(el, fmtCompact, total, 'views');
        })
        .catch(() => { settled(el); });
    };
    let booted = false;
    const boot = () => {
      if (booted) return;
      booted = true;
      statFx.stagger('.moments-stats .mstat');
      paintLast();
      load();
      loadVisitors();
    };
    const statsEl = document.querySelector('.moments-stats');
    if (statsEl && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); boot(); }
      }, { rootMargin: '200px' });
      io.observe(statsEl);
    } else boot();
  })();

  // 一瞬卡片底部操作：点赞只做本地视觉反馈，分享复制当前条目链接
  document.addEventListener('click', (e) => {
    const btn = e.target.closest ? e.target.closest('.moment-act') : null;
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'like') {
      const on = btn.classList.toggle('is-liked');
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const n = btn.querySelector('.moment-like');
      if (n) n.textContent = on ? String((Number(n.textContent) || 0) + 1) : '0';
    } else if (act === 'share') {
      const card = btn.closest('.moment-card');
      const url = location.origin + location.pathname + (card && card.id ? '#' + card.id : '');
      if (navigator.share) navigator.share({ url }).catch(() => { });
      else if (navigator.clipboard) navigator.clipboard.writeText(url).catch(() => { });
    }
  });

  // Delegated dialog handler: catch any future dialog-open/close triggers too
  document.addEventListener('click', e => {
    // Back button on article pages: return to where the reader came from
    // (same-site referrer), falling back to the posts list otherwise.
    const backBtn = e.target.closest('.header-back');
    if (backBtn) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      let ref = null;
      try { ref = new URL(document.referrer, location.href); } catch (_) {}
      if (ref && ref.origin === location.origin && ref.href !== location.href) {
        e.preventDefault();
        if (history.length > 1) history.back();
        else location.href = ref.href;
      }
      return;
    }
    const openBtn = e.target.closest('[data-open-dialog], #contact-button');
    if (openBtn) {
      const id = openBtn.dataset.openDialog || (openBtn.id === 'contact-button' ? 'contact-dialog' : '');
      if (id) document.getElementById(id)?.showModal?.();
      return;
    }
    const closeBtn = e.target.closest('[data-close-dialog]');
    if (closeBtn) {
      closeBtn.closest('dialog')?.close();
      return;
    }
    if (e.target.tagName === 'DIALOG') {
      const bounds = e.target.getBoundingClientRect();
      if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) e.target.close();
    }
  });

  const words = window.curiosityWords || {};
  const locale = document.body.dataset.language || 'zh-CN';
  let zone = document.body.dataset.timezone || 'Asia/Shanghai';
  try { new Intl.DateTimeFormat(locale, { timeZone: zone }).format(new Date()); }
  catch (_) { zone = 'Asia/Shanghai'; }

  // 预加载 B 站视频增强脚本，避免抽屉首开时那段几百毫秒的
  // "iframe 代码片段 → 真播放器" 的视觉闪现。biliEnhance 在脚本加载完
  // 即注册到 window，后续抽屉和正文页都可以同步调用。
  (function () {
    if (window.biliEnhance) return;
    var s = document.createElement('script');
    s.src = '/plugins/bilibili/bili.js';
    s.async = true;
    document.head.appendChild(s);
  })();
  const zonedParts = (date) => Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)])
  );

  // Moments collapse in the feed; 「展开全文」draws the detail body in place,
  // below the preview, without navigating away.
  document.querySelectorAll('.moment-fold').forEach((fold, index) => {
    fold.id = `moment-content-${index}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'moment-expand';
    const zh = locale.startsWith('zh');
    const expand = zh ? '展开全文' : 'Read more';
    const collapse = zh ? '收起全文' : 'Show less';
    const loading = zh ? '载入中…' : 'Loading…';
    button.textContent = expand;
    button.setAttribute('aria-controls', fold.id);
    button.setAttribute('aria-expanded', 'false');
    const content = fold.querySelector('.moment-content');
    const syncLinks = collapsed => fold.querySelectorAll('a').forEach(link => {
      if (collapsed) {
        link.dataset.momentTabindex = link.getAttribute('tabindex') ?? '';
        link.setAttribute('tabindex', '-1');
      } else {
        const old = link.dataset.momentTabindex;
        if (old) link.setAttribute('tabindex', old); else link.removeAttribute('tabindex');
        delete link.dataset.momentTabindex;
      }
    });
    // 按行高折叠：内容放得下就不显示「展开全文」；需要折叠时精确保留几行，
    // 折叠高度同步给右侧拍立得，卡片不会留空。
    const evaluate = () => {
      if (!content) return;
      const expanded = button.getAttribute('aria-expanded') === 'true';
      const line = parseFloat(getComputedStyle(content).lineHeight) || 26;
      const rows = window.matchMedia('(max-width: 650px)').matches ? 4 : 5;
      const collapsed = Math.round(line * rows);
      fold.style.setProperty('--moment-collapsed-h', `${collapsed}px`);
      const need = Number(fold.dataset.words || 0) > 200 || content.scrollHeight > collapsed + Math.round(line * 0.6);
      button.hidden = !need;
      if (!need) {
        fold.classList.remove('is-collapsed');
        syncLinks(false);
      } else if (!expanded) {
        fold.classList.add('is-collapsed');
        syncLinks(true);
      }
    };
    evaluate();
    window.addEventListener('load', evaluate);
    window.addEventListener('resize', evaluate);
    button.addEventListener('click', async () => {
      const opening = button.getAttribute('aria-expanded') !== 'true';
      if (opening && content && !fold.dataset.loaded) {
        fold.dataset.loaded = '1';
        button.textContent = loading;
        try {
          const res = await fetch(fold.dataset.src);
          if (!res.ok) throw new Error('http ' + res.status);
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const inner = doc.querySelector('.article .content');
          if (inner) content.innerHTML = inner.innerHTML;
        } catch {
          content.innerHTML = zh ? '<p class="quiet">内容暂时加载不出来</p>' : '<p class="quiet">Could not load.</p>';
        }
      }
      if (opening) {
        window.biliEnhance && window.biliEnhance(fold);
        window.biliRatio && window.biliRatio(fold);
      }
      fold.classList.toggle('is-collapsed', !opening);
      syncLinks(!opening);
      button.setAttribute('aria-expanded', String(opening));
      button.textContent = opening ? collapse : expand;
      if (!opening) fold.closest('.moment-card').scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    fold.after(button);
  });

  // Calendar — timeline style
  const days = document.getElementById('calendar-days');
  if (days) {
    const today = zonedParts(new Date());
    let year = today.year, month = today.month - 1;
    const dateList = (days.dataset.dates || '').split('|').filter(Boolean);
    const titleList = (days.dataset.titles || '').split('|').filter(Boolean);
    const linkList = (days.dataset.links || '').split('|').filter(Boolean);
    const calCount = document.getElementById('cal-count');
    const timelineItems = document.getElementById('timeline-items');

    const getMonthPosts = (y, m) => {
      const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
      const posts = [];
      dateList.forEach((date, i) => {
        if (date.startsWith(prefix)) {
          posts.push({ date, title: titleList[i] || '', link: linkList[i] || '#' });
        }
      });
      // Sort by day descending (newest first)
      posts.sort((a, b) => b.date.localeCompare(a.date));
      return posts;
    };

    const animateCount = (el, target) => {
      const duration = 800;
      const start = 0;
      const startTime = performance.now();
      const step = (now) => {
        const p = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(start + (target - start) * eased));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const draw = () => {
      const cur = zonedParts(new Date());
      const allPosts = getMonthPosts(year, month);
      // UPDATES 只展示最新若干条，避免列表过长撑爆卡片
      const MAX_ITEMS = 5;
      const posts = allPosts.slice(0, MAX_ITEMS);

      // UPDATES month stamp always uses English short form (e.g. "Oct")
      const mLabel = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));
      document.getElementById('calendar-month').textContent = mLabel;

      // Animate count (总条数，不受展示限制影响)
      animateCount(calCount, allPosts.length);

      // Render timeline items
      timelineItems.innerHTML = '';
      if (allPosts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'timeline-empty';
        empty.textContent = locale.startsWith('zh') ? '本月暂无更新' : 'No posts this month';
        timelineItems.appendChild(empty);
      } else {
        const todayStr = `${cur.year}-${String(cur.month).padStart(2, '0')}-${String(cur.day).padStart(2, '0')}`;
        posts.forEach((post, idx) => {
          const item = document.createElement('div');
          item.className = 'timeline-item';
          if (post.date === todayStr) item.classList.add('is-today');
          const day = parseInt(post.date.split('-')[2], 10);

          const row = document.createElement('div');
          row.className = 'timeline-row';

          const dateEl = document.createElement('span');
          dateEl.className = 'timeline-date';
          dateEl.textContent = `${String(month + 1).padStart(2, '0')}.${String(day).padStart(2, '0')}`;

          const titleEl = document.createElement('a');
          titleEl.className = 'timeline-title';
          titleEl.href = post.link;
          titleEl.title = post.title;
          titleEl.textContent = post.title;

          row.appendChild(dateEl);
          row.appendChild(titleEl);
          item.appendChild(row);
          timelineItems.appendChild(item);

          // Staggered animation
          setTimeout(() => item.classList.add('is-visible'), idx * 50);
        });
        // 超出限制时显示「更多」入口
        if (allPosts.length > MAX_ITEMS) {
          const more = document.createElement('a');
          more.className = 'timeline-more';
          more.href = '/posts/';
          more.textContent = locale.startsWith('zh') ? `查看全部 ${allPosts.length} 篇 →` : `View all ${allPosts.length} →`;
          timelineItems.appendChild(more);
        }
      }
    };

    const change = amount => {
      const d = new Date(Date.UTC(year, month + amount, 1));
      year = d.getUTCFullYear(); month = d.getUTCMonth(); draw();
    };
    // month prev/next buttons removed — calendar stays on current month
    draw();
  }

  // Cassette player controls
  const cassetteAudio = document.getElementById('cassette-audio');
  const playerPlay = document.getElementById('player-play');
  const cassettePlayer = document.querySelector('.cassette-player');
  if (cassetteAudio && playerPlay && cassettePlayer) {
    let playing = false;
    const syncPlay = () => {
      playing = !cassetteAudio.paused;
      cassettePlayer.classList.toggle('is-playing', playing);
      playerPlay.textContent = playing ? '❚❚' : '▶';
      playerPlay.classList.toggle('is-playing', playing);
      playerPlay.setAttribute('aria-label', playing ? 'pause' : 'play');
    };
    playerPlay.addEventListener('click', () => {
      if (cassetteAudio.paused) cassetteAudio.play().catch(() => {});
      else cassetteAudio.pause();
    });
    cassetteAudio.addEventListener('play', syncPlay);
    cassetteAudio.addEventListener('pause', syncPlay);
    cassetteAudio.addEventListener('ended', syncPlay);
    // Knob rotation on hover for fun
    const knob = document.querySelector('.player-knob');
    let knobAngle = 25;
    knob?.addEventListener('click', () => {
      knobAngle = knobAngle >= 135 ? -45 : knobAngle + 30;
      knob.querySelector('span').style.transform = `rotate(${knobAngle}deg)`;
    });
  }

  // Checkin
  const checkin = document.getElementById('checkin-button');
  if (checkin) {
    const key = `curiosity-checkin:${document.body.dataset.storageKey}`;
    const dateKey = () => { const p = zonedParts(new Date()); return `${p.year}-${p.month}-${p.day}`; };
    const markChecked = () => { checkin.disabled = true; checkin.textContent = words.checked || '今天已签到'; };
    try { if (localStorage.getItem(key) === dateKey()) markChecked(); } catch (_) {}
    checkin.addEventListener('click', () => {
      try {
        localStorage.setItem(key, dateKey());
        markChecked();
        document.getElementById('checkin-status').textContent = words.local_only || '仅保存在本机浏览器，无服务器统计。';
      } catch (_) { document.getElementById('checkin-status').textContent = words.storage_unavailable; }
    });
  }

  // Trend chart: 7-day visitor activity sparkline
  const trendChart = document.getElementById('trend-chart');
  if (trendChart) {
    const linePath = document.getElementById('trend-line');
    const areaPath = document.getElementById('trend-area');
    const labelsEl = document.getElementById('trend-labels');

    // Generate last 7 days of data
    const generateTrendData = () => {
      const days = 7;
      const data = [];
      const today = new Date();
      const p = zonedParts(today);
      const todayStr = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;

      // Try to read checkin history from localStorage for real data points
      const storageKey = `curiosity-checkin:${document.body.dataset.storageKey}`;
      let checkedToday = false;
      try { checkedToday = localStorage.getItem(storageKey) === todayStr; } catch (_) {}

      // Base activity with weekend dip pattern + slight randomness
      const seed = Array.from(todayStr).reduce((a, c) => a + c.charCodeAt(0), 0);
      const rand = (i) => {
        const x = Math.sin(seed + i * 999) * 10000;
        return x - Math.floor(x);
      };

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dp = zonedParts(d);
        const dayOfWeek = d.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        // Base value lower on weekends
        let value = isWeekend ? 40 + rand(i) * 25 : 55 + rand(i) * 35;
        // Gradual upward trend
        value += (days - 1 - i) * 2.5;
        // Today gets a boost if checked in
        if (i === 0 && checkedToday) value += 15;
        data.push({
          value: Math.min(100, Math.max(20, value)),
          label: locale.startsWith('zh')
            ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dayOfWeek]
            : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
          isToday: i === 0
        });
      }
      return data;
    };

    const drawTrend = (data) => {
      const W = 300, H = 80, padX = 4, padY = 8;
      const innerW = W - padX * 2;
      const innerH = H - padY * 2;
      const n = data.length;
      const stepX = innerW / (n - 1);

      // Map values to y coordinates (higher value = lower y)
      const points = data.map((d, i) => ({
        x: padX + i * stepX,
        y: padY + innerH - (d.value / 100) * innerH
      }));

      // Smooth curve using cubic bezier
      const smoothness = 0.35;
      let lineD = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;

        const cp1x = p1.x + (p2.x - p0.x) * smoothness;
        const cp1y = p1.y + (p2.y - p0.y) * smoothness;
        const cp2x = p2.x - (p3.x - p1.x) * smoothness;
        const cp2y = p2.y - (p3.y - p1.y) * smoothness;

        lineD += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
      }

      // Area path: line + bottom corners + close
      const areaD = lineD +
        ` L ${points[points.length - 1].x.toFixed(2)} ${H} ` +
        ` L ${points[0].x.toFixed(2)} ${H} Z`;

      linePath.setAttribute('d', lineD);
      areaPath.setAttribute('d', areaD);

      // Labels
      labelsEl.innerHTML = '';
      data.forEach((d, i) => {
        const span = document.createElement('span');
        span.textContent = d.label;
        if (d.isToday) span.style.color = 'var(--accent)';
        labelsEl.appendChild(span);
      });
    };

    // Initial draw
    drawTrend(generateTrendData());

    // Redraw on checkin to reflect today's boost
    checkin?.addEventListener('click', () => {
      setTimeout(() => drawTrend(generateTrendData()), 100);
    });
  }

  // Works card: show as many items as fit the card height
  const worksCard = document.querySelector('.works-card');
  if (worksCard) {
    const fitWorks = () => {
      const items = worksCard.querySelectorAll('.works-item');
      items.forEach(it => { it.style.display = ''; it.classList.remove('is-last'); });
      if (window.matchMedia('(max-width: 650px)').matches) {
        items[items.length - 1]?.classList.add('is-last');
        return;
      }
      const wcs = getComputedStyle(worksCard);
      const head = worksCard.querySelector('.card-heading');
      const inner = worksCard.clientHeight - parseFloat(wcs.paddingTop) - parseFloat(wcs.paddingBottom)
        - (head ? head.offsetHeight + parseFloat(getComputedStyle(head).marginBottom) : 0);
      let used = 0, lastVisible = null;
      worksCard.querySelectorAll('.works-item').forEach(it => {
        it.style.display = '';
        it.classList.remove('is-last');
        used += it.offsetHeight;
        if (used > inner) it.style.display = 'none';
        else lastVisible = it;
      });
      if (lastVisible) lastVisible.classList.add('is-last');
    };
    fitWorks();
    window.addEventListener('resize', fitWorks);
  }

  // Video works: wrap every cover in a ratio frame picked from the source
  // image itself — 16:9 for landscape, 3:4 for portrait — so the waterfall
  // mixes both like Xiaohongshu. Landscape is the assumed default so the
  // skeleton has a shape before the image's dimensions are known.
  const relayoutVideoGrid = () => document.dispatchEvent(new CustomEvent('curiosity:video-relayout'));
  document.querySelectorAll('.video-listing .video-card').forEach(card => {
    const img = card.querySelector('img.post-cover');
    if (!img) { card.classList.add('is-loaded'); return; }
    // wrap image
    const wrap = document.createElement('div');
    wrap.className = 'video-cover-wrap is-landscape';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    const chip = card.querySelector('.views-chip');
    if (chip) wrap.appendChild(chip);
    let finished = false;
    const orient = () => {
      if (!img.naturalWidth) return;
      const cls = img.naturalHeight > img.naturalWidth ? 'is-portrait' : 'is-landscape';
      if (wrap.classList.contains(cls)) return;
      wrap.classList.remove('is-portrait', 'is-landscape');
      wrap.classList.add(cls);
      if (finished) relayoutVideoGrid(); // frame height changed after layout
    };
    const done = () => {
      if (finished) return;
      finished = true;
      orient();
      card.classList.add('is-loaded');
    };
    if (img.complete && img.naturalWidth) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      // Fallback: show content after 3s even if image is still loading
      setTimeout(done, 3000);
    }
  });

  // Per-post views: one Umami metrics call per page, keyed by page title so
  // the count survives a post being moved to a new address.
  const viewChips = document.querySelectorAll('.views-chip[data-views]');
  if (viewChips.length && window.curiosityStats) {
    const S = window.curiosityStats;
    const VIEWS_KEY = 'curiosity-views:v2';
    const VIEWS_TTL = 10 * 60 * 1000;
    const paintViews = (map) => {
      const rows = Object.entries(map);
      const countFor = (label) => {
        let total = map[label] || 0;
        const prefix = label + ' · ';
        rows.forEach(([key, value]) => {
          if (key.startsWith(prefix)) total += value;
        });
        return total;
      };
      viewChips.forEach(chip => {
        const total = countFor(chip.dataset.views || '');
        const label = fmtCompact(total);
        const n = chip.querySelector('b');
        if (n) n.textContent = label;
        chip.hidden = false;
      });
    };
    const loadViews = () => {
      fetch(`${S.base}/api/websites/${S.website}/metrics?startAt=0&endAt=${Date.now()}&type=title&limit=500`, { headers: { 'x-umami-share-token': S.token } })
        .then(r => (r.ok ? r.json() : null))
        .then(rows => {
          if (!Array.isArray(rows)) return;
          const map = {};
          rows.forEach(row => { map[row.x] = (map[row.x] || 0) + (Number(row.y) || 0); });
          try { localStorage.setItem(VIEWS_KEY, JSON.stringify({ t: Date.now(), map })); } catch (_) {}
          paintViews(map);
        })
        .catch(() => {});
    };
    let cachedViews = null;
    try { cachedViews = JSON.parse(localStorage.getItem(VIEWS_KEY) || 'null'); } catch (_) { cachedViews = null; }
    if (cachedViews && cachedViews.map && Date.now() - cachedViews.t < VIEWS_TTL) {
      paintViews(cachedViews.map);
    } else if ('IntersectionObserver' in window) {
      // 懒加载：卡片接近视口时才请求一次，之后复用本次结果
      // 观察卡片容器而非标签本身（标签初始 display:none，无法触发交叉观察）
      const viewObserver = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        viewObserver.disconnect();
        loadViews();
      }, { rootMargin: '200px' });
      viewChips.forEach(chip => {
        const target = chip.closest('.video-card, .moment-card') || chip.parentElement || chip;
        viewObserver.observe(target);
      });
    } else {
      loadViews();
    }
  }

  // Umami stats（localStorage 缓存：当天 10 分钟内刷新直接读缓存，过期才重新请求）
  const sVis = document.getElementById('stats-visitors');
  if (sVis && window.curiosityStats) {
    const S = window.curiosityStats;
    const formatN = fmtCompact;
    const fetchStats = startMs =>
      fetch(`${S.base}/api/websites/${S.website}/stats?startAt=${startMs}&endAt=${Date.now()}`, {
        headers: { 'x-umami-share-token': S.token }
      }).then(r => r.ok ? r.json() : null).catch(() => null);
    const p = zonedParts(new Date());
    const zoneOffset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Date.now();
    const todayStart = Date.UTC(p.year, p.month - 1, p.day) - zoneOffset;
    const dateKey = `${p.year}-${p.month}-${p.day}`;
    const CACHE_KEY = `curiosity-stats:${document.body.dataset.storageKey || 'home'}`;
    const TTL = 10 * 60 * 1000;
    const apply = (total, today) => {
      const rows = [
        ['stats-today', Number(today?.visitors?.value ?? 0), 'today'],
        ['stats-visitors', Number(total?.visitors?.value ?? 0), 'visitors'],
        ['stats-pageviews', Number(total?.pageviews?.value ?? 0), 'pageviews']
      ];
      rows.forEach(([id, raw, field], i) => {
        const el = document.getElementById(id);
        if (!el) return;
        statFx.fill(el, formatN, raw, field);
        statFx.reveal(el, i);
      });
    };
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { cache = null; }
    const fresh = !!(cache && cache.total && cache.date === dateKey && Date.now() - cache.t < TTL);
    if (cache && cache.total) {
      apply(cache.total, cache.today);
      if (fresh) document.getElementById('stats-status').textContent = '';
    }
    if (!fresh) {
      Promise.all([fetchStats(0), fetchStats(todayStart)])
        .then(([total, today]) => {
          if (!total && !today) {
            if (!cache) {
              document.getElementById('stats-status').textContent = words.stats_failed || '统计暂不可用';
              ['stats-today', 'stats-visitors', 'stats-pageviews'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('is-pending');
              });
            }
            return;
          }
          apply(total, today);
          document.getElementById('stats-status').textContent = '';
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), date: dateKey, total, today })); } catch (_) {}
        });
    }
  }

  // Listing filters: pills are derived from the cards themselves, so any new
  // tag (or month) shows up automatically on the next build. Filtering is
  // client-side, and the choice is cached in the URL hash for reload/sharing.
  (() => {
    const setup = ({ hostId, gridSel, cardSel, keysOf, labelOf, newestFirst, hashKey, emptyText, allLabel }) => {
      const host = document.getElementById(hostId);
      const grid = document.querySelector(gridSel);
      if (!host || !grid) return;
      const cards = [...grid.querySelectorAll(cardSel)];
      const counts = new Map();
      cards.forEach(c => keysOf(c).forEach(k => counts.set(k, (counts.get(k) || 0) + 1)));
      if (!counts.size) { host.remove(); return; }
      const ALL = '__all';
      const keys = [...counts.keys()].sort((a, b) => newestFirst
        ? String(b).localeCompare(String(a))
        : counts.get(b) - counts.get(a) || String(a).localeCompare(String(b), 'zh'));
      const mk = (key, label, n) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'filter-pill';
        b.dataset.filter = key;
        b.innerHTML = '<span></span><em></em>';
        b.firstChild.textContent = label;
        b.lastChild.textContent = n;
        b.setAttribute('aria-pressed', 'false');
        return b;
      };
      host.appendChild(mk(ALL, allLabel || '全部', cards.length));
      keys.forEach(k => host.appendChild(mk(k, labelOf ? labelOf(k) : k, counts.get(k))));
      const pills = [...host.children];
      const empty = document.createElement('p');
      empty.className = 'filter-empty';
      empty.textContent = emptyText || '暂无内容';
      empty.hidden = true;
      grid.after(empty);
      const apply = key => {
        let shown = 0;
        cards.forEach(c => {
          const match = key === ALL || keysOf(c).includes(key);
          c.classList.toggle('is-filtered-out', !match);
          if (match) shown++;
        });
        pills.forEach(p => {
          const on = p.dataset.filter === key;
          p.classList.toggle('is-active', on);
          p.setAttribute('aria-pressed', String(on));
        });
        empty.hidden = shown > 0;
        grid.classList.toggle('is-empty', shown === 0);
        document.dispatchEvent(new CustomEvent('curiosity:video-relayout'));
      };
      let initial = ALL;
      const m = new RegExp('(?:#|&)' + hashKey + '=([^&]+)').exec(location.hash);
      if (m) {
        const wanted = decodeURIComponent(m[1]);
        if (counts.has(wanted)) initial = wanted;
      }
      apply(initial);
      host.addEventListener('click', e => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;
        const key = pill.dataset.filter;
        apply(key);
        history.replaceState(null, '', location.pathname + location.search
          + (key === ALL ? '' : '#' + hashKey + '=' + encodeURIComponent(key)));
      });
    };

    // Works: one pill per tag, ordered by how many pieces carry it.
    setup({
      hostId: 'video-filter',
      gridSel: '.video-listing .video-masonry',
      cardSel: '.video-card',
      keysOf: c => (c.dataset.tags || '').split('|').filter(Boolean),
      hashKey: 'tag',
      allLabel: '全部',
      emptyText: '该分类暂无作品'
    });

    // Moments: one pill per year, newest year first.
    setup({
      hostId: 'moments-filter',
      gridSel: '.moments-stream',
      cardSel: '.moment-card',
      keysOf: c => (c.dataset.date ? [c.dataset.date] : []),
      labelOf: k => k + '年',
      newestFirst: true,
      hashKey: 'year',
      allLabel: '全部',
      emptyText: '该时间暂无瞬间'
    });
  })();

  // Works waterfall: grid row-span masonry. Cards stay in their original DOM
  // order (pinned first, then newest first) and fill rows left to right like a
  // plain grid — but each card spans as many 8px rows as its height needs, so
  // 16:9 and 3:4 covers mix into uneven columns. Re-runs (rAF-debounced) when
  // a cover's orientation is detected, a filter changes the visible set, or
  // the viewport resizes (card widths — and thus ratio-frame heights — change).
  (() => {
    const grid = document.querySelector('.video-listing .video-masonry');
    if (!grid) return;
    const rail = document.querySelector('.timeline-rail');
    let raf = 0;
    const layout = () => {
      raf = 0;
      const cs = getComputedStyle(grid);
      const rowH = parseFloat(cs.gridAutoRows) || 8;
      const gap = parseFloat(cs.rowGap) || 0;
      grid.querySelectorAll('.video-card').forEach(c => {
        if (c.classList.contains('is-filtered-out')) { c.style.gridRowEnd = ''; return; }
        c.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((c.offsetHeight + gap) / (rowH + gap)));
      });
      updateTimeline();
    };
    // 右侧时间尺度：固定在视口纵向居中的当前时间指示器。
    // 滚动时取离视口中心最近的作品卡片，读取其发布年月显示；
    // 每当数值变化，齿轮旋转一格、数字跳动一下，像机械齿轮走时。
    const TICK_COUNT = 51, MAJOR = 5;
    let indicator = null;
    let yearEl = null;
    let monthEl = null;
    let ticks = [];
    let lastKey = '';
    let litAt = -1;
    const buildIndicator = () => {
      indicator = document.createElement('div');
      indicator.className = 'timeline-indicator';
      indicator.innerHTML = '<span class="tl-year">—</span><span class="tl-month">—</span>';
      const ruler = document.createElement('div');
      ruler.className = 'tl-ruler';
      for (let i = 0; i < TICK_COUNT; i++) {
        const t = document.createElement('i');
        if (i % MAJOR === 0) t.className = 'major';
        t.style.setProperty('--d', (i * 8) + 'ms');
        ruler.appendChild(t);
        ticks.push(t);
      }
      indicator.appendChild(ruler);
      rail.appendChild(indicator);
      yearEl = indicator.querySelector('.tl-year');
      monthEl = indicator.querySelector('.tl-month');
      // 触发刻度错峰入场动画
      requestAnimationFrame(() => { rail.dataset.on = 'true'; });
    };
    const updateTimeline = () => {
      raf = 0;
      if (!rail) return;
      if (!indicator) buildIndicator();
      // 刻度尺：按滚动进度点亮对应刻度
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const prog = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      const near = Math.round(prog * (TICK_COUNT - 1));
      if (near !== litAt) {
        for (let i = Math.max(0, Math.min(near, litAt) - 1); i <= Math.min(TICK_COUNT - 1, Math.max(near, litAt) + 1); i++) {
          ticks[i].classList.toggle('lit', Math.abs(i - near) <= 1);
        }
        litAt = near;
      }
      const cards = Array.from(grid.querySelectorAll('.video-card:not(.is-filtered-out)'));
      if (!cards.length) { yearEl.textContent = '—'; monthEl.textContent = ''; return; }
      const center = window.innerHeight / 2;
      let best = cards[0], bestDist = Infinity;
      cards.forEach(card => {
        const r = card.getBoundingClientRect();
        const cardCenter = r.top + r.height / 2;
        const dist = Math.abs(cardCenter - center);
        if (dist < bestDist) { bestDist = dist; best = card; }
      });
      const time = best.querySelector('time[datetime]');
      if (!time) return;
      const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      const dt = time.getAttribute('datetime'); // YYYY-MM-DD
      const year = dt.slice(0, 4);
      const month = parseInt(dt.slice(5, 7), 10);
      const key = year + '-' + month;
      if (key !== lastKey) {
        lastKey = key;
        yearEl.textContent = year;
        monthEl.textContent = MONTHS[month - 1];
        // 数字跳动反馈
        yearEl.animate([{ transform: 'translateY(-3px)', opacity: .4 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,1.45,.45,1)' });
      }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(layout); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(updateTimeline); };
    document.addEventListener('curiosity:video-relayout', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', onScroll, { passive: true });
    layout();
  })();

  // 作品集弹幕：复用 Waline 评论系统，弹幕以飘屏形式显示在视口顶部 1/3 区域。
  // 点击"弹幕"按钮打开发射弹窗，提交后实时飘出。
  (() => {
    const btn = document.getElementById('danmaku-toggle');
    if (!btn) return;
    const server = btn.dataset.server;
    const path = btn.dataset.path;
    const layer = document.getElementById('danmaku-layer');
    const dlg = document.getElementById('danmaku-dialog');
    const form = document.getElementById('danmaku-form');
    if (!server || !layer || !dlg || !form) return;

    const NICK_KEY = 'memo-nick';
    const SELF_KEY = 'danmaku-self:' + path;
    const storedNick = () => { try { return localStorage.getItem(NICK_KEY) || ''; } catch (e) { return ''; } };
    const rememberNick = (v) => { try { localStorage.setItem(NICK_KEY, v); } catch (e) { } };
    const readSelf = () => { try { return JSON.parse(localStorage.getItem(SELF_KEY) || '[]'); } catch (e) { return []; } };
    const writeSelf = (arr) => { try { localStorage.setItem(SELF_KEY, JSON.stringify(arr.slice(-30))); } catch (e) { } };
    const qqOf = (v) => /^\s*(\d{5,12})\s*$/.exec(v || '')?.[1] || '';
    const qqAvatar = (qq) => 'https://q1.qlogo.cn/g?b=qq&nk=' + encodeURIComponent(qq) + '&s=100';
    const colors = ['#ffffff', '#ffd166', '#06d6a0', '#ef476f', '#118ab2', '#ff9f1c', '#a0c4ff', '#caffbf'];

    const nickInput = form.querySelector('[name="nick"]');
    const textarea = form.querySelector('textarea[name="comment"]');
    const nickAvatar = document.getElementById('danmaku-nick-avatar');
    const statusEl = document.getElementById('danmaku-status');
    const closeBtn = document.getElementById('danmaku-close');

    const paintAvatar = () => {
      if (!nickAvatar) return;
      const v = nickInput ? (nickInput.value || '').trim() : '';
      const qq = qqOf(v);
      nickAvatar.classList.toggle('is-img', !!qq);
      nickAvatar.style.backgroundImage = qq ? 'url("' + qqAvatar(qq) + '")' : '';
      nickAvatar.textContent = qq ? '' : v.charAt(0).toUpperCase();
    };
    if (nickInput) nickInput.addEventListener('input', paintAvatar);

    let items = [];
    let idx = 0;
    let timer = 0;
    const rows = 8; // 弹幕轨道数

    const spawn = (text, isSelf) => {
      if (!text) return;
      const el = document.createElement('span');
      el.className = 'danmaku-item' + (isSelf ? ' is-self' : '');
      el.textContent = text;
      const row = Math.floor(Math.random() * rows);
      el.style.top = 'calc(' + (row * (100 / rows)) + '% + 4px)';
      el.style.color = colors[Math.floor(Math.random() * colors.length)];
      const dur = 11 + Math.random() * 9;
      el.style.animationDuration = dur + 's';
      layer.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    };

    const say = (msg, ms) => {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      if (ms) setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ''; }, ms);
    };

    const load = async () => {
      let serverItems = [];
      try {
        const q = '?type=comment&path=' + encodeURIComponent(path) + '&page=1&pageSize=60&sortBy=insertedAt_desc';
        const res = await fetch(server + '/api/comment' + q, { headers: { Accept: 'application/json' } });
        const j = await res.json();
        // Waline 返回 { data: { data: [...], count, page, ... } }，取内层数组
        const list = (j && j.data && j.data.data) || [];
        // comment 字段可能是 HTML（<p>xxx</p>），剥标签取纯文本
        serverItems = list.map((c) => String(c.comment || '').replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      } catch (e) { serverItems = []; }
      // 合并本地自发条（Waline 若开启审核，新弹幕需等审，先用本地兜底保证刷新可见）
      const selfItems = readSelf().filter((t) => !serverItems.includes(t));
      items = [...new Set(serverItems.concat(selfItems))];
      for (let i = items.length - 1; i > 0; i--) {
        const r = Math.floor(Math.random() * (i + 1));
        [items[i], items[r]] = [items[r], items[i]];
      }
    };

    const tick = () => {
      // 每条弹幕只飘一次，不循环重复
      if (idx < items.length) {
        spawn(items[idx]);
        idx++;
      }
      if (idx < items.length) {
        timer = setTimeout(tick, 1800 + Math.random() * 2200);
      } else {
        timer = 0;
      }
    };
    const start = () => { if (!timer && idx < items.length) tick(); };
    const stop = () => { clearTimeout(timer); timer = 0; };

    // 按钮两种形态：单击切换弹幕开关，双击打开发射弹窗
    let danmakuOn = true;
    const setOn = (on) => {
      danmakuOn = on;
      btn.classList.toggle('is-off', !on);
      btn.setAttribute('aria-pressed', String(on));
      layer.style.visibility = on ? '' : 'hidden';
      if (on) start();
      else { stop(); layer.replaceChildren(); }
    };
    const openCompose = () => {
      say('');
      if (nickInput && !nickInput.value) nickInput.value = storedNick();
      if (textarea) textarea.value = '';
      paintAvatar();
      dlg.showModal();
    };
    let clickTimer = 0;
    btn.addEventListener('click', (e) => {
      if (e.detail > 1) return; // 双击的第二下由 dblclick 处理
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => setOn(!danmakuOn), 240);
    });
    btn.addEventListener('dblclick', () => {
      clearTimeout(clickTimer);
      setOn(true);
      openCompose();
    });
    if (closeBtn) closeBtn.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nick = nickInput ? nickInput.value.trim() : '';
      const comment = textarea ? textarea.value.trim() : '';
      if (!nick || !comment) { say('昵称和弹幕内容都不能为空', 2200); return; }
      const submitBtn = form.querySelector('.memo-submit');
      submitBtn.setAttribute('disabled', 'true');
      say('发射中…');
      // 先写入本地，保证刷新后仍可见（即使 Waline 需审核或网络波动）
      const self = readSelf();
      self.push(comment);
      writeSelf(self);
      if (!items.includes(comment)) items.push(comment);
      try {
        await fetch(server + '/api/comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ nick: nick.slice(0, 24), mail: '', link: '', comment: comment.slice(0, 60), url: location.pathname })
        });
        rememberNick(nick);
        say('发射成功', 1500);
        spawn(comment, true);
        if (textarea) textarea.value = '';
        setTimeout(() => dlg.close(), 600);
        load();
        start();
      } catch (err) {
        say('发射失败，请稍后重试', 2200);
        spawn(comment, true);
        start();
      } finally {
        submitBtn.removeAttribute('disabled');
      }
    });

    // 启动弹幕飘屏
    load().then(start);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else start();
    });
  })();

  // Product-card press feedback on the works grid: the card tilts toward
  // the pressed corner (max 8deg), a faint sheen tracks the finger, and
  // releasing springs it flat (~400ms) before the click navigates.
  (() => {
    const grid = document.querySelector('.video-listing .video-masonry');
    if (!grid || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const TILT = 8, RELEASE_MS = 400, NAV_DELAY = 300;
    let press = null, last = null, navTimer = 0;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const vars = (card, rx, ry, mx, my, scale) => {
      card.style.setProperty('--rx', rx + 'deg');
      card.style.setProperty('--ry', ry + 'deg');
      card.style.setProperty('--pscale', scale);
      card.style.setProperty('--mx', mx + 'px');
      card.style.setProperty('--my', my + 'px');
    };
    grid.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest('.video-card-link');
      if (!link) return;
      clearTimeout(navTimer);
      const card = link.closest('.video-card');
      press = { card, link, id: e.pointerId };
      card.classList.remove('is-releasing');
      card.classList.add('is-pressed');
      try { link.setPointerCapture(e.pointerId); } catch (_) {}
      track(e);
    });
    function track(e) {
      if (!press || e.pointerId !== press.id) return;
      const r = press.card.getBoundingClientRect();
      const dx = (e.clientX - r.left) / r.width - 0.5;
      const dy = (e.clientY - r.top) / r.height - 0.5;
      vars(press.card,
        clamp(-dy * 2, -1, 1) * TILT,
        clamp(dx * 2, -1, 1) * TILT,
        e.clientX - r.left, e.clientY - r.top, 0.97);
    }
    grid.addEventListener('pointermove', track);
    function release(e) {
      if (!press || (e && e.pointerId !== press.id)) return;
      const { card, link } = press;
      press = null;
      last = { link, at: Date.now() };
      card.classList.remove('is-pressed');
      card.classList.add('is-releasing');
      vars(card, 0, 0, 0, 0, 1);
      setTimeout(() => card.classList.remove('is-releasing'), RELEASE_MS + 60);
    }
    grid.addEventListener('pointerup', release);
    grid.addEventListener('pointercancel', release);
    grid.addEventListener('lostpointercapture', release);
    // Plain left clicks right after a press wait out most of the rebound.
    grid.addEventListener('click', e => {
      if (!last) return;
      // On sheet-viewer pages the bottom-sheet click handler owns card
      // taps; don't preventDefault or navigate out from under it.
      if (document.querySelector('.page-shell')) return;
      const link = e.target.closest('.video-card-link');
      if (!link || link !== last.link || Date.now() - last.at > 600) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const href = link.href;
      clearTimeout(navTimer);
      navTimer = setTimeout(() => { location.href = href; }, NAV_DELAY);
    });
  })();

  // Works carousel (LATEST WORKS): travel-app wheel — center card full,
  // sides peek and dim, dragging follows the finger, release glides by
  // momentum and snaps to the nearest card. Scale/brightness interpolate
  // with distance from the center the whole way, not only when it settles.
  document.querySelectorAll('.moment-track').forEach(track => {
    if (track.dataset.carousel) return;
    track.dataset.carousel = '1';
    const slides = Array.from(track.children);
    const dotsBox = track.parentElement.querySelector('.moment-dots');
    if (!slides.length || !dotsBox) return;
    const dots = slides.map((_, i) => {
      const d = document.createElement('span');
      if (!i) d.className = 'is-current';
      dotsBox.appendChild(d);
      return d;
    });
    if (slides.length < 2) dotsBox.style.display = 'none';
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, base = 0, x = 0, target = 0, raf = 0;
    let dragging = false, startX = 0, startOffset = 0, lastX = 0, lastT = 0, v = 0, moved = 0, upAt = 0;
    const unit = () => w || 1;
    function measure() {
      w = slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : 0;
      base = (track.clientWidth - slides[0].offsetWidth) / 2;
    }
    const current = () => Math.max(0, Math.min(slides.length - 1, Math.round((base - x) / unit())));
    function apply() {
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      const u = unit();
      slides.forEach((s, i) => {
        const d = Math.min(Math.abs((i * w + x - base) / u), 1.5);
        const k = Math.min(d, 1);
        s.style.transform = `scale(${(1 - k * 0.12).toFixed(4)})`;
        s.style.filter = `brightness(${(1 - k * 0.28).toFixed(3)})`;
        s.style.opacity = (d > 1 ? Math.max(0, 1 - (d - 1) * 0.7).toFixed(3) : '1');
      });
      const cur = current();
      dots.forEach((d, i) => d.classList.toggle('is-current', i === cur));
    }
    function loop() {
      raf = 0;
      x += (target - x) * 0.18;
      if (Math.abs(target - x) < 0.5) { x = target; apply(); return; }
      apply();
      raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf && !reduce) raf = requestAnimationFrame(loop); };
    const rubber = xx => {
      const lo = base - (slides.length - 1) * w, hi = base;
      if (xx > hi) return hi + (xx - hi) * 0.35;
      if (xx < lo) return lo + (xx - lo) * 0.35;
      return xx;
    };
    track.addEventListener('pointerdown', e => {
      if (e.button !== 0 || slides.length < 2) return;
      dragging = true; moved = 0; v = 0;
      startX = lastX = e.clientX;
      startOffset = x;
      lastT = performance.now();
      arm(); // grabbing the carousel restarts the auto-advance countdown
    });
    // Slides are links; without this the browser starts a native link
    // drag on mouse-down+move and pointer events stop firing.
    track.addEventListener('dragstart', e => e.preventDefault());
    track.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      // Capture only once a real drag starts: capturing on pointerdown
      // would retarget the click away from the slide's link.
      if (moved > 6 && !track.classList.contains('is-dragging')) {
        track.classList.add('is-dragging');
        try { track.setPointerCapture(e.pointerId); } catch (_) {}
      }
      if (moved <= 6) return;
      x = rubber(startOffset + dx);
      const now = performance.now(), dt = now - lastT;
      if (dt > 0) { v = (e.clientX - lastX) / dt; lastX = e.clientX; lastT = now; }
      apply();
    });
    // Press that never became a drag and left the track: not a drag.
    track.addEventListener('pointerleave', () => { if (dragging && moved <= 6) dragging = false; });
    function release() {
      if (!dragging) return;
      dragging = false;
      upAt = Date.now();
      track.classList.remove('is-dragging');
      // Snap to the nearest slide. Velocity only nudges the choice (capped
      // at just under half a slide) so a flick advances at most one card
      // and noisy last-sample speed can never overshoot the snap point.
      const boost = Math.max(-0.45, Math.min(0.45, v * 0.12));
      const i = Math.max(0, Math.min(slides.length - 1, Math.round((base - x) / unit() + boost)));
      target = base - i * w;
      if (reduce) { x = target; apply(); } else kick();
    }
    track.addEventListener('pointerup', release);
    track.addEventListener('pointercancel', release);
    // A real drag should not open the card's link.
    track.addEventListener('click', e => {
      if (moved > 6 && Date.now() - upAt < 600) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    // Auto-advance every 3s. Grabbing the carousel restarts the countdown;
    // ticks are skipped while a drag is live or the tab is hidden, and the
    // reduced-motion preference disables auto-play entirely.
    let timer = 0;
    function arm() {
      clearTimeout(timer);
      if (reduce || slides.length < 2) return;
      timer = setTimeout(() => {
        if (!dragging && !document.hidden) {
          target = base - ((current() + 1) % slides.length) * w;
          kick();
        }
        arm();
      }, 3000);
    }
    arm();
    const refit = () => {
      const i = current();
      measure();
      x = target = base - i * w;
      apply();
    };
    window.addEventListener('resize', refit);
    // Tile-mode resizing changes the card width without a window resize
    // event, which left w/base stale and snapped the carousel to half a
    // slide. Re-measure whenever the track itself changes size.
    if (window.ResizeObserver) new ResizeObserver(refit).observe(track);
    measure();
    x = target = base;
    apply();
  });

  // Bottom-sheet article viewer: home work cards and the works listing open
  // in a sheet that springs up while the page behind steps back (scale + dim).
  const pageWorks = document.querySelector('.works-card.works-carousel, .video-listing');
  if (pageWorks) {
    const shell = document.createElement('div');
    shell.className = 'page-shell';
    while (document.body.firstChild) shell.appendChild(document.body.firstChild);
    document.body.appendChild(shell);
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    const sheet = document.createElement('section');
    sheet.className = 'sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', '文章预览');
    sheet.tabIndex = -1;
    sheet.innerHTML = '<span class="sheet-grabber" aria-hidden="true"></span>'
      + '<div class="sheet-scroll"><div class="sheet-inner"><h2 class="sheet-title"></h2>'
      + '<div class="sheet-meta"></div><div class="sheet-tags"></div>'
      + '<div class="content sheet-content"></div>'
      + '<aside class="disclaimer sheet-disclaimer" aria-label="免责声明" hidden></aside>'
      + '<section class="sheet-memo" hidden><header class="memo-head"><span class="eyebrow">COMMENTS<span class="eyebrow-sub">/ 评论</span></span><span class="memo-count sheet-memo-count"></span></header>'
      + '<div class="memo-list sheet-memo-list"><p class="quiet memo-empty">载入中…</p></div></section>'
      + '<a class="sheet-open" href="#">阅读原文 ↗</a></div></div>';
    document.body.append(backdrop, sheet);
    const scroller = sheet.querySelector('.sheet-scroll');
    const sTitle = sheet.querySelector('.sheet-title');
    const sMeta = sheet.querySelector('.sheet-meta');
    const sTags = sheet.querySelector('.sheet-tags');
    const sContent = sheet.querySelector('.sheet-content');
    const sDisc = sheet.querySelector('.sheet-disclaimer');
    const sMemo = sheet.querySelector('.sheet-memo');
    const sMemoList = sheet.querySelector('.sheet-memo-list');
    const sMemoCount = sheet.querySelector('.sheet-memo-count');
    const sOpen = sheet.querySelector('.sheet-open');
    // 弹窗右上角展示导航栏 Logo（自动跟随深浅色切换）
    const brandImages = document.querySelector('.site-header .brand-images');
    if (brandImages) {
      const sheetBrand = brandImages.cloneNode(true);
      sheetBrand.className = 'brand-images sheet-brand';
      sheetBrand.removeAttribute('style');
      sheet.querySelector('.sheet-inner').appendChild(sheetBrand);
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lastFocus = null;

    // Wait for biliEnhance to be registered, loading bili.js on demand as a
    // deduped promise — so rapid clicks still end up with a ready enhancer.
    // 8 秒兜底超时：网络抖动或浏览器卡住时别让抽屉一直等。
    let biliPromise = null;
    const waitBiliEnhance = () => {
      if (window.biliEnhance) return Promise.resolve(window.biliEnhance);
      if (biliPromise) return biliPromise;
      biliPromise = new Promise(resolve => {
        let settled = false;
        const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
        const script = document.createElement('script');
        script.src = '/plugins/bilibili/bili.js';
        script.onload = () => finish(window.biliEnhance || null);
        script.onerror = () => finish(null);
        document.head.appendChild(script);
        setTimeout(() => finish(window.biliEnhance || null), 8000);
      });
      return biliPromise;
    };

    // Enhance the parsed DOMParser document — not the already-inserted sheet
    // content — so the user never glimpses the "iframe …" raw HTML.
    const enhanceSheet = async (doc) => {
      const target = doc.querySelector('.content');
      if (!target) return;
      const enhance = await waitBiliEnhance();
      if (enhance) enhance(target);
    };

    const fill = (a) => {
      sTitle.textContent = a.closest('figure')?.querySelector('figcaption a')?.textContent
        || a.querySelector('h2')?.textContent || a.textContent.trim();
      sMeta.textContent = '';
      sTags.textContent = '';
      sDisc.hidden = true; sDisc.innerHTML = '';
      sMemo.hidden = true; sMemoCount.textContent = ''; sMemoList.innerHTML = '';
      sContent.innerHTML = '<div class="sheet-skeleton"><span style="width:92%"></span><span style="width:84%"></span><span style="width:88%"></span><span style="width:60%"></span></div>';
      sOpen.href = a.href;
    };

    function closeSheet() {
      if (!sheet.classList.contains('is-open')) return;
      sheet.classList.remove('is-open', 'is-drag');
      sheet.style.transform = '';
      sheet.classList.add('is-closing');
      shell.classList.remove('is-behind');
      backdrop.classList.remove('is-on');
      document.documentElement.style.overflow = '';
      setTimeout(() => {
        sheet.classList.remove('is-closing');
        backdrop.style.display = '';
        // Tear down the previewed article: embedded videos (bilibili
        // iframes) keep playing otherwise, and the fetched DOM is dead weight.
        sContent.innerHTML = ''; sDisc.innerHTML = ''; sMemoList.innerHTML = '';
        sMeta.innerHTML = ''; sTags.innerHTML = '';
        sDisc.hidden = true; sMemo.hidden = true; sMemoCount.textContent = '';
        if (lastFocus) { lastFocus.focus({ preventScroll: true }); lastFocus = null; }
      }, reduce ? 0 : 380);
    }

    // 抽屉里的评论：直接读文章页那套 Waline 接口，只读展示列表
    async function loadSheetMemo(doc, fallback) {
      const board = doc.querySelector('#memo-board') || doc.querySelector('.memo-card');
      const server = board && board.dataset.server;
      const path = (board && board.dataset.path) || fallback;
      if (!server || !window.kiteMemoRow) { sMemo.hidden = true; return; }
      sMemo.hidden = false;
      sMemoCount.textContent = '';
      sMemoList.innerHTML = '<p class="quiet memo-empty">载入中…</p>';
      try {
        const q = '?type=comment&path=' + encodeURIComponent(path) + '&page=1&pageSize=20&sortBy=insertedAt_desc';
        const res = await fetch(server + '/api/comment' + q, { headers: { Accept: 'application/json' } });
        const json = await res.json();
        if (!res.ok || json.errno) throw new Error(json.errmsg || 'http ' + res.status);
        const data = json.data || {};
        const items = data.data || [];
        if (data.count) sMemoCount.textContent = fmtCompact(data.count) + ' 条';
        sMemoList.innerHTML = '';
        if (!items.length) { sMemoList.innerHTML = ''; if (window.kiteMemoEmpty) sMemoList.append(window.kiteMemoEmpty()); return; }
        items.forEach((c) => sMemoList.append(window.kiteMemoRow(c)));
      } catch (e) {
        sMemoList.innerHTML = '<p class="quiet memo-empty">留言暂时读不到</p>';
      }
    }

    let fetchToken = 0;
    function openSheet(anchor) {
      lastFocus = anchor;
      fill(anchor);
      const token = ++fetchToken;
      backdrop.style.display = 'block';
      sheet.classList.add('is-open');
      shell.classList.add('is-behind');
      backdrop.classList.add('is-on');
      document.documentElement.style.overflow = 'hidden';
      requestAnimationFrame(() => { scroller.scrollTop = 0; sheet.focus({ preventScroll: true }); });
      fetch(anchor.href, { cache: 'no-store' }).then(r => r.text()).then(async html => {
        if (token !== fetchToken) return; // another card was opened meanwhile
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // 在 DOMParser 文档里先把 B 站嵌入换成播放器盒子，再注入抽屉，
        // 这样不会暴露那段"iframe src=…"的原始文本。
        await enhanceSheet(doc);
        if (token !== fetchToken) return;
        sTitle.textContent = doc.querySelector('.article-heading h1')?.textContent || sTitle.textContent;
        sMeta.innerHTML = doc.querySelector('.post-meta')?.innerHTML || '';
        sTags.innerHTML = doc.querySelector('.tags')?.innerHTML || '';
        sContent.innerHTML = doc.querySelector('.content')?.innerHTML
          || '<p class="quiet">内容加载失败，点击下方链接查看完整文章。</p>';
        scroller.scrollTop = 0;
        // DOMParser 里的 enhance 只留了带 data-bili-url 的占位盒子，
        // 真实 DOM 里再跑一次，补上 iframe + load 监听，opacity 才会在 load 后解锁。
        if (window.biliEnhance) window.biliEnhance(sContent);
        // 抽屉里的播放器同样按封面定横竖屏：封面写在文章页 <article> 上，
        // 这里把它挪到抽屉正文，biliRatio 才能量到。
        const cover = doc.querySelector('.article')?.dataset.cover;
        if (cover) sContent.dataset.cover = cover; else delete sContent.dataset.cover;
        if (window.biliRatio) window.biliRatio(sContent);
        const disc = doc.querySelector('aside.disclaimer');
        if (disc) {
          sDisc.innerHTML = disc.innerHTML;
          sDisc.hidden = false;
        }
        loadSheetMemo(doc, anchor.href);
      }).catch(() => {
        if (token !== fetchToken) return;
        sContent.innerHTML = '<p class="quiet">内容加载失败，点击下方链接查看完整文章。</p>';
      });
    }

    document.addEventListener('click', e => {
      const a = e.target.closest('.moment-slide a, .recent-item, .timeline-title, .video-card-link');
      if (!a || e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      openSheet(a);
    });
    backdrop.addEventListener('click', closeSheet);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

    // Drag to dismiss: follows the finger down (rubber band up), closes
    // past 1/3 of the sheet or on a quick downward flick.
    let pressing = false, engaged = false, sy = 0, dy = 0, ly = 0, lt = 0, vel = 0;
    sheet.addEventListener('pointerdown', e => {
      if (!sheet.classList.contains('is-open') || e.button !== 0) return;
      if (e.pointerType && e.pointerType !== 'mouse') return; // touch/pen are handled by the touch events below
      pressing = true; engaged = false; dy = 0; vel = 0;
      sy = ly = e.clientY; lt = performance.now();
    });
    sheet.addEventListener('pointermove', e => {
      if (!pressing) return;
      const raw = e.clientY - sy;
      if (!engaged) {
        // Mouse drags dismiss from anywhere; touch defers to content
        // scrolling until the sheet is at the top (or on the grabber).
        const canGrab = e.pointerType === 'mouse' || scroller.scrollTop <= 2 || e.target.closest('.sheet-grabber');
        if (raw > 8 && canGrab) {
          engaged = true;
          sheet.classList.add('is-drag');
          try { sheet.setPointerCapture(e.pointerId); } catch (_) {}
        } else if (raw < -8) { pressing = false; return; }
        else return;
      }
      dy = raw > 0 ? raw : raw * 0.22;
      const now = performance.now(), dt = now - lt;
      if (dt > 0) { vel = (e.clientY - ly) / dt; ly = e.clientY; lt = now; }
      sheet.style.transform = `translate(-50%, ${dy.toFixed(1)}px)`;
    });
    const endDrag = () => {
      pressing = false;
      if (!engaged) return;
      engaged = false;
      sheet.classList.remove('is-drag');
      const h = sheet.offsetHeight || 1;
      if (dy > Math.min(h * 0.28, 150) || (dy > 30 && vel > 0.45)) closeSheet();
      else sheet.style.transform = ''; // springs back via transition
    };
    sheet.addEventListener('pointerup', endDrag);
    sheet.addEventListener('pointercancel', endDrag);

    // Touch: the browser would claim the vertical pan for scrolling and fire
    // pointercancel mid-drag (the reason dismissal felt impossible on
    // phones). Drive the drag from touch events instead and preventDefault
    // once engaged, like vaul and Radix sheets do, so the gesture is ours.
    let touching = false;
    sheet.addEventListener('touchstart', e => {
      if (!sheet.classList.contains('is-open') || !e.touches.length) return;
      touching = true; pressing = false; engaged = false; dy = 0; vel = 0;
      sy = ly = e.touches[0].clientY; lt = performance.now();
    }, { passive: true });
    sheet.addEventListener('touchmove', e => {
      if (!touching || !e.touches.length) return;
      const raw = e.touches[0].clientY - sy;
      if (!engaged) {
        if (raw > 8 && (scroller.scrollTop <= 2 || e.target.closest('.sheet-grabber'))) {
          engaged = true;
          sheet.classList.add('is-drag');
        } else if (raw < -8) { touching = false; return; }
        else return;
      }
      e.preventDefault();
      dy = raw > 0 ? raw : raw * 0.22;
      const now = performance.now(), dt = now - lt;
      if (dt > 0) { vel = (e.touches[0].clientY - ly) / dt; ly = e.touches[0].clientY; lt = now; }
      sheet.style.transform = `translate(-50%, ${dy.toFixed(1)}px)`;
    }, { passive: false });
    const endTouch = () => { if (!touching) return; touching = false; endDrag(); };
    sheet.addEventListener('touchend', endTouch);
    sheet.addEventListener('touchcancel', endTouch);
  }

  // Moments photo card: in-place 3D flip. Clicking the cover spins the whole
  // card on its Y axis to reveal the moment content on the back face; no
  // overlay, no scroll lock. Esc or the back button flips it forward again.
  const photoCard = document.querySelector('.photo-card.has-flip');
  if (photoCard) {
    const clone = photoCard.querySelector('.moment-clone');
    if (clone) {
      const onKey = e => {
        if (e.key === 'Escape' && photoCard.classList.contains('is-flipped')) photoCard.classList.remove('is-flipped');
      };
      photoCard.addEventListener('click', e => {
        if (e.__momentFlip) return; // one click, one flip decision (double-bound handlers in test rigs)
        e.__momentFlip = true;
        if (photoCard.classList.contains('is-flipped')) {
          // Back face: links and text selection keep their normal behavior;
          // any other click flips the card forward again.
          if (e.target.closest('a')) return;
          const sel = getSelection();
          if (!sel.isCollapsed && photoCard.contains(sel.anchorNode)) return;
          e.preventDefault();
          photoCard.classList.remove('is-flipped');
          return;
        }
        // Front face: any click flips the card over.
        e.preventDefault();
        clone.hidden = false;
        requestAnimationFrame(() => photoCard.classList.add('is-flipped'));
      });
      document.addEventListener('keydown', onKey);
    }
  }

  // Liquid-glass header: the edge glow slides with scroll, and glass/text
  // colors flip to the dark variant when what passes underneath is dark.
  const glass = document.querySelector('.site-header');
  if (glass) {
    let glassTick = false;
    let lastY = window.scrollY;
    const mobileNavMq = matchMedia('(max-width:650px)');
    const glassProbe = () => {
      glassTick = false;
      const sy = window.scrollY;
      glass.style.setProperty('--glow-x', (50 + Math.sin(sy / 700) * 36).toFixed(1) + '%');
      glass.classList.toggle('is-scrolled', sy > 8);
      // Mobile: scroll down hides the bar, scroll up brings it back.
      if (mobileNavMq.matches) {
        const dy = sy - lastY;
        if (sy < 140 || dy < -8) glass.classList.remove('is-nav-hidden');
        else if (dy > 8) glass.classList.add('is-nav-hidden');
      } else {
        glass.classList.remove('is-nav-hidden');
      }
      lastY = sy;
      const y = Math.min((glass.offsetHeight || 70) + 18, window.innerHeight - 2);
      let lum = 0.85; // assume the light page background when nothing solid is below
      for (const el of document.elementsFromPoint(window.innerWidth / 2, y)) {
        if (el === glass || glass.contains(el)) continue;
        const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (m && (m[4] === undefined || parseFloat(m[4]) > .5)) {
          lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
          break;
        }
      }
      glass.classList.toggle('is-on-dark', lum < .45);
    };
    addEventListener('scroll', () => { if (!glassTick) { glassTick = true; requestAnimationFrame(glassProbe); } }, { passive: true });
    glassProbe();
  }

  // Archive: a quiet index instead of a map — one row per category with a
  // weight bar and a count, so the whole archive reads at a glance.
  const mapHost = document.getElementById('archive-map');
  if (mapHost) {
    const dataEl = mapHost.parentElement.querySelector('.archive-data');
    if (dataEl) {
      const posts = [...dataEl.querySelectorAll('a[data-t]')].map(a => ({
        t: a.dataset.t, u: a.dataset.u, c: (a.dataset.c || '').split('|').filter(Boolean)
      }));
      const catUrls = {};
      dataEl.querySelectorAll('b[data-n]').forEach(b => {
        if (!catUrls[b.dataset.n]) catUrls[b.dataset.n] = { url: b.dataset.u, label: b.dataset.label || b.dataset.n };
      });
      const cats = Object.keys(catUrls).map(k => ({
        name: catUrls[k].label, url: catUrls[k].url, count: posts.filter(p => p.c.includes(k)).length
      })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh'));
      const zh = locale.startsWith('zh');

      if (cats.length) {
        const list = document.createElement('div');
        list.className = 'archive-list';
        const max = Math.max(...cats.map(c => c.count)) || 1;
        cats.forEach((cat, i) => {
          const row = document.createElement('a');
          row.className = 'archive-row';
          row.href = cat.url;
          const idx = document.createElement('span');
          idx.className = 'archive-idx';
          idx.textContent = String(i + 1).padStart(2, '0');
          const name = document.createElement('span');
          name.className = 'archive-name';
          name.textContent = cat.name;
          const bar = document.createElement('span');
          bar.className = 'archive-bar';
          const fill = document.createElement('i');
          fill.style.width = Math.round(cat.count / max * 100) + '%';
          bar.append(fill);
          const count = document.createElement('span');
          count.className = 'archive-count';
          count.textContent = String(cat.count);
          row.append(idx, name, bar, count);
          list.append(row);
        });
        const meta = document.createElement('p');
        meta.className = 'archive-meta';
        meta.textContent = zh
          ? `${posts.length} 篇 · ${cats.length} 个分类`
          : `${posts.length} posts · ${cats.length} categories`;
        mapHost.append(list, meta);
      } else {
        mapHost.insertAdjacentHTML('beforeend', '<p class="quiet">' + (zh ? '还没有文章' : 'No posts yet.') + '</p>');
      }
    }
  }

  // Desktop tile mode: all cards share ONE 3-column grid (the row
  // sections become display:contents), so any card can swap with any
  // other — across rows too. Drag the ⠿ handle onto another card to
  // swap places, or onto empty grid space to just move; drag the
  // corner grip to resize in fixed steps (1/2/3 columns × 1/2/3 rows,
  // overlapped neighbours get pushed aside). Double-click ⠿ resets.
  // Persists in localStorage; ?tiles=1 force-enables the mode below
  // the desktop breakpoint for testing.
  (() => {
    if (!document.querySelector('.page-home')) return;
    const gridEl = document.querySelector('.home-grid');
    if (!gridEl) return;
    const mq = window.matchMedia('(min-width:1024px)');
    const LC = window.HOME_LAYOUT_CONFIG || {};
    const defaultOn = LC.defaultView !== 'bento';
    const enabled = () => /[?&]tiles=1/.test(location.search) || (defaultOn && mq.matches);
    const STORE = 'home-tiles-v3'; // 默认排版变更时递增，避免旧缓存覆盖新布局
    const COLS = LC.cols || 3;
    const MAXW = COLS;
    const MAXH = 3;
    const ROW_H = LC.rowHeight || 280;
    const GAP = 12;
    const DEFS = [
      { id: 'works', sel: '.work-big', r: 1, c: 1, w: 2, h: 2 },
      { id: 'hero', sel: '.hero-big', r: 1, c: 3, w: 1, h: 2 },
      { id: 'moments', sel: '.moments-big', r: 3, c: 1, w: 1, h: 2 },
      { id: 'stats', sel: '.stats-big', r: 3, c: 2, w: 2, h: 1 },
      { id: 'cal', sel: '.calendar-card', r: 4, c: 2, w: 1, h: 1 },
      { id: 'plan', sel: '.plan-card', r: 4, c: 3, w: 1, h: 1 },
      { id: 'archive', sel: '.archive-map-card', r: 5, c: 1, w: 1, h: 1 },
      { id: 'music', sel: '.music-card', r: 5, c: 2, w: 1, h: 1 },
      { id: 'bookmarks', sel: '.bookmarks-card', r: 5, c: 3, w: 1, h: 1 },
    ];
    // 主题设置里 card_positions 覆盖默认位置（用户后台配置）
    const CL = window.CARD_LAYOUTS || {};
    DEFS.forEach(d => { if (CL[d.id]) { d.r = CL[d.id].r; d.c = CL[d.id].c; d.w = CL[d.id].w; d.h = CL[d.id].h; } });
    const cards = [];
    let state = new Map();
    DEFS.forEach(d => {
      const el = document.querySelector(d.sel);
      if (el) { cards.push({ id: d.id, el }); state.set(d.id, { r: d.r, c: d.c, w: d.w, h: d.h }); }
    });
    const ov = (a, b) => a.r < b.r + b.h && b.r < a.r + a.h && a.c < b.c + b.w && b.c < a.c + a.w;
    console.log('[tile] init', { LC, CL_count: Object.keys(CL).length, cardCount: cards.length, mq: mq.matches, defaultOn, enabled: enabled(), MAXW, MAXH, COLS });
    try {
      const savedRaw = localStorage.getItem(STORE);
      const saved = savedRaw ? JSON.parse(savedRaw) : null;
      const hashOk = saved && saved.__hash__ === LC.layoutHash;
      const dimsOk = saved && cards.every(c => { const t = saved[c.id]; return t && t.r >= 1 && t.c >= 1 && t.w >= 1 && t.h >= 1 && t.w <= MAXW && t.h <= MAXH && t.c + t.w - 1 <= COLS; });
      const noOverlap = saved && !cards.some((a, i) => cards.some((b, j) => j > i && ov(saved[a.id], saved[b.id])));
      const ok = !saved || (saved && !saved.__hash__) || (hashOk && cards.length > 0 && dimsOk && noOverlap);
      console.log('[tile] load', { hasSaved: !!saved, savedHash: saved?.__hash__, expectHash: LC.layoutHash, hashOk, dimsOk, noOverlap, ok });
      if (saved && ok && saved.__hash__) cards.forEach(c => state.set(c.id, { r: saved[c.id].r, c: saved[c.id].c, w: saved[c.id].w, h: saved[c.id].h }));
      else if (saved && saved.__hash__ && !ok) { console.log('[tile] purging bad LS'); localStorage.removeItem(STORE); }
    } catch (e) { console.log('[tile] load error', e); }
    const render = () => {
      const out = { __hash__: LC.layoutHash };
      cards.forEach(c => {
        const t = state.get(c.id);
        c.el.style.gridArea = t.r + ' / ' + t.c + ' / ' + (t.r + t.h) + ' / ' + (t.c + t.w);
        out[c.id] = t;
      });
      try { localStorage.setItem(STORE, JSON.stringify(out)); } catch (e) {}
      console.log('[tile] render saved', out);
    };
    // Nearest free cell for a w×h card among `placed` (Manhattan distance
    // from `near` keeps pushed cards close to where they were).
    const freeSpot = (placed, w, h, near) => {
      const maxR = placed.reduce((m, t) => Math.max(m, t.r + t.h - 1), 0);
      let best = null, bd = Infinity;
      for (let r = 1; r <= maxR + h; r++)
        for (let c = 1; c + w - 1 <= COLS; c++) {
          if (placed.some(t => ov({ r, c, w, h }, t))) continue;
          const d = near ? Math.abs(r - near.r) + Math.abs(c - near.c) : 0;
          if (d < bd) { bd = d; best = { r, c }; }
        }
      return best;
    };
    // Apply the moves, pushing overlapped neighbours to the nearest free
    // cell; rolls everything back (returns false) when it cannot fit.
    const commit = moves => {
      const st = new Map(state);
      const pinned = new Set();
      moves.forEach(([id, p]) => { st.set(id, p); pinned.add(id); });
      for (let guard = 60; guard--;) {
        const list = [...st.entries()].map(([id, v]) => ({ id, ...v }));
        const a = list.find(x => list.some(y => y.id !== x.id && ov(x, y)));
        if (!a) { state = st; render(); return true; }
        const b = list.find(y => y.id !== a.id && ov(a, y));
        const pick = pinned.has(a.id) && !pinned.has(b.id) ? b : a;
        if (pinned.has(pick.id)) return false;
        const spot = freeSpot(list.filter(t => t.id !== pick.id), pick.w, pick.h, pick);
        if (!spot) return false;
        st.set(pick.id, { r: spot.r, c: spot.c, w: pick.w, h: pick.h });
        pinned.add(pick.id);
      }
      return false;
    };
    const startDrag = (e, card) => {
      if (e.pointerType === 'touch') return;
      if (e.button != null && e.button > 0) return;
      e.stopPropagation();
      const sx = e.clientX, sy = e.clientY;
      let target = null, moved = false;
      const unhighlight = () => { if (target) { target.el.classList.remove('tile-target'); target = null; } };
      card.el.classList.add('tile-dragging');
      document.body.classList.add('is-tile-dragging');
      const move = ev => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        moved = true;
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const el = under && under.closest ? under.closest('.page-home .card') : null;
        const hit = el && cards.find(c => c.el === el && c !== card) || null;
        if (hit !== target) { unhighlight(); target = hit; if (target) target.el.classList.add('tile-target'); }
      };
      const up = ev => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.body.classList.remove('is-tile-dragging');
        card.el.classList.remove('tile-dragging');
        if (!moved) { unhighlight(); return; }
        const a = state.get(card.id);
        const t = target;
        let done = false;
        if (t) {
          t.el.classList.remove('tile-target');
          const b = state.get(t.id);
          if (a.r !== b.r || a.c !== b.c) {
            done = commit([
              [card.id, { r: b.r, c: Math.min(b.c, COLS - a.w + 1), w: a.w, h: a.h }],
              [t.id, { r: a.r, c: a.c, w: b.w, h: b.h }],
            ]);
          }
        } else {
          const g = gridEl.getBoundingClientRect();
          if (ev.clientX >= g.left && ev.clientX <= g.right && ev.clientY >= g.top && ev.clientY <= g.bottom) {
            const c = Math.min(COLS - a.w + 1, Math.max(1, Math.floor((ev.clientX - g.left) / (g.width / COLS)) + 1));
            const r = Math.max(1, Math.floor((ev.clientY - g.top) / (ROW_H + GAP)) + 1);
            done = (r !== a.r || c !== a.c) && commit([[card.id, { r, c, w: a.w, h: a.h }]]);
          }
        }
        target = null;
        if (!done) render();
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    };
    const startResize = (e, card) => {
      if (e.pointerType === 'touch') return;
      if (e.button != null && e.button > 0) return;
      e.stopPropagation();
      const start = { ...state.get(card.id) };
      card.el.classList.add('tile-resizing');
      document.body.classList.add('is-tile-resizing');
      let next = null;
      const move = ev => {
        const g = gridEl.getBoundingClientRect();
        const w = Math.max(1, Math.min(Math.min(MAXW, COLS - start.c + 1), Math.round((ev.clientX - g.left) / (g.width / COLS)) - start.c + 1));
        const h = Math.max(1, Math.min(MAXH, Math.round((ev.clientY - g.top) / (ROW_H + GAP)) - start.r + 1));
        if (!next || next.w !== w || next.h !== h) {
          next = { w, h };
          card.el.style.gridArea = start.r + ' / ' + start.c + ' / ' + (start.r + h) + ' / ' + (start.c + w);
        }
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.body.classList.remove('is-tile-resizing');
        card.el.classList.remove('tile-resizing');
        if (next && (next.w !== start.w || next.h !== start.h)) {
          if (!commit([[card.id, { r: start.r, c: start.c, w: next.w, h: next.h }]])) render();
        } else render();
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    };
    const mount = card => {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'tile-handle';
      handle.title = '拖动换位（可跨行） · 双击重置布局';
      handle.textContent = '⠿';
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'tile-resize';
      grip.title = '拖动调整大小（1/2/3 档）';
      grip.textContent = '◢';
      [handle, grip].forEach(el => {
        el.addEventListener('pointerdown', ev => ev.stopPropagation());
        el.addEventListener('click', ev => ev.stopPropagation());
      });
      handle.addEventListener('pointerdown', e => startDrag(e, card));
      grip.addEventListener('pointerdown', e => startResize(e, card));
      handle.addEventListener('dblclick', () => {
        DEFS.forEach(d => { if (state.has(d.id)) state.set(d.id, { r: d.r, c: d.c, w: d.w, h: d.h }); });
        render();
      });
      card.el.append(handle, grip);
    };
    cards.forEach(mount);
    const apply = () => {
      const on = enabled();
      console.log('[tile] apply', { on, mq: mq.matches, searchTiles: /[?&]tiles=1/.test(location.search), defaultOn });
      document.body.classList.toggle('tile-mode', on);
      if (on) {
        // 根据主题设置动态注入列数和行高（覆盖 CSS 里的硬编码）
        gridEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
        gridEl.style.gridAutoRows = ROW_H + 'px';
        render();
      } else {
        gridEl.style.gridTemplateColumns = '';
        gridEl.style.gridAutoRows = '';
        cards.forEach(c => { c.el.style.gridArea = ''; });
      }
    };
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
  })();
})();

/* Moments lightbox: click an image inside the 一瞬 stream to view it full-screen */
(function () {
  var root = document.querySelector('.moments-listing');
  if (!root) return;
  var box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', '图片预览');
  box.innerHTML = '<button class="lightbox-close" type="button" aria-label="关闭">×</button><figure><img alt=""><figcaption></figcaption></figure>';
  document.body.appendChild(box);

  var img = box.querySelector('img');
  var cap = box.querySelector('figcaption');

  function open(src, alt) {
    img.src = src;
    img.alt = alt || '';
    cap.textContent = alt || '';
    box.hidden = false;
    document.documentElement.classList.add('lightbox-open');
    box.querySelector('.lightbox-close').focus();
    // 弹簧弹出：scale 0.85 → 1，带回弹
    img.style.animation = 'none';
    spring({ from: .85, to: 1, stiffness: 120, damping: 12, onUpdate: s => {
      img.style.transform = 'scale(' + s + ')';
    }});
  }

  function close() {
    box.hidden = true;
    img.removeAttribute('src');
    document.documentElement.classList.remove('lightbox-open');
  }

  root.addEventListener('click', function (e) {
    var t = e.target;
    if (t.tagName === 'IMG' && t.closest('.moment-body')) {
      e.preventDefault();
      open(t.currentSrc || t.src, t.alt);
    }
  });

  box.addEventListener('click', function (e) {
    if (e.target === box || e.target.classList.contains('lightbox-close')) close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !box.hidden) close();
  });
})();

  // 封面加载占位：图片解码完成前盖上一层呼吸流光，避免逐行显影
  (() => {
    const MIN_W = 120, MIN_H = 60;
    const attach = (img) => {
      if (!img || img.tagName !== 'IMG' || img.dataset.imgFx) return;
      if (img.complete) return; // 缓存命中或已加载，不加占位
      if (img.closest('.video-listing')) return; // 作品集封面由封面框自己的流光负责
      let host = img.parentElement;
      while (host && getComputedStyle(host).display === 'contents') host = host.parentElement;
      if (!host || host === document.body) return;
      const r = img.getBoundingClientRect();
      if (r.width < MIN_W || r.height < MIN_H) return;
      img.dataset.imgFx = '1';
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const mask = document.createElement('span');
      mask.className = 'img-shimmer';
      mask.setAttribute('aria-hidden', 'true');
      img.classList.add('is-img-pending');
      host.insertBefore(mask, img);
      let done = false;
      const reveal = () => {
        if (done) return;
        done = true;
        img.classList.remove('is-img-pending');
        img.classList.add('is-img-ready');
        mask.classList.add('is-out');
        setTimeout(() => mask.remove(), 500);
      };
      img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', reveal, { once: true });
    };
    const scan = (root) => {
      if (root.tagName === 'IMG') attach(root);
      if (!root.querySelectorAll) return;
      root.querySelectorAll('img:not([data-img-fx])').forEach(attach);
    };
    const boot = () => {
      scan(document);
      new MutationObserver((list) => {
        list.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); }));
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  })();

  // 主视觉 3D IP：指针视差 + 点击弹跳
  (() => {
    const hero = document.querySelector('.creator-hero');
    const stage = document.getElementById('creator-stage');
    if (!hero || !stage) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (window.matchMedia('(pointer:fine)').matches && !calm.matches) {
      let raf = 0, mx = 0, my = 0;
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        mx = ((e.clientX - r.left) / r.width) * 2 - 1;
        my = ((e.clientY - r.top) / r.height) * 2 - 1;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          hero.style.setProperty('--mx', mx.toFixed(3));
          hero.style.setProperty('--my', my.toFixed(3));
        });
      });
      hero.addEventListener('pointerleave', () => {
        hero.style.setProperty('--mx', '0');
        hero.style.setProperty('--my', '0');
      });
    }
    stage.addEventListener('click', () => {
      stage.classList.remove('is-pop');
      void stage.offsetWidth;
      stage.classList.add('is-pop');
      window.setTimeout(() => stage.classList.remove('is-pop'), 800);
    });
  })();

  // ===== Tooltip 组件（延迟显示 + 温暖期 + 智能定位 + 接管 title） =====
  (function initTooltip() {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SHOW_DELAY = 400, WARM_PERIOD = 600;
    let tt = null, showTimer = 0, warmTimer = 0, warm = false, currentEl = null;
    const create = () => {
      tt = document.createElement('div');
      tt.className = 'tt';
      document.body.appendChild(tt);
    };
    const place = (el) => {
      const r = el.getBoundingClientRect();
      const tw = tt.offsetWidth, th = tt.offsetHeight;
      const pad = 6;
      let left = r.left + r.width / 2;
      let top = r.bottom + pad;
      let place = 'bottom';
      // 底部空间不足时翻到上方
      if (top + th > window.innerHeight - pad) {
        top = r.top - th - pad;
        place = 'top';
      }
      // 水平边界收进视口
      left = Math.max(tw / 2 + pad, Math.min(window.innerWidth - tw / 2 - pad, left));
      tt.style.left = left + 'px';
      tt.style.top = top + 'px';
      tt.dataset.place = place;
    };
    const show = (el) => {
      const text = el.getAttribute('data-tip') || el.getAttribute('title');
      if (!text || !text.trim()) return;
      currentEl = el;
      if (!tt) create();
      const kbd = el.getAttribute('data-kbd');
      tt.innerHTML = text + (kbd ? '<span class="tt-kbd">' + kbd + '</span>' : '');
      tt.classList.remove('is-show');
      place(el);
      requestAnimationFrame(() => tt.classList.add('is-show'));
      warm = true;
      clearTimeout(warmTimer);
    };
    const hide = () => {
      if (tt) tt.classList.remove('is-show');
      currentEl = null;
      warm = false;
      clearTimeout(showTimer);
      warmTimer = setTimeout(() => { warm = false; }, WARM_PERIOD);
    };
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip],[title]');
      if (!el || el.closest('.tt')) return;
      // 接管原生 title，避免浏览器提示叠加
      if (el.hasAttribute('title') && !el.hasAttribute('data-tip')) {
        el.setAttribute('data-tip', el.getAttribute('title'));
        el.removeAttribute('title');
      }
      clearTimeout(showTimer);
      if (warm && currentEl && currentEl !== el) {
        // 温暖期内直接显示（不等待）
        show(el);
      } else {
        showTimer = setTimeout(() => show(el), SHOW_DELAY);
      }
    });
    document.addEventListener('mouseout', (e) => {
      const el = e.target.closest('[data-tip]');
      if (!el) return;
      const to = e.relatedTarget;
      if (to && el.contains(to)) return;
      hide();
    });
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
  })();
