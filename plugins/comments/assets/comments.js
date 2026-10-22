// Puts a comment thread on the page, with the service the site's settings
// name. Kite writes the settings into window.KiteComments before this runs.
// Dynamic hosts (bottom-sheet previews) call window.KiteCommentsInit(at, cfg)
// with a cfg carrying the article's `pathname` for per-article threads.
(function () {
  "use strict";

  var WALINE = "3.15.2";
  var TWIKOO = "2.0.9";

  var cdns = {
    jsdelivr: function (pkg, version, file) {
      return "https://cdn.jsdelivr.net/npm/" + pkg + "@" + version + "/" + file;
    },
    unpkg: function (pkg, version, file) {
      return "https://unpkg.com/" + pkg + "@" + version + "/" + file;
    },
    npmmirror: function (pkg, version, file) {
      return "https://registry.npmmirror.com/" + pkg + "/" + version + "/files/" + file;
    },
  };

  var local = /^(localhost|127(\.\d+){3}|\[::1\])$/.test(location.hostname);

  // Sheet previews re-init threads per article; skip re-fetching libs.
  var fetched = {};
  function script(src, then) {
    if (fetched[src]) { fetched[src].then(then); return; }
    var el = document.createElement("script");
    fetched[src] = new Promise(function (res) {
      el.onload = res;
      el.onerror = res;
    });
    el.src = src;
    document.head.appendChild(el);
    fetched[src].then(then);
  }

  function stylesheet(href) {
    if (fetched[href]) return;
    fetched[href] = Promise.resolve();
    var el = document.createElement("link");
    el.rel = "stylesheet";
    el.href = href;
    document.head.appendChild(el);
  }

  // Themes mark a dark page in different ways; the system's choice counts
  // when the page says nothing.
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function dark() {
    var root = document.documentElement;
    var said = root.getAttribute("data-theme") || root.getAttribute("data-color-scheme");
    if (said === "dark" || root.classList.contains("dark")) return true;
    if (said === "light" || root.classList.contains("light")) return false;
    return media.matches;
  }
  function onDarkChange(then) {
    var was = dark();
    function check() {
      var now = dark();
      if (now !== was) then((was = now));
    }
    new MutationObserver(check).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-color-scheme", "class"],
    });
    media.addEventListener("change", check);
  }

  // The thread goes where the theme marks, or at the end of the main content.
  function place() {
    var at = document.querySelector("[data-kite-comments]");
    if (at) return at;
    at = document.createElement("section");
    at.className = "kite-comments";
    at.style.marginTop = "3rem";
    var article = document.querySelector("article");
    var main = document.querySelector("main");
    if (main && (!article || main.contains(article))) main.appendChild(at);
    else if (article) article.insertAdjacentElement("afterend", at);
    else document.body.appendChild(at);
    return at;
  }

  // missing says, on a preview only, which settings a service still needs:
  // a reader has no use for the note.
  function missing(at, keys, config) {
    if (!local) return;
    var zh = /^zh/i.test((config && config.lang) || "");
    var labels = zh
      ? { repo: "仓库", repo_id: "仓库 ID", category_id: "分类 ID", server: "服务端地址", env: "环境" }
      : { repo: "Repository", repo_id: "Repository ID", category_id: "Category ID", server: "Server address", env: "Environment" };
    var names = keys.map(function (key) {
      return labels[key];
    });
    var note = document.createElement("p");
    note.style.cssText = "padding:1rem;border:1px dashed currentColor;opacity:.6;font-size:.9em";
    note.textContent = zh
      ? "评论区还不能显示：请在评论插件的设置中填写" + names.join("、") + "。"
      : "The comments cannot show yet: fill in " + names.join(", ") + " in the plugin's settings.";
    at.appendChild(note);
  }

  function giscusLang(lang) {
    lang = (lang || "en").toLowerCase();
    if (/^zh-(tw|hk|mo|hant)/.test(lang)) return "zh-TW";
    if (/^zh/.test(lang)) return "zh-CN";
    return lang.split("-")[0];
  }

  function giscus(at, config, cdn) {
    var settings = config.settings || {};
    if (!settings.repo || !settings.repo_id || !settings.category_id) {
      return missing(at, ["repo", "repo_id", "category_id"], config);
    }
    var byID = !settings.mapping || settings.mapping === "id";
    var data = {
      repo: settings.repo,
      "repo-id": settings.repo_id,
      category: settings.category,
      "category-id": settings.category_id,
      mapping: byID ? "specific" : settings.mapping,
      term: byID ? config.page : "",
      strict: "0",
      "reactions-enabled": "1",
      "emit-metadata": "0",
      "input-position": "top",
      theme: dark() ? "dark" : "light",
      lang: giscusLang(config.lang),
      loading: "lazy",
    };
    var box = document.createElement("div");
    box.className = "giscus";
    at.appendChild(box);
    var el = document.createElement("script");
    el.src = "https://giscus.app/client.js";
    el.async = true;
    el.crossOrigin = "anonymous";
    for (var key in data) if (data[key]) el.setAttribute("data-" + key, data[key]);
    at.appendChild(el);
    onDarkChange(function (isDark) {
      var frame = at.querySelector("iframe.giscus-frame");
      if (!frame) return;
      frame.contentWindow.postMessage(
        { giscus: { setConfig: { theme: isDark ? "dark" : "light" } } },
        "https://giscus.app"
      );
    });
  }

  function waline(at, config, cdn) {
    var settings = config.settings || {};
    if (!settings.server) return missing(at, ["server"], config);
    // Waline turns dark while a selector matches, so the page's state is
    // kept in a class of its own.
    var root = document.documentElement;
    root.classList.toggle("kite-comments-dark", dark());
    onDarkChange(function (isDark) {
      root.classList.toggle("kite-comments-dark", isDark);
    });
    var box = document.createElement("div");
    at.appendChild(box);
    stylesheet(cdn("@waline/client", WALINE, "dist/waline.css"));
    script(cdn("@waline/client", WALINE, "dist/waline.umd.js"), function () {
      window.Waline.init({
        el: box,
        serverURL: settings.server,
        path: config.pathname || location.pathname,
        lang: config.lang || "en",
        dark: "html.kite-comments-dark",
      });
    });
  }

  function twikoo(at, config, cdn) {
    var settings = config.settings || {};
    if (!settings.env) return missing(at, ["env"], config);
    var box = document.createElement("div");
    box.id = "kite-twikoo";
    at.appendChild(box);
    script(cdn("twikoo", TWIKOO, "dist/twikoo.min.js"), function () {
      window.twikoo.init({
        envId: settings.env,
        el: "#kite-twikoo",
        path: location.pathname,
        lang: config.lang || "en",
      });
    });
  }

  // init(at, cfg): render a thread into `at`. cfg falls back to the
  // page-injected window.KiteComments; sheet hosts pass one with the
  // article's `pathname` so the thread maps to the previewed article.
  function init(at, cfg) {
    var config = cfg || window.KiteComments;
    if (!at || !config) return;
    var settings = config.settings || {};
    var cdn = cdns[settings.cdn] || cdns.jsdelivr;
    var services = { giscus: giscus, waline: waline, twikoo: twikoo };
    (services[settings.provider] || giscus)(at, config, cdn);
  }

  window.KiteCommentsInit = init;

  if (window.KiteComments) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { init(place()); });
    } else init(place());
  }
})();
