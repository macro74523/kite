// 把正文里被转义的 B 站 iframe 嵌入代码替换成响应式播放器
// 播放器按视频真实比例自适应（通过 B 站 API JSONP 获取分辨率，带本地缓存）
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
      // 竖屏视频：限制高度，居中显示
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

  // enhance(root)：可复用入口，root 为限定范围（默认全文档）；
  // 动态注入的内容（如底部弹窗正文）注入后需再调用一次。
  function enhance(root) {
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

      var box = document.createElement('div');
      box.className = 'bili-player';
      var frame = document.createElement('iframe');
      frame.src = url;
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
      box.appendChild(frame);
      el.parentNode.replaceChild(box, el);

      // 按视频真实分辨率调整播放器比例
      var bv = (url.match(bvidRe) || [])[1];
      if (bv) loadDims(bv, function (d) { applyDims(box, d); });
    });
  }

  window.biliEnhance = enhance;
  enhance(document);
})();
