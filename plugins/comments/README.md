<p align="center">
  <img src="docs/icon.svg" alt="" width="84" height="84">
</p>

<h1 align="center">Comments</h1>

<p align="center">
  A comment thread under every post of your Kite site.
</p>

<p align="center">
  <a href="https://github.com/kite-plus/plugin-comments/actions/workflows/ci.yml"><img src="https://github.com/kite-plus/plugin-comments/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/kite-plus/plugin-comments/releases/latest"><img src="https://img.shields.io/github/v/release/kite-plus/plugin-comments?sort=semver&color=4A77D6" alt="Latest release"></a>
  <a href="https://github.com/kite-plus/kite"><img src="https://img.shields.io/badge/Kite-%E2%89%A5%200.1-4A77D6?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGcgZmlsbD0iI2ZmZiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjUiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xMCAxNC41IEwyNyAyMSBMMjcgMzAgTDEwIDIzLjUgWiIvPjxwYXRoIGQ9Ik0xMCAzMiBMMjcgMzguNSBMMjcgNDkgTDEwIDQyLjUgWiIvPjxwYXRoIGQ9Ik0zNyAyMSBMNTQgMTQuNSBMNTQgNDIuNSBMMzcgNDkgWiIvPjwvZz48L3N2Zz4=" alt="Kite 0.1 or later"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache License 2.0"></a>
</p>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="docs/screenshot.webp" alt="A Waline comment thread under a post, in light and dark mode" width="880">
</p>

Comments is an official plugin for [Kite](https://github.com/kite-plus/kite).
Pick a comment service in the studio and every post gets a thread, placed after
the post and styled to match the page.

<p>
  <img src="https://img.shields.io/badge/Giscus-181717?logo=github&logoColor=white" alt="Giscus">
  <img src="https://img.shields.io/badge/Waline-2E8B57" alt="Waline">
  <img src="https://img.shields.io/badge/Twikoo-1E90FF" alt="Twikoo">
</p>

## Features

- **Three services.** [Giscus](https://giscus.app) keeps the comments in the
  Discussions of a GitHub repository; [Waline](https://waline.js.org) and
  [Twikoo](https://twikoo.js.org) run on a server of your own, or on Tencent
  CloudBase for Twikoo.
- **Threads that survive a new address.** With Giscus, a post is matched to its
  discussion by its id, so renaming a post or moving the site keeps its
  comments.
- **Dark when the page is.** The thread follows the page into dark mode and
  back, whether the theme follows the system or has a switch of its own.
- **Where a reader expects it.** At the end of the post, after the links to the
  posts around it, or wherever your theme marks.
- **Up to each post.** `comments: false` in a post's front matter leaves its
  thread out; pages can have one too.
- **Quick to load in mainland China.** Waline and Twikoo load from jsDelivr,
  unpkg or npmmirror, as you choose.

## Install

1. Download `comments-<version>.zip` from the
   [latest release](https://github.com/kite-plus/plugin-comments/releases/latest).
2. In Kite's studio, open **Plugins**, drop the zip on **Upload plugin**, and
   switch it on.

Or from the command line, inside your site:

```sh
kite plugin add comments-0.1.0.zip
kite plugin enable comments
```

It needs Kite 0.1 or later.

## Settings

Under **Plugins → Comments → Settings**, the form shows only what the chosen
service needs. A preview at `localhost` says which settings are still missing
where the thread would be.

| Setting | Service | What it is |
|---|---|---|
| Service | | Giscus, Waline or Twikoo |
| Repository, Repository ID, Discussion category, Category ID | Giscus | Copy them from [giscus.app](https://giscus.app) once the repository and category are chosen there |
| Match a post to its discussion by | Giscus | The post's id (the default), the path of its address, its whole address, or its title |
| Server address | Waline | Where your Waline server runs |
| Environment | Twikoo | Your Twikoo server's address, or its environment ID on Tencent CloudBase |
| Under pages too | | Also puts a thread under pages such as About |
| Load scripts from | Waline, Twikoo | jsDelivr, unpkg or npmmirror |

## For theme authors

The thread goes at the end of the page's `<main>`. To put it somewhere else,
mark the spot:

```html
<div data-kite-comments></div>
```

## Releasing

Set `version` in `plugin.yaml`, commit, and push a tag of the same version,
such as `v0.1.0`. The release workflow packs `dist/comments-<version>.zip`
and attaches it to a GitHub release. `make zip` packs the same file locally,
and `kite plugin verify .` checks the plugin the way a site will.

## More official plugins

| Plugin | What it adds |
|---|---|
| [Analytics](https://github.com/kite-plus/plugin-analytics) | Visit counts with Baidu Tongji, Google Analytics, Umami or Plausible |
| [Math and Diagrams](https://github.com/kite-plus/plugin-math) | TeX math with KaTeX, and mermaid code blocks drawn as diagrams |
| [Search](https://github.com/kite-plus/plugin-search) | Search in the reader's browser, with nothing to run |

## License

[Apache License 2.0](LICENSE).
