<p align="center">
  <img src="docs/icon.svg" alt="" width="84" height="84">
</p>

<h1 align="center">Analytics</h1>

<p align="center">
  Count your Kite site's visits with the service you already use.
</p>

<p align="center">
  <a href="https://github.com/kite-plus/plugin-analytics/actions/workflows/ci.yml"><img src="https://github.com/kite-plus/plugin-analytics/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/kite-plus/plugin-analytics/releases/latest"><img src="https://img.shields.io/github/v/release/kite-plus/plugin-analytics?sort=semver&color=4A77D6" alt="Latest release"></a>
  <a href="https://github.com/kite-plus/kite"><img src="https://img.shields.io/badge/Kite-%E2%89%A5%200.1-4A77D6?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGcgZmlsbD0iI2ZmZiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMCAxNC41IEwyNyAyMSBMMjcgMzAgTDEwIDIzLjUgWiIvPjxwYXRoIGQ9Ik0xMCAzMiBMMjcgMzguNSBMMjcgNDkgTDEwIDQyLjUgWiIvPjxwYXRoIGQ9Ik0zNyAyMSBMNTQgMTQuNSBMNTQgNDIuNSBMMzcgNDkgWiIvPjwvZz48L3N2Zz4=" alt="Kite 0.1 or later"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache License 2.0"></a>
</p>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="docs/screenshot.webp" alt="The Plugins screen of Kite's studio, and the Analytics settings in dark mode" width="880">
</p>

Analytics is an official plugin for [Kite](https://github.com/kite-plus/kite).
Choose a service in the studio, paste in the ID it gave you, and every page of
the site is counted.

<p>
  <img src="https://img.shields.io/badge/Baidu%20Tongji-2932E1?logo=baidu&logoColor=white" alt="Baidu Tongji">
  <img src="https://img.shields.io/badge/Google%20Analytics-E37400?logo=googleanalytics&logoColor=white" alt="Google Analytics">
  <img src="https://img.shields.io/badge/Umami-000000?logo=umami&logoColor=white" alt="Umami">
  <img src="https://img.shields.io/badge/Plausible-5850EC?logo=plausibleanalytics&logoColor=white" alt="Plausible">
</p>

## Features

- **Four services, one list.** Baidu Tongji, Google Analytics, Umami and
  Plausible, the cloud ones or Umami and Plausible on your own server.
- **Your previews stay out of the numbers.** A preview at `localhost` is not
  counted unless you ask for it.
- **Says what it loads.** Before the plugin is turned on, the studio names the
  sites your visitors' browsers will load from.
- **Nothing added to a build.** It only adds a snippet to your pages, so a
  build takes as long as it did.

## Install

1. Download `analytics-<version>.zip` from the
   [latest release](https://github.com/kite-plus/plugin-analytics/releases/latest).
2. In Kite's studio, open **Plugins**, drop the zip on **Upload plugin**, and
   switch it on.

Or from the command line, inside your site:

```sh
kite plugin add analytics-0.1.0.zip
kite plugin enable analytics
```

It needs Kite 0.1 or later.

## Settings

Under **Plugins → Analytics → Settings**, the form shows only what the chosen
service needs.

| Setting | Service | What it is |
|---|---|---|
| Service | | Baidu Tongji, Google Analytics, Umami or Plausible |
| Site code | Baidu Tongji | The code after `hm.js?` in the snippet Baidu Tongji gives you |
| Measurement ID | Google Analytics | `G-XXXXXXXXXX`, the ID of the site's web stream |
| Website ID | Umami | Shown in the website's tracking code |
| Script address | Umami | Where your own Umami serves `script.js`; empty for Umami Cloud |
| Domain | Plausible | The domain the site is added under; empty for the one it is visited at |
| Script address | Plausible | Where your own Plausible serves its script; empty for plausible.io |
| Count previews | | Also counts visits to a preview at `localhost`; off by default |

## Releasing

Set `version` in `plugin.yaml`, commit, and push a tag of the same version,
such as `v0.1.0`. The release workflow packs `dist/analytics-<version>.zip`
and attaches it to a GitHub release. `make zip` packs the same file locally,
and `kite plugin verify .` checks the plugin the way a site will.

## More official plugins

| Plugin | What it adds |
|---|---|
| [Comments](https://github.com/kite-plus/plugin-comments) | A comment thread under every post, with Giscus, Waline or Twikoo |
| [Math and Diagrams](https://github.com/kite-plus/plugin-math) | TeX math with KaTeX, and mermaid code blocks drawn as diagrams |
| [Search](https://github.com/kite-plus/plugin-search) | Search in the reader's browser, with nothing to run |

## License

[Apache License 2.0](LICENSE).
