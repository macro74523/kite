# 连接 GitHub

> 状态：已实现 · 最近更新：2026-10-08 · 跟踪：[kite-plus/kite#15](https://github.com/kite-plus/kite/issues/15)
> 上级文档：[architecture.md](architecture.md) §16.4、§17 · 相关：[roadmap.md](roadmap.md) M4

---

## 0. 结论

- **作者给一个只限一个仓库的细粒度 token，Kite 替他做完剩下的事。** 在后台「部署」页或 `kite github connect owner/name` 填一次：设好 `origin`、第一次提交、推送、开启 Pages（来源 GitHub Actions），以后每次发布照常推送。2026-10-08 用户定：用细粒度 token，不做 GitHub App 和设备码登录，也不替作者建仓库。
- **token 只放两处：环境变量 `KITE_GITHUB_TOKEN`，或 `.kite/secrets/github.json`（0600）。** 前者优先，给容器和 CI 用；后者是后台填写时存的。`kite.yaml` 里永远没有它，后台也从不回显。
- **只用在两件事上：向 github.com 的 HTTPS 推送，和调 GitHub API。** 推送时通过 git 的环境变量配置给 `https://github.com/` 加一个认证头，不写进 git 配置文件，也不出现在命令行参数里；SSH 的 remote 照旧走作者自己的 SSH。
- **没有连接的站点和以前完全一样**：作者自己的 credential helper 和 SSH agent 照旧，GitHub API 照旧匿名只读。
- architecture.md §16.4「凭据：根本不要碰」和 §17「不做任何需要凭据的 API 集成」相应改写（§6）。

## 1. 为什么

一个新站点现在要做五件 Kite 帮不上忙的事：在 GitHub 建仓库、`git init` 并第一次提交、`git remote add`、配好推送凭据、在 Settings → Pages 把来源改成 GitHub Actions。「部署」页只能把这几条命令列出来让作者去终端里敲。

部署在服务器上的 Kite（Docker）更难：容器里没有 SSH key 也没有 credential helper，入口用 `kite init --workflow=false` 建站，没有 `deploy.yml`、不是 git 仓库，git 也没有提交身份，第一次发布就会失败。architecture.md 的 P0 用户「不想碰终端和 git」，场景 S1 承诺「除了第一次启动不用终端」，在这两条上都没做到。

## 2. 方案

### 2.1 token

细粒度 token，只选这一个仓库，权限：

| 权限 | 用途 |
|---|---|
| Contents：读写 | 推送 |
| Workflows：读写 | 推送 `.github/workflows/` 下的文件；没有它 GitHub 会拒绝第一次推送 |
| Pages：读写 | 开启 Pages、把来源改成 GitHub Actions |
| Metadata：只读 | GitHub 自动附带 |

「部署」页给一个[模板链接](https://github.blog/changelog/2025-08-26-template-urls-for-fine-grained-pats-and-updated-permissions-ui)，打开就是填好名称、说明、三项权限和一年有效期的新建页面；仓库要作者自己在 Only select repositories 里选。

### 2.2 存储

`.kite/secrets/github.json`，和账号文件同一个目录、同样的写法（0700 目录、0600 文件、先写临时文件再改名）：

```json
{"version": 1, "token": "github_pat_…", "login": "octocat", "id": 583231,
 "name": "The Octocat", "updated_at": "2026-10-08T12:00:00Z"}
```

`login`、`id`、`name` 来自连接时的 `GET /user`，用于显示和提交身份。`KITE_GITHUB_TOKEN` 有值时用它，文件里的 token 不用；用环境变量的 token 连接时，文件只存账号信息。断开连接删除整个文件；环境变量里的 token 只能在环境里去掉。

### 2.3 推送

有 token 时，Kite 运行的每条 git 命令多带几项环境变量配置（`GIT_CONFIG_COUNT`、`GIT_CONFIG_KEY_n`、`GIT_CONFIG_VALUE_n`，git 2.31 起支持；排在作者自己设过的项后面）：

```
http.https://github.com/.extraheader = AUTHORIZATION: basic base64("x-access-token:<token>")
```

这个头只发给 `https://github.com/` 下的地址，和 actions/checkout 的做法相同。`GIT_TERMINAL_PROMPT=0` 和指向不存在路径的 `GIT_ASKPASS` 照旧，所以 token 不对时仍然立刻报错，不会挂住。

### 2.4 提交身份

git 没有配置 `user.email` 时（容器里就是这样），连接过的站点用 GitHub 给账号的 noreply 地址提交：`<id>+<login>@users.noreply.github.com`，名字用 `name`，没有就用 `login`。只在会产生提交的命令上加 `GIT_AUTHOR_*` / `GIT_COMMITTER_*`；作者配置过的身份一律不动。提交在 GitHub 上记在这个账号名下，也不暴露邮箱。

### 2.5 连接的步骤

`PUT /api/v1/github` 和 `kite github connect` 做同一件事，在发布锁里按顺序进行，前三步只读，任何一步不通过就什么都不改：

1. `GET /user`：token 有效，取账号信息。`401` 报 `github_token`。
2. `GET /repos/{owner}/{name}`：token 看得到这个仓库。`404` 报 `github_repo`（仓库不存在，或 token 没选它）。
3. 本地还没有提交时，远端仓库必须是空的（`GET /repos/{repo}/commits` 答 `409`），否则报 `github_not_empty`：两份毫不相干的历史推不上去，要么换一个空仓库，要么把那个仓库 clone 下来再在里面运行 Kite。
4. `origin`：没有就加 `https://github.com/{owner}/{name}.git`；已经指向这个仓库（HTTPS 或 SSH）就留着；指向别处报 `remote_elsewhere`，不替作者改。
5. 保存 token。
6. 用 Pages 发布时（默认），没有 `deploy.yml` 就写入 `deploy.yml` 和 `scheduled.yml`，和 `kite init` 写的一样。站点由 Vercel、Cloudflare 等部署时关掉这一项。
7. 提交：本地还不是仓库就 `git init -b main`；没有提交就把站点自己的文件（`kite.yaml`、`kite.lock`、`content`、`static`、`layouts`、`themes`、`plugins`、`.gitignore`、`kitew`、`kitew.ps1`、`.github`）提交为「Start the site」，不用 `git add .`，容器里 `HOME` 就是站点目录，`~/.ssh` 之类不能被带进去；已有提交只提交新写入的工作流。
8. 开启 Pages：`GET /repos/{repo}/pages`，没有就 `POST`，来源不是 Actions 就 `PUT`，`build_type: workflow`。空仓库上 GitHub 不肯时，推送之后再试一次。失败不算连接失败，报警告 `github_pages`，附 GitHub 的原话（比如私有仓库在免费账户上不能用 Pages），作者可以去 Settings 里手动开。
9. 推送当前分支到 `origin`，设好 upstream。

返回做了哪些步骤和警告，「部署」页逐条列出来。

### 2.6 部署检查

有 token 时，查询部署的请求带 `Authorization: Bearer`：私有仓库也查得到，额度从每小时 60 次变成 5,000 次。节奏不变（每分钟最多一次）。

## 3. 安全

- 权限只到一个仓库的三项，泄露的后果限于这个仓库的内容、工作流和 Pages 设置，作者可以在 GitHub 上随时撤销。
- token 不出服务器：API 只回答「来自环境 / 已保存 / 没有」和账号名；日志、错误信息、提交和 git 配置里都没有它。git 失败时的输出也不会包含它：认证头不出现在 git 的错误信息里。
- 存储和账号文件同等对待：`.kite/` 在每个 Kite 创建的项目里都被忽略，文件只有属主可读。
- 已有的 credential helper、SSH 配置和提交身份都优先于 Kite 的这一套，连接只填补空缺。

## 4. 失败时说什么

| 情况 | 代码 | 说法 |
|---|---|---|
| token 无效、过期或被撤销 | `github_token` | 重新生成一个，再连接一次 |
| token 看不到仓库 | `github_repo` | 确认仓库存在，并且新建 token 时选了它 |
| 远端已有提交，本地还没有 | `github_not_empty` | 用空仓库，或 clone 那个仓库后在里面运行 Kite |
| `origin` 指向别的仓库 | `remote_elsewhere` | 连接那个仓库，或先在终端里改掉 `origin` |
| 站点在另一个仓库的子目录里 | `remote_elsewhere` | 在终端里连接那个仓库，或者把站点挪到自己的文件夹 |
| HEAD 不在分支上 | `detached_head` | 切回站点发布用的分支 |
| 连不上 GitHub | `github_unreachable` | 检查网络 |
| 推送被拒（403） | `no_credentials` | token 缺 Contents 或 Workflows 的写权限 |
| Pages 没能开启 | 警告 `github_pages` | GitHub 的原话，加手动开启的位置 |

## 5. 接口

- `GET /api/v1/github`：`{"token": "saved" | "environment" | "", "login", "repo", "remote", "new_token_url"}`，`repo` 是 `origin` 在 GitHub 上的仓库。
- `PUT /api/v1/github`：`{"repo": "owner/name 或地址", "token": "可省略，用环境变量里的", "pages": true}`，返回同上，加 `done`（做过的步骤：`init`、`remote`、`workflow`、`commit`、`push`、`pages`）、`pages_url` 和 `warnings`；被拒时和发布一样答 `409`，`problem` 说明原因。不发布的服务器（只读的就是）答 `501`。
- `DELETE /api/v1/github`：删除保存的 token。
- 命令行：`kite github`（状态）、`kite github connect owner/name [--no-pages]`（token 读 `KITE_GITHUB_TOKEN`，没有就在终端里不回显地问）、`kite github disconnect`。

## 6. 和 architecture.md 的关系

§16.4 改为：作者自己的凭据仍然不碰；只有在作者连接 GitHub 后，才用他给的 token 向 github.com 推送，并且排在他自己的配置之后。§17 改为：没有连接时，唯一的 API 调用仍是匿名只读的部署查询；连接后，开启 Pages 和查询部署用作者的 token。仍然不做 GitHub 以外的托管平台的 API 集成，也不替作者建仓库。

## 7. 验收

- 一个由 `kite init --workflow=false` 建的、不是 git 仓库的站点（就是容器里的样子），在后台填好仓库和 token 后：成了仓库，有 `origin`，第一次提交只含站点自己的文件，提交身份是 GitHub 的 noreply 地址，推送成功，Pages 来源是 GitHub Actions。由测试用假的 GitHub API 和本地裸仓库覆盖。
- token 无效、仓库看不到、远端非空、`origin` 指向别处，都不改动任何文件。
- 推送命令的参数、git 配置文件和错误信息里都没有 token；作者自己设过的 `GIT_CONFIG_*` 不被覆盖。
- 部署检查在有 token 时带认证头，没有时和以前一样匿名。
- 断开后不再带 token；环境变量里的 token 断不开，并说明原因。
