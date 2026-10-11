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

  // Calendar — ring style
  const days = document.getElementById('calendar-days');
  if (days) {
    const today = zonedParts(new Date());
    let year = today.year, month = today.month - 1;
    const postDates = new Set((days.dataset.dates || '').split('|').filter(Boolean));
    const ringProgress = document.getElementById('ring-progress');
    const ringDay = document.getElementById('ring-day');
    const ringWeekday = document.getElementById('ring-weekday');
    const ringPostcount = document.getElementById('ring-postcount');
    const circumference = 2 * Math.PI * 70; // r=70

    const countMonthPosts = (y, m) => {
      let count = 0;
      const total = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      for (let d = 1; d <= total; d++) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (postDates.has(key)) count++;
      }
      return count;
    };

    const draw = () => {
      const cur = zonedParts(new Date());
      const isCurrentMonth = year === cur.year && month === cur.month - 1;
      const totalDays = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const postCount = countMonthPosts(year, month);

      // Update month label
      document.getElementById('calendar-month').textContent =
        new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));

      // Ring center: show today's date if current month, else 1st of month
      const displayDay = isCurrentMonth ? cur.day : 1;
      const displayDate = new Date(Date.UTC(year, month, displayDay));
      ringDay.textContent = String(displayDay);
      ringWeekday.textContent = locale.startsWith('zh')
        ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][displayDate.getUTCDay()]
        : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][displayDate.getUTCDay()];

      // Ring progress: posts / total days (capped at 100%)
      const progress = Math.min(postCount / totalDays, 1);
      const offset = circumference * (1 - progress);
      ringProgress.style.strokeDasharray = `${circumference}`;
      ringProgress.style.strokeDashoffset = `${offset}`;

      // Post count
      ringPostcount.textContent = String(postCount);

      // Keep the hidden calendar-days updated for accessibility / fallback
      days.replaceChildren();
      const offset_d = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
      for (let i = 0; i < offset_d + totalDays; i++) {
        const cell = document.createElement('span');
        if (i >= offset_d) {
          const day = i - offset_d + 1;
          cell.textContent = String(day);
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (postDates.has(key)) cell.classList.add('has-post');
          if (year === cur.year && month === cur.month - 1 && day === cur.day) {
            cell.classList.add('is-today');
          }
        } else cell.setAttribute('aria-hidden', 'true');
        days.append(cell);
      }
    };

    const change = amount => {
      const d = new Date(Date.UTC(year, month + amount, 1));
      year = d.getUTCFullYear(); month = d.getUTCMonth(); draw();
    };
    document.getElementById('month-prev')?.addEventListener('click', () => change(-1));
    document.getElementById('month-next')?.addEventListener('click', () => change(1));
    document.getElementById('calendar-today')?.addEventListener('click', () => {
      const cur = zonedParts(new Date()); year = cur.year; month = cur.month - 1; draw();
    });
    draw();
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
    const trendDot = document.getElementById('trend-dot');
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

      // Dot at last point (today)
      const last = points[points.length - 1];
      trendDot.setAttribute('cx', last.x.toFixed(2));
      trendDot.setAttribute('cy', last.y.toFixed(2));

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

  // Video works: wrap cover, detect aspect ratio (16:9 landscape, 3:4 portrait)
  document.querySelectorAll('.video-listing .video-card').forEach(card => {
    const img = card.querySelector('img.post-cover');
    if (!img) { card.classList.add('is-loaded'); return; }
    // wrap image
    const wrap = document.createElement('div');
    wrap.className = 'video-cover-wrap';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    const done = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      wrap.classList.add(ratio > 1 ? 'is-landscape' : 'is-portrait');
      card.classList.add('is-loaded');
    };
    if (img.complete && img.naturalWidth) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', () => { wrap.classList.add('is-landscape'); card.classList.add('is-loaded'); }, { once: true });
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
})();
