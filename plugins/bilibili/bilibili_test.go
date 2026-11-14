package main

import (
	"strings"
	"testing"
)

func TestVideoLink(t *testing.T) {
	tests := map[string]string{
		"https://www.bilibili.com/video/BV1smWE64E1a/":                           "https://www.bilibili.com/video/BV1smWE64E1a/",
		"https://m.bilibili.com/video/BV1smWE64E1a?spm_id_from=333&p=2":          "https://www.bilibili.com/video/BV1smWE64E1a/?p=2",
		"https://www.bilibili.com/video/av170001/?p=3":                           "https://www.bilibili.com/video/av170001/?p=3",
		"//player.bilibili.com/player.html?isOutside=true&bvid=BV1smWE64E1a&p=1": "https://www.bilibili.com/video/BV1smWE64E1a/?p=1",
		"https://player.bilibili.com/player.html?aid=170001&page=4":              "https://www.bilibili.com/video/av170001/?p=4",
		"https://player.bilibili.com/html5mobileplayer.html?bvid=BV1smWE64E1a":   "https://www.bilibili.com/video/BV1smWE64E1a/",
		"https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid=BV1smWE64E1a&p=2": "https://www.bilibili.com/video/BV1smWE64E1a/?p=2",
		"https://example.com/video/BV1smWE64E1a/":                                "",
		"https://www.bilibili.com/video/BV1smWE64E1a.evil/":                      "",
		"javascript:alert(1)": "",
	}
	for input, want := range tests {
		if got := videoLink(input); got != want {
			t.Errorf("videoLink(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestEmbedLinks(t *testing.T) {
	document := `<html><body><p><a href="https://www.bilibili.com/video/BV1smWE64E1a/?p=2">https://www.bilibili.com/video/BV1smWE64E1a/?p=2</a></p><p><a href="https://www.bilibili.com/video/BV1smWE64E1a/">A video</a></p><p>See <a href="https://www.bilibili.com/video/BV1smWE64E1a/">https://www.bilibili.com/video/BV1smWE64E1a/</a>.</p></body></html>`
	out := embedLinks(document)
	if !strings.Contains(out, `data-bvid="BV1smWE64E1a" data-p="2"`) {
		t.Fatalf("standalone video link was not embedded: %s", out)
	}
	if !strings.Contains(out, `src="https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid=BV1smWE64E1a&amp;autoplay=0&amp;high_quality=1&amp;danmaku=0&amp;hideCoverInfo=1&amp;hideDanmakuButton=1&amp;posterFirst=1&amp;p=2"`) {
		t.Fatalf("player did not retain the page: %s", out)
	}
	if !strings.Contains(out, `class="bili-logo"`) {
		t.Fatal("native bilibili logo missing from server-rendered player")
	}
	if !strings.Contains(out, `>A video</a>`) || !strings.Contains(out, `<p>See <a`) {
		t.Fatalf("ordinary links were changed: %s", out)
	}
	if got := embedLinks(out); got != out {
		t.Fatal("embedding is not idempotent")
	}
}
