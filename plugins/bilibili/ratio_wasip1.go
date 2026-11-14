//go:build wasip1

package main

import (
	"encoding/json"
	"strings"

	"github.com/extism/go-pdk"
)

var ratioCache = map[string][2]int{}

type biliDimResponse struct {
	Code int `json:"code"`
	Data struct {
		Dimension struct {
			Width  int `json:"width"`
			Height int `json:"height"`
			Rotate int `json:"rotate"`
		} `json:"dimension"`
	} `json:"data"`
}

// ratioFor asks Bilibili for a video's real dimensions. The host only lets the
// plugin reach api.bilibili.com, so a failed lookup stays a graceful fallback.
func ratioFor(id string) (int, int) {
	if cached, ok := ratioCache[id]; ok {
		return cached[0], cached[1]
	}

	param := "bvid=" + id
	if strings.HasPrefix(strings.ToLower(id), "av") {
		param = "aid=" + strings.TrimPrefix(strings.ToLower(id), "av")
	}

	req := pdk.NewHTTPRequest(pdk.MethodGet, "https://api.bilibili.com/x/web-interface/view?"+param)
	req.SetHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0 Safari/537.36")
	req.SetHeader("Referer", "https://www.bilibili.com/")
	res := req.Send()
	if res.Status() != 200 {
		return 0, 0
	}

	var resp biliDimResponse
	if err := json.Unmarshal(res.Body(), &resp); err != nil || resp.Code != 0 {
		return 0, 0
	}

	w, h := resp.Data.Dimension.Width, resp.Data.Dimension.Height
	if resp.Data.Dimension.Rotate == 90 || resp.Data.Dimension.Rotate == 270 {
		w, h = h, w
	}
	ratioCache[id] = [2]int{w, h}
	return w, h
}
