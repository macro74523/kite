// 把正文里被转义的 B 站 iframe 嵌入代码替换成响应式播放器
// 播放器按视频真实比例自适应（通过 B 站 API JSONP 获取分辨率，带本地缓存）
// enhance(root) 既能跑在真实 DOM（会真正创建 iframe 并加载），也能跑在
// DOMParser 生成的虚拟文档（只做占位替换，避免把带 src 但永远不触发 load 的
// iframe 泄漏到真实 DOM，导致 opacity:0 的黑块）。
(function () {
  var urlRe = /(?:https?:)?\/\/player\.bilibili\.com\/player\.html\?[^"<\s]+/i;
  var bvidRe = /[?&]bvid=([A-Za-z0-9]+)/i;
  var CACHE_KEY = 'bili-video-dims';

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {}
  }

  function applyDims(box, d) {
    if (!d || !d.w || !d.h) return;
    var w = d.w, h = d.h;
    if (d.r === 90 || d.r === 270) { var t = w; w = h; h = t; }
    var ratio = w / h;
    if (ratio < 0.5 || ratio > 2.6) return;
    box.style.paddingTop = '0';
    box.style.aspectRatio = w + ' / ' + h;
    if (h > w) {
      box.style.maxWidth = 'calc(78vh * ' + (w / h).toFixed(4) + ')';
      box.style.marginLeft = 'auto';
      box.style.marginRight = 'auto';
    }
  }

  function once(fn) {
    var done = false;
    return function (v) { if (!done) { done = true; fn(v); } };
  }

  function loadDims(bvid, cb) {
    var cache = readCache();
    if (cache[bvid]) { cb(cache[bvid]); return; }
    var fin = once(cb);
    var fn = '__biliDim' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var s = document.createElement('script');
    window[fn] = function (res) {
      var d = null;
      if (res && res.data && res.data.dimension && res.data.dimension.width) {
        d = { w: res.data.dimension.width, h: res.data.dimension.height, r: res.data.dimension.rotate || 0 };
        cache[bvid] = d;
        writeCache(cache);
      }
      fin(d);
      delete window[fn];
      s.remove();
    };
    s.src = 'https://api.bilibili.com/x/web-interface/view?bvid=' + bvid + '&jsonp=jsonp&callback=' + fn;
    s.onerror = function () { fin(null); delete window[fn]; s.remove(); };
    document.head.appendChild(s);
    setTimeout(function () { fin(null); }, 6000);
  }

  // 判断 root 是否来自 DOMParser 虚拟文档（没有 defaultView，也就没有 window）
  function isVirtualDoc(root) {
    try {
      var d = (root && root.ownerDocument) || (root && root.nodeType === 9 ? root : null);
      return !!(d && d.defaultView == null);
    } catch (e) { return false; }
  }

  // enhance(root)：可复用入口，root 为限定范围（默认全文档）；
  // 动态注入的内容（如底部弹窗正文）注入后需再调用一次。
  function enhance(root) {
    var virtual = isVirtualDoc(root);
    var doc = root && root.ownerDocument ? root.ownerDocument : (root || document);
    (root || document).querySelectorAll('.content p, .content div').forEach(function (el) {
      if (el.classList.contains('bili-player')) return;

      var text = el.textContent || '';
      if (text.indexOf('iframe') === -1) return;

      // 优先从 <a> 标签拿干净 URL
      var a = el.querySelector('a[href*="player.bilibili.com"]');
      var url = a ? a.href : null;

      // 兜底：从文本里提取
      if (!url) {
        var m = text.match(urlRe);
        if (m) url = m[0].startsWith('//') ? 'https:' + m[0] : m[0];
      }
      if (!url) return;

      // 追加画质参数：high_quality=1 让 B 站播放器优先 DASH 高画质档，
      // 对已登录（尤其是大会员）的读者自动生效；匿名态下 B 站 API 本身
      // 只返回低清晰度源，加了也不会坏。autoplay=0 避免某些浏览器策略下
      // 自动播放失败的闪烁。
      try {
        var u = new URL(url);
        if (!u.searchParams.has('high_quality')) u.searchParams.set('high_quality', '1');
        if (!u.searchParams.has('autoplay')) u.searchParams.set('autoplay', '0');
        url = u.toString();
      } catch (_) { /* URL 解析失败就原样用 */ }

      var box = doc.createElement('div');
      box.className = 'bili-player';

      if (virtual) {
        // 虚拟文档：只做占位，不创建 iframe。DOMParser 里给 iframe 设 src
        // 不会真的加载，但 appendChild 到真实 DOM 之后浏览器会加载它——
        // 那时 load 事件才会触发，此时加 opacity:0 反而会让播放器永远不显示。
        // 所以这里只留盒子结构，src 放到真实 DOM 里再设。
        box.dataset.biliUrl = url;
        el.parentNode.replaceChild(box, el);
        return;
      }

      var frame = document.createElement('iframe');
      frame.src = url;
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
      box.appendChild(frame);
      el.parentNode.replaceChild(box, el);

      // iframe 完全加载之前保持透明，避免中间态暴露。
      // 但如果 4 秒内都没触发 load，强制 reload 一次；再不行就放弃锁，
      // 显示黑色背景（B站播放器本身带 loading 画面）让用户知道这里是播放器。
      var readyFired = false;
      frame.addEventListener('load', function () {
        readyFired = true;
        box.classList.add('is-ready');
      });
      setTimeout(function () {
        if (readyFired) return;
        // 尝试 reload 一次（某些浏览器对 iframe 初始化加载有 race）
        try {
          frame.src = frame.src;
        } catch (_) {}
        // 2 秒后还是没 ready，强制解锁
        setTimeout(function () {
          if (!box.classList.contains('is-ready')) box.classList.add('is-ready');
        }, 2000);
      }, 4000);

      // 按视频真实分辨率调整播放器比例
      var bv = (url.match(bvidRe) || [])[1];
      if (bv) loadDims(bv, function (d) { applyDims(box, d); });
    });

    // 如果调用方给的 root 里有之前虚拟文档留下来的占位盒子（带 data-bili-url
    // 但没有 iframe），这里补上 iframe + 挂 load 监听。真实 DOM 里才这么做。
    if (!virtual) {
      (root || document).querySelectorAll('.bili-player[data-bili-url]').forEach(function (box) {
        if (box.querySelector('iframe')) { box.removeAttribute('data-bili-url'); return; }
        var url = box.dataset.biliUrl;
        var frame = document.createElement('iframe');
        frame.src = url;
        frame.setAttribute('allowfullscreen', '');
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
        box.appendChild(frame);
        box.removeAttribute('data-bili-url');
        var readyFired = false;
        frame.addEventListener('load', function () { readyFired = true; box.classList.add('is-ready'); });
        setTimeout(function () {
          if (readyFired) return;
          try { frame.src = frame.src; } catch (_) {}
          setTimeout(function () { if (!box.classList.contains('is-ready')) box.classList.add('is-ready'); }, 2000);
        }, 4000);
        var bv = (url.match(bvidRe) || [])[1];
        if (bv) loadDims(bv, function (d) { applyDims(box, d); });
      });
    }
  }

  // 对构建阶段已生成的 .bili-player 也加上 ready 状态控制
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.bili-player iframe').forEach(function (frame) {
      var box = frame.parentElement;
      if (!box || !box.classList.contains('bili-player')) return;
      if (frame.complete) { box.classList.add('is-ready'); return; }
      var readyFired = false;
      frame.addEventListener('load', function () { readyFired = true; box.classList.add('is-ready'); });
      setTimeout(function () {
        if (readyFired || box.classList.contains('is-ready')) return;
        try { frame.src = frame.src; } catch (_) {}
        setTimeout(function () { if (!box.classList.contains('is-ready')) box.classList.add('is-ready'); }, 2000);
      }, 4000);
    });
  });

  window.biliEnhance = enhance;
  enhance(document);
})();
