// 把正文里被转义的 B 站 iframe 嵌入代码替换成响应式播放器
(function () {
  var urlRe = /(?:https?:)?\/\/player\.bilibili\.com\/player\.html\?[^"<\s]+/i;

  document.querySelectorAll('.content p, .content div').forEach(function (el) {
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
  });
})();
