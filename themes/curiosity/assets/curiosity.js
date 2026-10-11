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

  // Calendar
  const days = document.getElementById('calendar-days');
  if (days) {
    const today = zonedParts(new Date());
    let year = today.year, month = today.month - 1;
    const postDates = new Set((days.dataset.dates || '').split('|').filter(Boolean));
    const draw = () => {
      const cur = zonedParts(new Date());
      document.getElementById('calendar-month').textContent =
        new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));
      days.replaceChildren();
      const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
      const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      for (let i = 0; i < offset + total; i++) {
        const cell = document.createElement('span');
        if (i >= offset) {
          const day = i - offset + 1;
          cell.textContent = String(day);
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (postDates.has(key)) cell.classList.add('has-post');
          if (year === cur.year && month === cur.month - 1 && day === cur.day) {
            cell.classList.add('is-today');
            cell.setAttribute('aria-label', `${words.today || 'Today'} ${day}`);
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

  // Works card: show as many items as fit the card height
  const worksCard = document.querySelector('.works-card');
  if (worksCard) {
    const wcs = getComputedStyle(worksCard);
    const fitWorks = () => {
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
