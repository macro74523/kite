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
          if (year === cur.year && month === cur.month - 1 && day === cur.day) {
            cell.className = 'is-today';
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

  // Umami stats
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
    Promise.all([fetchStats(0), fetchStats(todayStart)])
      .then(([total, today]) => {
        const fail = !total && !today;
        if (fail) document.getElementById('stats-status').textContent = words.stats_failed || '统计暂不可用';
        else {
          sVis.textContent = formatN(total?.visitors?.value ?? 0);
          document.getElementById('stats-today').textContent = formatN(today?.visitors?.value ?? 0);
          document.getElementById('stats-pageviews').textContent = formatN(total?.pageviews?.value ?? 0);
          document.getElementById('stats-status').textContent = '';
        }
      }).catch(() => { document.getElementById('stats-status').textContent = words.stats_failed || '统计暂不可用'; });
  }
})();
