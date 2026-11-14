package main

import (
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strings"
)

type video struct {
	id   string
	page string
}

var (
	videoPath = regexp.MustCompile(`(?i)^/video/(BV[[:alnum:]]+|av[0-9]+)/?$`)
	bvid      = regexp.MustCompile(`(?i)^BV[[:alnum:]]+$`)
	positive  = regexp.MustCompile(`^[1-9][0-9]*$`)
	paragraph = regexp.MustCompile(`(?is)<p>\s*<a\s+([^>]*)>(.*?)</a>\s*</p>`)
	hrefAttr  = regexp.MustCompile(`(?i)(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))`)
)

// videoLink is the one, canonical address an author keeps in Markdown.
func videoLink(raw string) string {
	v, ok := parseVideo(raw)
	if !ok {
		return ""
	}
	link := "https://www.bilibili.com/video/" + v.id + "/"
	if v.page != "" {
		link += "?p=" + v.page
	}
	return link
}

func parseVideo(raw string) (video, bool) {
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "//") {
		raw = "https:" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil {
		return video{}, false
	}

	var v video
	host := strings.ToLower(u.Hostname())
	// 嵌入页链接：PC player.html 与移动版 blackboard/html5mobileplayer.html
	// 都直接从 query 里取 bvid/aid。
	isPlayer := (host == "player.bilibili.com" && (u.Path == "/player.html" || u.Path == "/html5mobileplayer.html")) ||
		(host == "www.bilibili.com" && u.Path == "/blackboard/html5mobileplayer.html")
	if isPlayer {
		query := u.Query()
		switch {
		case bvid.MatchString(query.Get("bvid")):
			v.id = query.Get("bvid")
		case positive.MatchString(query.Get("aid")):
			v.id = "av" + query.Get("aid")
		default:
			return video{}, false
		}
	} else {
		switch host {
		case "www.bilibili.com", "m.bilibili.com", "bilibili.com":
			match := videoPath.FindStringSubmatch(u.Path)
			if match == nil {
				return video{}, false
			}
			v.id = match[1]
		default:
			return video{}, false
		}
	}

	page := u.Query().Get("p")
	if page == "" {
		page = u.Query().Get("page")
	}
	if positive.MatchString(page) {
		v.page = page
	}
	return v, true
}

func player(v video) string {
	parameter := "aid=" + strings.TrimPrefix(strings.ToLower(v.id), "av")
	ratioID := ""
	if bvid.MatchString(v.id) {
		parameter = "bvid=" + v.id
		ratioID = v.id
	}

	// 16:9 只是兜底。竖屏自适应由 bili.js 按文章封面的真实尺寸改写，
	// 封面地址在文章 frontmatter 里，插件因此不需要请求 Bilibili 接口，
	// 构建时也就不依赖 wasm 沙箱的网络白名单。
	style := "aspect-ratio: 16 / 9;"

	// 移动版嵌入页才能隐藏 B 站原生封面信息（头像、昵称、关注、标题）和弹幕
	// 按钮，呈现站点重做的简洁播放器外观。注意正确地址是 www.bilibili.com
	// 的 /blackboard/html5mobileplayer.html；player.bilibili.com 下的同名
	// 页面已下线，对所有视频都返回 404。
	src := "https://www.bilibili.com/blackboard/html5mobileplayer.html?" + parameter + "&autoplay=0&high_quality=1&danmaku=0&hideCoverInfo=1&hideDanmakuButton=1&posterFirst=1"
	if v.page != "" {
		src += "&p=" + v.page
	}
	// is-ready makes the server-rendered preview visible without waiting for
	// bili.js; the ratio is refined there from the article cover.
	return fmt.Sprintf(`<div class="bili-player is-ready" data-bvid="%s" data-p="%s" style="%s"><iframe src="%s" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms" scrolling="no" frameborder="no" referrerpolicy="no-referrer-when-downgrade"></iframe>%s</div>`,
		html.EscapeString(ratioID), html.EscapeString(v.page), html.EscapeString(style), html.EscapeString(src), logoSVG)
}

// embedLinks changes only a paragraph whose link and its text are the same
// video address. A titled link or a video mentioned in a sentence stays a link.
func embedLinks(document string) string {
	return paragraph.ReplaceAllStringFunc(document, func(block string) string {
		match := paragraph.FindStringSubmatch(block)
		href := hrefAttr.FindStringSubmatch(match[1])
		if href == nil {
			return block
		}
		address := href[1] + href[2] + href[3]
		text := strings.TrimSpace(html.UnescapeString(match[2]))
		link := videoLink(text)
		if link == "" || link != videoLink(html.UnescapeString(address)) {
			return block
		}
		v, _ := parseVideo(link)
		return player(v)
	})
}
