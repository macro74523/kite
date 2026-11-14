//go:build wasip1

package main

import (
	"github.com/extism/go-pdk"
)

func main() {}

//go:wasmexport transform_html
func transformHTML() int32 {
	var in struct {
		HTML string `json:"html"`
	}
	if err := pdk.InputJSON(&in); err != nil {
		pdk.SetError(err)
		return 1
	}
	if err := pdk.OutputJSON(map[string]string{"html": embedLinks(in.HTML)}); err != nil {
		pdk.SetError(err)
		return 1
	}
	return 0
}
