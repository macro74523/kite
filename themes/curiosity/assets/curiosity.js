(() => {
  'use strict';
  // 深色模式：默认跟随系统，点击切换为手动，再点恢复跟随系统
  const root = document.documentElement;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let stored = null;
  try { stored = localStorage.getItem('curiosity-theme'); } catch (_) {}
  const effective = () => stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : (mq.matches ? 'dark' : 'light');
  const apply = () => root.setAttribute('data-theme', effective());
  apply();
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
      apply();
    });
  }
  // 未手动选择时，跟随系统实时变化
  mq.addEventListener('change', () => { if (!stored) apply(); });
  const words = window.curiosityWords || {};
  const locale = document.body.dataset.language || 'zh-CN';
  let zone = document.body.dataset.timezone || 'Asia/Shanghai';
  try { new Intl.DateTimeFormat(locale, { timeZone: zone }).format(new Date()); }
  catch (_) { zone = 'Asia/Shanghai'; }
  const zonedParts = (date) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  };
  document.querySelectorAll('[data-open-dialog], #contact-button').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.openDialog || (button.id === 'contact-button' ? 'contact-dialog' : '');
      if (!id) return;
      const dialog = document.getElementById(id);
      if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
    });
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
  });
  const days = document.getElementById('calendar-days');
  if (days) {
    const today = zonedParts(new Date());
    let year = today.year;
    let month = today.month - 1;
    const draw = () => {
      const current = zonedParts(new Date());
      document.getElementById('calendar-month').textContent = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));
      days.replaceChildren();
      const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
      const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      for (let i = 0; i < offset + total; i++) {
        const cell = document.createElement('span');
        if (i >= offset) {
          const day = i - offset + 1;
          cell.textContent = String(day);
          if (year === current.year && month === current.month - 1 && day === current.day) {
            cell.className = 'is-today';
            cell.setAttribute('aria-label', `${words.today || 'Today'} ${day}`);
          }
        } else cell.setAttribute('aria-hidden', 'true');
        days.append(cell);
      }
    };
    const change = amount => {
      const date = new Date(Date.UTC(year, month + amount, 1));
      year = date.getUTCFullYear(); month = date.getUTCMonth(); draw();
    };
    document.getElementById('month-prev').addEventListener('click', () => change(-1));
    document.getElementById('month-next').addEventListener('click', () => change(1));
    document.getElementById('calendar-today').addEventListener('click', () => {
      const current = zonedParts(new Date()); year = current.year; month = current.month - 1; draw();
    });
    draw();
  }
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
  // Umami 统计数据
  const statsVisitors = document.getElementById('stats-visitors');
  const statsToday = document.getElementById('stats-today');
  const statsPageviews = document.getElementById('stats-pageviews');
  const statsStatus = document.getElementById('stats-status');
  if (statsVisitors) {
    const UMAMI = {
      base: 'https://umami777.macro.wang',
      website: '9c2dab11-97da-492f-aee4-f86c948b83e6',
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3ZWJzaXRlSWQiOiI5YzJkYWIxMS05N2RhLTQ5MmYtYWVlNC1mODZjOTQ4YjgzZTYiLCJpYXQiOjE3OTE1MzI5MTB9.SPEuDfv6LV6Dc9TW28Dnk2rBCXhgxluH7t6qQkQJ0fE'
    };
    const formatN = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
    // Umami v2 API 的 startAt/endAt 是毫秒；全历史用 0，今日用站点时区的当天零点
    const fetchStats = (startMs) =>
      fetch(`${UMAMI.base}/api/websites/${UMAMI.website}/stats?startAt=${startMs}&endAt=${Date.now()}`, {
        headers: { 'x-umami-share-token': UMAMI.token }
      }).then(r => r.ok ? r.json() : null).catch(() => null);
    const p = zonedParts(new Date());
    const zoneOffset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Date.now();
    const todayStart = Date.UTC(p.year, p.month - 1, p.day) - zoneOffset;
    Promise.all([fetchStats(0), fetchStats(todayStart)])
      .then(([total, today]) => {
        if (!total && !today) {
          if (statsStatus) statsStatus.textContent = words.stats_failed || '统计暂不可用';
          return;
        }
        if (statsVisitors) statsVisitors.textContent = formatN(total?.visitors?.value ?? 0);
        if (statsToday) statsToday.textContent = formatN(today?.visitors?.value ?? 0);
        if (statsPageviews) statsPageviews.textContent = formatN(total?.pageviews?.value ?? 0);
        if (statsStatus) statsStatus.textContent = '';
      })
      .catch(() => { if (statsStatus) statsStatus.textContent = words.stats_failed || '统计暂不可用'; });
  }
})();
