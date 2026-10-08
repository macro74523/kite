package git

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestCredentialsComeAfterTheEnvironmentsOwn(t *testing.T) {
	got := credentials("https://github.com/", "t0ken", []string{"PATH=/bin", "GIT_CONFIG_COUNT=2"})
	basic := base64.StdEncoding.EncodeToString([]byte("x-access-token:t0ken"))
	want := []string{
		"GIT_CONFIG_COUNT=3",
		"GIT_CONFIG_KEY_2=http.https://github.com/.extraheader",
		"GIT_CONFIG_VALUE_2=AUTHORIZATION: basic " + basic,
	}
	if !slices.Equal(got, want) {
		t.Errorf("credentials = %q\nwant %q", got, want)
	}
}

// Git reads the token from its environment, and nothing is written down.
func TestATokenReachesGitAsConfigurationAlone(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	t.Setenv("GIT_CONFIG_GLOBAL", "/dev/null")
	t.Setenv("GIT_CONFIG_SYSTEM", "/dev/null")
	root := t.TempDir()
	if out, err := exec.Command("git", "init", "-q", root).CombinedOutput(); err != nil {
		t.Fatalf("git init: %v\n%s", err, out)
	}
	r := runner{root: root, host: GitHubHost, token: func() string { return "t0ken" }}
	got, err := r.read(t.Context(), "config", "--get", "http.https://github.com/.extraheader")
	if err != nil {
		t.Fatal(err)
	}
	if want := "AUTHORIZATION: basic " + base64.StdEncoding.EncodeToString([]byte("x-access-token:t0ken")); got != want {
		t.Errorf("extraheader = %q, want %q", got, want)
	}
	config, err := os.ReadFile(filepath.Join(root, ".git", "config"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(config), "extraheader") {
		t.Errorf("the header was written to .git/config:\n%s", config)
	}

	none := runner{root: root, host: GitHubHost, token: func() string { return "" }}
	if got, _ := none.read(t.Context(), "config", "--get", "http.https://github.com/.extraheader"); got != "" {
		t.Errorf("without a token, extraheader = %q", got)
	}
}

func TestParseRepoReadsWhatAnAuthorTypes(t *testing.T) {
	for in, want := range map[string]string{
		"octocat/site":                        "octocat/site",
		" octocat/site/ ":                     "octocat/site",
		"https://github.com/octocat/site":     "octocat/site",
		"https://github.com/octocat/site.git": "octocat/site",
		"git@github.com:octocat/site.git":     "octocat/site",
		"ssh://git@github.com/octocat/site":   "octocat/site",
		"octocat/my.site":                     "octocat/my.site",
		"octocat":                             "",
		"octocat/site/extra":                  "",
		"../site":                             "",
		"octocat/..":                          "",
		"https://gitlab.com/octocat/site.git": "",
		"-octocat/site":                       "",
	} {
		got, ok := parseRepo(in, GitHubHost)
		if got != want || ok != (want != "") {
			t.Errorf("parseRepo(%q) = %q, %v; want %q", in, got, ok, want)
		}
	}
}

func TestTheNewTokenFormAsksForWhatConnectingNeeds(t *testing.T) {
	got := newTokenURL("octocat/site")
	for _, want := range []string{
		"https://github.com/settings/personal-access-tokens/new?",
		"contents=write", "workflows=write", "pages=write", "expires_in=365",
		"target_name=octocat", "name=Kite+octocat%2Fsite",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("%s lacks %s", got, want)
		}
	}
	if strings.Contains(newTokenURL(""), "target_name") {
		t.Error("an unknown owner was named")
	}
}

func TestDeployChecksCarryTheTokenWhenThereIsOne(t *testing.T) {
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Header.Get("Authorization"))
		_, _ = w.Write([]byte(`[]`))
	}))
	defer srv.Close()

	var v []any
	with := newDeployChecker(srv.URL, time.Now, func() string { return "t0ken" })
	if _, err := with.get(t.Context(), "/repos/a/b/deployments", &v); err != nil {
		t.Fatal(err)
	}
	without := newDeployChecker(srv.URL, time.Now, nil)
	if _, err := without.get(t.Context(), "/repos/a/b/deployments", &v); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(seen, []string{"Bearer t0ken", ""}) {
		t.Errorf("Authorization = %q", seen)
	}
}
