(() => {
  'use strict';
  const root = document.documentElement;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let stored = null;
  try { stored = localStorage.getItem('curiosity-theme'); } catch (_) {}
  const effective = () => stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : (mq.matches ? 'dark' : 'light');
  root.setAttribute('data-theme', effective());
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      if (stored === 'light' || stored === 'dark') {
        stored = null;
        try { localStorage.removeItem('curiosity-theme'); } catch (_) {}
      } else {
        stored = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('curiosity-theme', stored); } catch (_) {}
      }
      root.setAttribute('data-theme', effective());
    });
  }
  mq.addEventListener('change', () => { if (!stored) root.setAttribute('data-theme', effective()); });

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
  const zonedParts = (date) => Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)])
  );

  // Long moments stay readable in the feed; full content remains without JS.
  document.querySelectorAll('.moment-content').forEach((content, index) => {
    if (content.scrollHeight <= 420) return;
    content.id = `moment-content-${index}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'moment-expand';
    const expand = locale.startsWith('zh') ? '展开全文' : 'Read more';
    const collapse = locale.startsWith('zh') ? '收起全文' : 'Show less';
    button.textContent = expand;
    button.setAttribute('aria-controls', content.id);
    button.setAttribute('aria-expanded', 'false');
    content.classList.add('is-collapsed');
    const syncLinks = collapsed => content.querySelectorAll('a').forEach(link => {
      if (collapsed) {
        link.dataset.momentTabindex = link.getAttribute('tabindex') ?? '';
        link.setAttribute('tabindex', '-1');
      } else {
        const old = link.dataset.momentTabindex;
        if (old) link.setAttribute('tabindex', old); else link.removeAttribute('tabindex');
        delete link.dataset.momentTabindex;
      }
    });
    syncLinks(true);
    button.addEventListener('click', () => {
      const opening = button.getAttribute('aria-expanded') !== 'true';
      content.classList.toggle('is-collapsed', !opening);
      syncLinks(!opening);
      button.setAttribute('aria-expanded', String(opening));
      button.textContent = opening ? collapse : expand;
      if (!opening) content.closest('.moment-card').scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    content.after(button);
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
      const posts = getMonthPosts(year, month);

      // Update month label
      document.getElementById('calendar-month').textContent =
        new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));

      // Animate count
      animateCount(calCount, posts.length);

      // Render timeline items
      timelineItems.innerHTML = '';
      if (posts.length === 0) {
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
          const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
          const weekdayLabel = locale.startsWith('zh')
            ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][weekday]
            : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday];

          const dateEl = document.createElement('div');
          dateEl.className = 'timeline-date';
          dateEl.textContent = `${String(month + 1).padStart(2, '0')}.${String(day).padStart(2, '0')} · ${weekdayLabel}`;

          const titleEl = document.createElement('a');
          titleEl.className = 'timeline-title';
          titleEl.href = post.link;
          titleEl.textContent = post.title;

          item.appendChild(dateEl);
          item.appendChild(titleEl);
          timelineItems.appendChild(item);

          // Staggered animation
          setTimeout(() => item.classList.add('is-visible'), idx * 60);
        });
      }
    };

    const change = amount => {
      const d = new Date(Date.UTC(year, month + amount, 1));
      year = d.getUTCFullYear(); month = d.getUTCMonth(); draw();
    };
    document.getElementById('month-prev')?.addEventListener('click', () => change(-1));
    document.getElementById('month-next')?.addEventListener('click', () => change(1));
    const todayBtn = document.getElementById('calendar-today');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const original = todayBtn.innerHTML;
        todayBtn.innerHTML = '<span class="brand-dot" style="background:#22c55e"></span>已收到';
        todayBtn.style.color = '#22c55e';
        try {
          const key = `curiosity-nudge:${new Date().toDateString()}`;
          const count = parseInt(localStorage.getItem(key) || '0', 10) + 1;
          localStorage.setItem(key, String(count));
          if (count > 1) {
            setTimeout(() => {
              todayBtn.innerHTML = `<span class="brand-dot" style="background:#22c55e"></span>今天第 ${count} 次啦`;
            }, 800);
          }
        } catch (_) {}
        setTimeout(() => {
          todayBtn.innerHTML = original;
          todayBtn.style.color = '';
        }, 2000);
      });
    }
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

  // Video works: wrap every cover in a fixed 16:9 landscape frame so the grid
  // stays uniform — portrait sources are cropped by object-fit instead.
  document.querySelectorAll('.video-listing .video-card').forEach(card => {
    const img = card.querySelector('img.post-cover');
    if (!img) { card.classList.add('is-loaded'); return; }
    // wrap image
    const wrap = document.createElement('div');
    wrap.className = 'video-cover-wrap is-landscape';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
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

  // Umami stats（localStorage 缓存：当天 10 分钟内刷新直接读缓存，过期才重新请求）
  const sVis = document.getElementById('stats-visitors');
  if (sVis && window.curiosityStats) {
    const S = window.curiosityStats;
    const formatN = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
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
      sVis.textContent = formatN(total?.visitors?.value ?? 0);
      document.getElementById('stats-today').textContent = formatN(today?.visitors?.value ?? 0);
      document.getElementById('stats-pageviews').textContent = formatN(total?.pageviews?.value ?? 0);
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
            if (!cache) document.getElementById('stats-status').textContent = words.stats_failed || '统计暂不可用';
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

    // Moments: one pill per month, newest month first.
    setup({
      hostId: 'moments-filter',
      gridSel: '.moments-stream',
      cardSel: '.moment-card',
      keysOf: c => (c.dataset.date ? [c.dataset.date] : []),
      labelOf: k => k.replace('-', '.'),
      newestFirst: true,
      hashKey: 'month',
      allLabel: '全部',
      emptyText: '该时间暂无瞬间'
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
      + '<details class="comments-collapse sheet-comments" hidden><summary><span class="comments-toggle">评论<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></span></summary>'
      + '<section class="kite-comments sheet-thread" data-kite-comments></section></details>'
      + '<a class="sheet-open" href="#">阅读原文 ↗</a></div></div>';
    document.body.append(backdrop, sheet);
    const scroller = sheet.querySelector('.sheet-scroll');
    const sTitle = sheet.querySelector('.sheet-title');
    const sMeta = sheet.querySelector('.sheet-meta');
    const sTags = sheet.querySelector('.sheet-tags');
    const sContent = sheet.querySelector('.sheet-content');
    const sDisc = sheet.querySelector('.sheet-disclaimer');
    const sComments = sheet.querySelector('.sheet-comments');
    const sThread = sheet.querySelector('.sheet-thread');
    const sOpen = sheet.querySelector('.sheet-open');
    // Comments mount lazily: only when the reader expands the collapsed
    // block, since waline measures layout and a hidden container mis-renders.
    let pendingComments = null;
    sComments.addEventListener('toggle', () => {
      if (!sComments.open || sThread.dataset.mounted) return;
      sThread.dataset.mounted = '1';
      if (pendingComments) mountThread(pendingComments);
    });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let lastFocus = null;

    // Re-run content enhancers (e.g. the bilibili plugin's escaped-iframe
    // player) on freshly injected sheet content; lazy-load if not present.
    const enhanceSheet = () => {
      if (window.biliEnhance) { window.biliEnhance(sContent); return; }
      const s = document.createElement('script');
      s.src = '/plugins/bilibili/bili.js';
      s.onload = () => { if (window.biliEnhance) window.biliEnhance(sContent); };
      document.head.appendChild(s);
    };

    const fill = (a) => {
      sTitle.textContent = a.closest('figure')?.querySelector('figcaption a')?.textContent
        || a.querySelector('h2')?.textContent || a.textContent.trim();
      sMeta.textContent = '';
      sTags.textContent = '';
      sDisc.hidden = true; sDisc.innerHTML = '';
      sComments.hidden = true; sComments.open = false; sThread.innerHTML = '';
      delete sThread.dataset.mounted;
      pendingComments = null;
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
        sContent.innerHTML = ''; sDisc.innerHTML = ''; sThread.innerHTML = '';
        sMeta.innerHTML = ''; sTags.innerHTML = '';
        sDisc.hidden = true; sComments.hidden = true; sComments.open = false;
        delete sThread.dataset.mounted;
        pendingComments = null;
        if (lastFocus) { lastFocus.focus({ preventScroll: true }); lastFocus = null; }
      }, reduce ? 0 : 380);
    }

    // Sheet comments: pull the article's KiteComments config out of the
    // fetched page and mount a per-article thread into the sheet.
    const sheetCommentConfig = (doc) => {
      const s = [...doc.querySelectorAll('script')].find(x => x.textContent.includes('window.KiteComments'));
      if (!s) return null;
      // Evaluate against a throwaway global: the script assigns
      // window.KiteComments, and on a listing page that global would make the
      // lazily loaded comments plugin auto-init the sheet container as well —
      // mounting a second copy next to the one we start by hand.
      try { return (new Function('window', s.textContent + ';return window.KiteComments;'))({}); }
      catch (_) { return null; }
    };
    const mountThread = (cfg) => {
      const run = () => {
        if (!window.KiteCommentsInit) return;
        sThread.innerHTML = ''; // never stack a widget from a previous preview
        window.KiteCommentsInit(sThread, cfg);
      };
      if (window.KiteCommentsInit) { run(); return; }
      const s = document.createElement('script');
      s.src = '/plugins/comments/comments.js?v=' + Date.now();
      s.onload = run;
      document.head.appendChild(s);
    };

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
      fetch(anchor.href, { cache: 'no-store' }).then(r => r.text()).then(html => {
        if (token !== fetchToken) return; // another card was opened meanwhile
        const doc = new DOMParser().parseFromString(html, 'text/html');
        sTitle.textContent = doc.querySelector('.article-heading h1')?.textContent || sTitle.textContent;
        sMeta.innerHTML = doc.querySelector('.post-meta')?.innerHTML || '';
        sTags.innerHTML = doc.querySelector('.tags')?.innerHTML || '';
        sContent.innerHTML = doc.querySelector('.content')?.innerHTML
          || '<p class="quiet">内容加载失败，点击下方链接查看完整文章。</p>';
        scroller.scrollTop = 0;
        enhanceSheet();
        const disc = doc.querySelector('aside.disclaimer');
        if (disc) {
          sDisc.innerHTML = disc.innerHTML;
          sDisc.hidden = false;
        }
        pendingComments = sheetCommentConfig(doc);
        if (pendingComments) sComments.hidden = false;
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
        if (!catUrls[b.dataset.n]) catUrls[b.dataset.n] = b.dataset.u;
      });
      const cats = Object.keys(catUrls).map(n => ({
        name: n, url: catUrls[n], count: posts.filter(p => p.c.includes(n)).length
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
    const enabled = () => mq.matches || /[?&]tiles=1/.test(location.search);
    const STORE = 'home-tiles-v2';
    const COLS = 3, MAXW = 3, MAXH = 3, ROW_H = 280, GAP = 12;
    const DEFS = [
      { id: 'works', sel: '.work-big', r: 1, c: 1, w: 2, h: 2 },
      { id: 'hero', sel: '.hero-big', r: 1, c: 3, w: 1, h: 2 },
      { id: 'plan', sel: '.plan-card', r: 3, c: 1, w: 1, h: 1 },
      { id: 'moments', sel: '.moments-big', r: 3, c: 2, w: 2, h: 1 },
      { id: 'stats', sel: '.stats-big', r: 4, c: 1, w: 2, h: 1 },
      { id: 'archive', sel: '.archive-map-card', r: 4, c: 3, w: 1, h: 1 },
      { id: 'cal', sel: '.calendar-card', r: 5, c: 1, w: 1, h: 1 },
      { id: 'bookmarks', sel: '.bookmarks-card', r: 5, c: 2, w: 1, h: 1 },
      { id: 'music', sel: '.music-card', r: 5, c: 3, w: 1, h: 1 },
    ];
    const cards = [];
    let state = new Map();
    DEFS.forEach(d => {
      const el = document.querySelector(d.sel);
      if (el) { cards.push({ id: d.id, el }); state.set(d.id, { r: d.r, c: d.c, w: d.w, h: d.h }); }
    });
    const ov = (a, b) => a.r < b.r + b.h && b.r < a.r + a.h && a.c < b.c + b.w && b.c < a.c + a.w;
    try {
      const saved = JSON.parse(localStorage.getItem(STORE));
      const ok = saved && typeof saved === 'object' && cards.length > 0 &&
        cards.every(c => { const t = saved[c.id]; return t && t.r >= 1 && t.c >= 1 && t.w >= 1 && t.h >= 1 && t.w <= MAXW && t.h <= MAXH && t.c + t.w - 1 <= COLS; }) &&
        !cards.some((a, i) => cards.some((b, j) => j > i && ov(saved[a.id], saved[b.id])));
      if (ok) cards.forEach(c => state.set(c.id, { ...saved[c.id] }));
    } catch (e) {}
    const render = () => {
      const out = {};
      cards.forEach(c => {
        const t = state.get(c.id);
        c.el.style.gridArea = t.r + ' / ' + t.c + ' / ' + (t.r + t.h) + ' / ' + (t.c + t.w);
        out[c.id] = t;
      });
      try { localStorage.setItem(STORE, JSON.stringify(out)); } catch (e) {}
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
      document.body.classList.toggle('tile-mode', on);
      if (on) render();
      else cards.forEach(c => { c.el.style.gridArea = ''; });
    };
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply); else mq.addListener(apply);
  })();
})();
