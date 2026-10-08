package api_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/kite-plus/kite/internal/api"
	"github.com/kite-plus/kite/internal/publish"
	gitpub "github.com/kite-plus/kite/internal/publish/git"
)

// What a connect is refused for here it is refused for before asking
// GitHub anything; the rest of a connect is tested in internal/publish/git
// against a GitHub of its own.
func TestGitHubIsReportedWithoutItsToken(t *testing.T) {
	t.Setenv(gitpub.TokenEnv, "")
	root := newRepoProject(t, 1)
	git(t, root, "remote", "add", "origin", "git@github.com:octocat/site.git")
	h, _ := newWritableServer(t, root)

	state := get[publish.GitHubState](t, h, api.Prefix+"/github", http.StatusOK)
	if state.Token != "" || state.Repo != "octocat/site" || state.Remote != "origin" ||
		!strings.Contains(state.NewTokenURL, "target_name=octocat") {
		t.Errorf("state = %+v", state)
	}

	t.Setenv(gitpub.TokenEnv, "from-the-environment")
	rec := send(t, h, http.MethodGet, api.Prefix+"/github", nil, nil)
	if body := rec.Body.String(); rec.Code != http.StatusOK || !strings.Contains(body, `"token":"environment"`) ||
		strings.Contains(body, "from-the-environment") {
		t.Errorf("GET /github: %d\n%s", rec.Code, body)
	}
}

func TestAConnectWithoutWhatItNeedsIsRefused(t *testing.T) {
	t.Setenv(gitpub.TokenEnv, "")
	root := newRepoProject(t, 1)
	h, _ := newWritableServer(t, root)

	if rec := send(t, h, http.MethodPut, api.Prefix+"/github", publish.GitHubRequest{}, nil); rec.Code != http.StatusBadRequest ||
		!strings.Contains(rec.Body.String(), `"field":"repo"`) {
		t.Errorf("no repository: %d\n%s", rec.Code, rec.Body.String())
	}
	for repo, code := range map[string]string{
		"not a repository": publish.CodeGitHubRepo,
		"octocat/site":     publish.CodeGitHubToken,
	} {
		rec := send(t, h, http.MethodPut, api.Prefix+"/github", publish.GitHubRequest{Repo: repo, Pages: true}, nil)
		refused := decode[api.PublishRefused](t, rec)
		if rec.Code != http.StatusConflict || refused.Problem == nil || refused.Problem.Code != code {
			t.Errorf("%q: %d %+v, want %s", repo, rec.Code, refused.Problem, code)
		}
	}
}

// A read-only server publishes nothing, so it has nothing to connect, as it
// has nothing to push.
func TestAReadOnlyServerCannotConnect(t *testing.T) {
	root := newRepoProject(t, 1)
	h, _ := newServer(t, root)
	for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete} {
		rec := send(t, h, method, api.Prefix+"/github", publish.GitHubRequest{Repo: "octocat/site", Token: "x"}, nil)
		if rec.Code != http.StatusNotImplemented {
			t.Errorf("%s /github: %d\n%s", method, rec.Code, rec.Body.String())
		}
	}
}
