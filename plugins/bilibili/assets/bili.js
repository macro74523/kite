// 把正文里被转义的 B 站 iframe 嵌入代码替换成极简播放器
// 使用 B 站移动版嵌入页（html5mobileplayer）并按参数关掉标题、UP 主头像昵称、
// 关注按钮、弹幕、播放量等信息，只保留封面、播放按钮与播放/进度/音量/全屏控件。
// 播放器按视频真实比例自适应（通过 B 站 API JSONP 获取分辨率，带本地缓存）
// enhance(root) 既能跑在真实 DOM（会真正创建 iframe 并加载），也能跑在
// DOMParser 生成的虚拟文档（只做占位替换，避免把带 src 但永远不触发 load 的
// iframe 泄漏到真实 DOM，导致 opacity:0 的黑块）。
(function () {
  var urlRe = /(?:https?:)?\/\/player\.bilibili\.com\/player\.html\?[^"<\s]+/i;
  var bvidRe = /[?&]bvid=([A-Za-z0-9]+)/i;
  var CACHE_KEY = 'bili-video-dims';
  var MOBILE_PLAYER = 'https://www.bilibili.com/blackboard/html5mobileplayer.html';

  // 强制把 B 站播放器 URL 升级到 https。
  // https 主站嵌入 http iframe 会被浏览器当成 Mixed Content 直接拦截
  // （不同浏览器/扩展策略不同，所以用户体感是"有概率播放不了"）。
  function upgradeHttps(u) {
    if (!u || typeof u !== 'string') return u;
    return u.replace(/^(?:https?:)?\/\//i, 'https://');
  }

  // 把 PC 版嵌入地址换成移动版极简嵌入页。
  // 移动版默认只有封面 + 播放按钮 + 进度/时间/音量/全屏，没有 UP 主信息、
  // 关注、进入哔哩哔哩、观看更高清、弹幕等入口；再用参数把封面统计和
  // 弹幕输入框一并关掉。
  function toCleanPlayerUrl(u) {
    try {
      var src = new URL(u);
      if (!/^(?:player|www)\.bilibili\.com$/i.test(src.hostname)) return u;
      if (/html5mobileplayer/i.test(src.pathname)) return src.href;
      var out = new URL(MOBILE_PLAYER);
      ['aid', 'bvid', 'cid', 'seasonId', 'episodeId', 'epid', 't', 'quality'].forEach(function (k) {
        if (src.searchParams.has(k)) out.searchParams.set(k, src.searchParams.get(k));
      });
      var p = src.searchParams.get('p') || src.searchParams.get('page');
      if (p) out.searchParams.set('p', p);

      // 注意：移动版对 autoplay / noFullScreenButton 只判断参数是否存在，
      // 即使传 0 也会被当成开启，所以这两个参数一律不传。
      out.searchParams.set('danmaku', '0');           // 关闭弹幕与弹幕开关
      out.searchParams.set('hideDanmakuButton', '1'); // 隐藏弹幕输入/发送入口
      out.searchParams.set('hideCoverInfo', '1');     // 隐藏播放量、弹幕数、发布日期
      out.searchParams.set('posterFirst', '1');       // 先出封面，避免黑屏
      out.searchParams.set('high_quality', '1');      // 已登录用户自动用高清档
      return out.toString();
    } catch (e) { return u; }
  }

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

  // B 站播放器自带的原生 logo SVG（原样搬用，不改颜色、不加额外样式），
  // 只去掉点击行为，避免误触跳转。
  var LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" data-pointer="none" viewBox="0 0 50 24">' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M46.31 20.511c-.222 0-.413.018-.6-.003-.378-.044-.756-.036-1.135-.047-.244-.007-.237-.007-.258-.245-.06-.728-.126-1.454-.192-2.182-.056-.638-.11-1.277-.172-1.915-.056-.585-.124-1.168-.185-1.752-.058-.549-.112-1.099-.173-1.647-.076-.69-.157-1.38-.238-2.069-.073-.609-.145-1.22-.227-1.827a524.91 524.91 0 0 0-.39-2.829 84.298 84.298 0 0 0-.492-3c-.033-.18-.028-.186.141-.215.705-.121 1.414-.225 2.132-.209.077.002.156.004.233.014.126.016.192.077.198.225.025.516.06 1.031.099 1.546.06.845.125 1.688.188 2.531.04.543.074 1.085.114 1.627l.199 2.61c.04.533.075 1.067.115 1.599.063.781.13 1.562.193 2.343.04.497.075.995.117 1.492.062.736.13 1.472.192 2.208.05.576.093 1.152.142 1.745ZM19.005 2.58c.103 0 .259-.012.413.002.196.018.234.07.245.268.057.906.11 1.813.17 2.72.065.978.137 1.955.209 2.932.066.897.133 1.794.204 2.69.078.986.163 1.97.242 2.956.06.755.11 1.51.171 2.265.059.7.127 1.4.19 2.101.053.603.107 1.206.159 1.81.016.19.003.203-.201.198-.535-.013-1.068-.076-1.603-.061-.122.003-.158-.053-.178-.17-.045-.255-.037-.515-.065-.772-.073-.681-.115-1.366-.177-2.05-.056-.62-.123-1.24-.186-1.86-.056-.566-.112-1.133-.172-1.7-.06-.557-.123-1.114-.186-1.671-.058-.513-.114-1.026-.175-1.538-.091-.752-.18-1.503-.279-2.253-.09-.688-.193-1.374-.29-2.06a81.123 81.123 0 0 0-.441-2.794c-.038-.21-.077-.42-.119-.63-.02-.105-.002-.166.118-.182.315-.043.63-.109.945-.14.317-.03.633-.09 1.006-.062ZM41.41 11.635c.602 0 .617.005.713.551.12.674.202 1.355.281 2.035.083.725.167 1.45.245 2.175.062.584.114 1.17.172 1.753.061.612.126 1.223.19 1.833.034.346.067.691.106 1.036.012.1-.018.153-.116.165-.205.023-.41.05-.615.073-.377.04-.753.08-1.13.116-.195.018-.208.007-.244-.182-.33-1.72-.662-3.44-.99-5.16-.218-1.145-.43-2.29-.644-3.434a18.17 18.17 0 0 1-.08-.473c-.014-.091.01-.15.112-.173.68-.16 1.366-.284 2-.315ZM16.087 11.635c.645 0 .642.002.741.592.154.913.263 1.831.361 2.752.096.893.2 1.786.293 2.68.063.61.113 1.223.172 1.834.043.434.093.867.138 1.3.006.054.009.107.012.16.009.213 0 .23-.203.251-.403.043-.806.078-1.209.118-.146.015-.29.036-.436.05-.192.018-.198.018-.236-.178-.136-.69-.266-1.38-.4-2.069-.317-1.659-.638-3.316-.954-4.976-.126-.664-.235-1.33-.359-1.994-.022-.122-.005-.178.12-.208.673-.157 1.35-.28 1.96-.312ZM24.597 18.592v2.785c0 .027-.003.054 0 .08.014.135-.036.195-.174.19-.181-.008-.362-.003-.544.001-.379.008-.758-.007-1.137.036-.21.024-.205.011-.225-.211-.062-.701-.13-1.402-.194-2.103-.058-.647-.11-1.296-.17-1.943-.061-.665-.129-1.33-.19-1.994-.042-.444-.079-.887-.116-1.331-.049-.578-.094-1.155-.144-1.732-.021-.243-.003-.278.236-.303.619-.066 1.239-.09 1.86-.058.154.008.309.04.459.076.188.045.21.073.219.272.02.4.041.802.052 1.203.011.446.002.892.018 1.338.042 1.231.035 2.463.05 3.694ZM49.869 18.718v2.637c0 .045-.002.09 0 .134.01.116-.043.157-.153.156-.267-.002-.535 0-.802.004-.302.003-.604.001-.905.034-.2.023-.2.009-.218-.19-.082-.913-.168-1.827-.25-2.74-.076-.843-.146-1.687-.223-2.53-.079-.869-.165-1.737-.243-2.606-.039-.435-.07-.87-.103-1.306-.013-.19.008-.223.22-.241.37-.03.737-.08 1.109-.073.37.007.741-.013 1.11.058.311.06.327.078.346.414.053.989.037 1.98.072 2.97.037 1.053.012 2.106.04 3.28ZM40.78 6.85c.219.013.39.002.562.04.109.025.163.075.174.193.052.567.107 1.134.163 1.701.045.46.093.92.139 1.381l.004.027c.037.29.029.298-.251.314-.25.014-.498.036-.748.051-.163.01-.216.038-.243-.203-.093-.849-.201-1.695-.304-2.544-.03-.238-.06-.476-.096-.713-.02-.135.032-.209.156-.22.164-.015.328-.02.445-.027ZM15.54 6.854c.168.01.34-.003.51.036.097.023.147.064.156.175.021.266.061.53.087.796.079.816.154 1.632.228 2.447.015.178.012.182-.153.193-.292.022-.584.044-.877.056-.17.008-.192-.013-.213-.188-.075-.601-.145-1.202-.216-1.803-.058-.495-.106-.992-.176-1.485-.02-.137.025-.174.133-.197.171-.035.344-.023.52-.03ZM24.429 9.1v1.549c0 .231-.004.233-.232.23a7.146 7.146 0 0 1-.824-.043c-.177-.022-.18-.017-.185-.205-.018-.632-.037-1.263-.049-1.894-.01-.428-.014-.854-.04-1.281-.013-.22-.001-.223.208-.226.31-.003.62.01.927.058.186.03.194.03.195.236v1.575ZM49.714 9.112c0 .517.002 1.033 0 1.55 0 .216-.004.218-.22.217a11.515 11.515 0 0 1-.849-.04c-.14-.011-.182-.07-.172-.2.002-.017 0-.035 0-.053-.022-.997-.043-1.993-.063-2.99 0-.053-.003-.107-.002-.16.003-.201.004-.206.204-.205.276 0 .55.016.825.043.335.034.276.076.277.342.002.499.001.998 0 1.496ZM14.848 10.325c.007.284.007.283-.262.349-.184.045-.367.094-.55.136-.158.035-.186.015-.213-.14-.188-1.058-.376-2.115-.562-3.173-.038-.22-.028-.233.186-.271.263-.047.525-.093.788-.134.168-.026.19-.017.223.169.066.375.129.752.178 1.13.076.6.139 1.2.207 1.8.004.045.003.09.005.134ZM38.547 7.256c.344-.057.69-.115 1.038-.17.124-.02.162.06.178.172.06.414.134.825.182 1.239.072.6.169 1.197.188 1.803.001.062 0 .126.002.187.003.097-.044.146-.133.167-.235.053-.47.106-.704.163-.112.027-.15-.02-.169-.132-.07-.42-.152-.84-.224-1.259-.121-.69-.24-1.382-.358-2.074-.004-.025 0-.052 0-.096ZM22.72 9.682c-.01.367.012.688-.037 1.009-.015.101-.045.167-.152.176-.232.019-.464.038-.695.062-.112.012-.144-.037-.162-.148-.052-.327-.043-.657-.075-.986-.058-.62-.084-1.243-.124-1.866-.01-.15-.025-.302-.037-.453-.006-.084.027-.132.117-.135.3-.013.6-.068.902-.057.177.007.192.018.205.198.007.124.006.25.009.375l.05 1.825Z"/>' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M47.995 9.325c0 .428.005.856-.001 1.284-.004.223-.029.242-.237.262-.207.02-.412.035-.618.057-.116.012-.17-.022-.177-.157-.03-.569-.071-1.137-.11-1.706-.031-.47-.066-.942-.098-1.412-.004-.053-.001-.107-.005-.16-.005-.095.024-.15.129-.154.292-.01.582-.067.876-.056.18.007.182.01.196.198.044.614.048 1.229.045 1.844Z"/>' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="m6.867 20.718-.528-3.963c1.311.4 2.531.892 3.746 1.42-.198.322-2.703 2.294-3.218 2.543Zm7.118-3.741a3.001 3.001 0 0 0-.377-.366 6.631 6.631 0 0 0-1.31-.802 14.565 14.565 0 0 0-2.912-1.007c-1.146-.273-2.304-.436-3.482-.434a8.377 8.377 0 0 0-1.132.095c-.19.025-.205.01-.221-.16-.086-.886-.178-1.772-.254-2.659a99.149 99.149 0 0 1-.204-2.717 110.867 110.867 0 0 1-.156-3.447c-.034-1.311-.018-2.623-.002-3.935 0-.098.005-.196.014-.293C3.984.887 3.97.52 3.98.153 3.984.012 3.95-.018 3.807.01c-.203.038-.4.105-.592.186-1.03.433-2.057.872-3.088 1.303-.108.045-.145.095-.12.218.196.922.369 1.85.528 2.779.196 1.14.374 2.282.541 3.426.102.696.201 1.392.294 2.088.097.724.187 1.447.275 2.172.079.654.15 1.31.224 1.963.081.708.165 1.415.239 2.123.064.602.114 1.206.172 1.809.08.833.167 1.665.241 2.499.063.719.112 1.438.17 2.157.016.201.044.234.234.241.224.008.449.002.674.002.31.002.619-.013.929-.03a22.88 22.88 0 0 0 3.022-.393 13.762 13.762 0 0 0 3.978-1.392c.729-.393 1.415-.855 1.983-1.482.338-.375.618-.793.74-1.3.121-.507.103-.992-.266-1.401Z"/>' +
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M35.31 18.305a4.186 4.186 0 0 1-.408.368c-.84.697-1.722 1.337-2.597 1.985-.034.025-.064.06-.141.043l-.52-3.894c.108-.05.195.008.278.034.964.305 1.904.679 2.84 1.064.174.072.346.157.519.237.087.04.094.093.03.163Zm3.77-1.544a5.655 5.655 0 0 0-1.05-.729c-.836-.455-1.72-.779-2.628-1.04a15.53 15.53 0 0 0-4.104-.625 7.927 7.927 0 0 0-1.185.092c-.223.03-.234.029-.262-.2a38.512 38.512 0 0 1-.13-1.25c-.07-.762-.145-1.524-.2-2.288a130.731 130.731 0 0 1-.207-3.174c-.04-.802-.082-1.604-.074-2.407.002-.17-.005-.34-.013-.509a20.701 20.701 0 0 1-.005-2.007c.038-.82-.005-1.641.07-2.46.012-.15-.023-.174-.163-.16-.157.017-.303.077-.447.132-1.105.41-2.165.932-3.26 1.363-.112.045-.148.106-.11.22.015.051.02.106.03.158.248 1.183.46 2.375.649 3.57.134.843.27 1.686.396 2.531.096.651.184 1.305.27 1.957a275.223 275.223 0 0 1 .468 3.789c.064.54.12 1.08.177 1.62.062.576.128 1.15.185 1.726.062.612.114 1.225.171 1.836.064.665.13 1.33.19 1.995.055.63.108 1.26.154 1.89.01.144.079.183.2.183h.618c.53.033 1.003-.018 1.474-.06a25.49 25.49 0 0 0 2.482-.348c1.505-.284 2.937-.777 4.28-1.536.685-.386 1.319-.848 1.84-1.457.326-.379.569-.801.676-1.305.13-.61-.036-1.104-.492-1.507Z"/>' +
    '</svg>';

  function addLogo(box) {
    var logo = document.createElement('span');
    logo.className = 'bili-logo';
    logo.setAttribute('aria-hidden', 'true');
    logo.innerHTML = LOGO_SVG;
    box.appendChild(logo);
  }

  function createFrame(url, box) {
    addLogo(box);
    var frame = document.createElement('iframe');
    frame.src = url;
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('allow', 'fullscreen; autoplay; encrypted-media; picture-in-picture');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
    box.appendChild(frame);

    // iframe 完全加载之前保持透明，避免中间态暴露。
    // 但如果 4 秒内都没触发 load，强制 reload 一次；再不行就放弃锁，
    // 显示黑色背景（B站播放器本身带加载画面）让用户知道这里是播放器。
    var readyFired = false;
    frame.addEventListener('load', function () {
      readyFired = true;
      box.classList.add('is-ready');
    });
    setTimeout(function () {
      if (readyFired) return;
      try { frame.src = frame.src; } catch (_) {}
      setTimeout(function () {
        if (!box.classList.contains('is-ready')) box.classList.add('is-ready');
      }, 2000);
    }, 4000);
  }

  function enhanceOne(el, virtual, doc) {
    var text = el.textContent || '';
    if (text.indexOf('iframe') === -1) return;

    // 优先从 <a> 标签拿干净 URL
    var a = el.querySelector('a[href*="player.bilibili.com"]');
    var url = a ? upgradeHttps(a.href) : null;

    // 兜底：从文本里提取
    if (!url) {
      var m = text.match(urlRe);
      if (m) url = upgradeHttps(m[0]);
    }
    if (!url) return;

    url = toCleanPlayerUrl(url);

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

    createFrame(url, box);
    el.parentNode.replaceChild(box, el);

    // 按视频真实分辨率调整播放器比例
    var bv = (url.match(bvidRe) || [])[1];
    if (bv) loadDims(bv, function (d) { applyDims(box, d); });
  }

  // enhance(root)：可复用入口，root 为限定范围（默认全文档）；
  // 动态注入的内容（如底部弹窗正文）注入后需再调用一次。
  function enhance(root) {
    var virtual = isVirtualDoc(root);
    var doc = root && root.ownerDocument ? root.ownerDocument : (root || document);
    (root || document).querySelectorAll('.content p, .content div').forEach(function (el) {
      if (el.classList.contains('bili-player')) return;
      enhanceOne(el, virtual, doc);
    });

    // 如果调用方给的 root 里有之前虚拟文档留下来的占位盒子（带 data-bili-url
    // 但没有 iframe），这里补上 iframe + 挂 load 监听。真实 DOM 里才这么做。
    if (!virtual) {
      (root || document).querySelectorAll('.bili-player[data-bili-url]').forEach(function (box) {
        if (box.querySelector('iframe')) { box.removeAttribute('data-bili-url'); return; }
        var url = box.dataset.biliUrl;
        box.removeAttribute('data-bili-url');
        createFrame(url, box);
        var bv = (url.match(bvidRe) || [])[1];
        if (bv) loadDims(bv, function (d) { applyDims(box, d); });
      });
    }
  }

  // 对构建阶段已生成的 .bili-player 也加上 ready 状态控制
  // 同时把服务端可能硬编码的 http://player.bilibili.com src 升级到 https
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.bili-player iframe').forEach(function (frame) {
      var box = frame.parentElement;
      if (!box || !box.classList.contains('bili-player')) return;
      var clean = toCleanPlayerUrl(upgradeHttps(frame.src));
      if (clean !== frame.src) frame.src = clean;
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
