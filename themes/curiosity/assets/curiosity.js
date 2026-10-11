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
    let finished = false;
    const done = (isError) => {
      if (finished) return;
      finished = true;
      const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.78;
      wrap.classList.add(ratio > 1 ? 'is-landscape' : 'is-portrait');
      card.classList.add('is-loaded');
    };
    if (img.complete && img.naturalWidth) done(false);
    else {
      img.addEventListener('load', () => done(false), { once: true });
      img.addEventListener('error', () => done(true), { once: true });
      // Fallback: show content after 3s even if image is still loading
      setTimeout(() => done(false), 3000);
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
