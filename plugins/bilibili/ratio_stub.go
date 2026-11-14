//go:build !wasip1

package main

// ratioFor is unavailable outside the WebAssembly build, where tests run the
// pure parser and do not reach Bilibili.
func ratioFor(id string) (int, int) {
	return 0, 0
}
