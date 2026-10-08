package git_test

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/kite-plus/kite/internal/publish"
	gitpub "github.com/kite-plus/kite/internal/publish/git"
)

// fakeAPI is GitHub's API as a connect sees it: one account, one repository.
type fakeAPI struct {
	mu    sync.Mutex
	token string
	repo  string
	empty bool
	// pages is the build type of the repository's Pages site, "" while it
	// is off, and refusePages the status creating one answers instead.
	pages       string
	refusePages int
	calls       []string
}

func (f *fakeAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, r.Method+" "+r.URL.Path)
	answer := func(status int, body string) {
		w.WriteHeader(status)
		_, _ = fmt.Fprint(w, body)
	}
	if r.Header.Get("Authorization") != "Bearer "+f.token {
		answer(http.StatusUnauthorized, `{"message":"Bad credentials"}`)
		return
	}
	var body struct {
		BuildType string `json:"build_type"`
	}
	switch path := r.URL.Path; {
	case path == "/user":
		answer(http.StatusOK, `{"login":"octocat","id":583231,"name":"The Octocat"}`)
	case path == "/repos/"+f.repo:
		answer(http.StatusOK, fmt.Sprintf(`{"full_name":%q}`, f.repo))
	case path == "/repos/"+f.repo+"/commits":
		if f.empty {
			answer(http.StatusConflict, `{"message":"Git Repository is empty."}`)
			return
		}
		answer(http.StatusOK, `[{"sha":"0123"}]`)
	case path == "/repos/"+f.repo+"/pages" && r.Method == http.MethodGet:
		if f.pages == "" {
			answer(http.StatusNotFound, `{"message":"Not Found"}`)
			return
		}
		answer(http.StatusOK, fmt.Sprintf(`{"build_type":%q,"html_url":"https://octocat.github.io/site/"}`, f.pages))
	case path == "/repos/"+f.repo+"/pages" && r.Method == http.MethodPost:
		if f.refusePages != 0 {
			answer(f.refusePages, `{"message":"Your current plan does not support GitHub Pages for this repository."}`)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.pages = body.BuildType
		answer(http.StatusCreated, fmt.Sprintf(`{"build_type":%q,"html_url":"https://octocat.github.io/site/"}`, f.pages))
	case path == "/repos/"+f.repo+"/pages" && r.Method == http.MethodPut:
		_ = json.NewDecoder(r.Body).Decode(&body)
		f.pages = body.BuildType
		answer(http.StatusNoContent, "")
	default:
		answer(http.StatusNotFound, `{"message":"Not Found"}`)
	}
}

// connection is a site, the GitHub it connects to, and where it pushes:
// host stands for https://github.com, and bare for octocat/site on it.
type connection struct {
	root   string
	api    *fakeAPI
	host   string
	bare   string
	pub    *gitpub.Publisher
	getenv map[string]string
}

// newConnection serves a fake GitHub for octocat/site, with an empty bare
// repository standing for it, and a site like the one a container makes:
// not a repository, with a home folder of its own inside it.
func newConnection(t *testing.T) *connection {
	t.Helper()
	if !gitpub.Available() {
		t.Skip("git is not installed")
	}
	hermetic(t)
	// Git takes an identity from these before its configuration, and a
	// container has none of them.
	for _, key := range []string{"EMAIL", "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"} {
		if value, ok := os.LookupEnv(key); ok {
			t.Setenv(key, value)
			_ = os.Unsetenv(key)
		}
	}

	api := &fakeAPI{token: "secret-token", repo: "octocat/site", empty: true}
	srv := httptest.NewServer(api)
	t.Cleanup(srv.Close)

	remotes := t.TempDir()
	bare := filepath.Join(remotes, "octocat", "site.git")
	run(t, remotes, "init", "-q", "--bare", "-b", "main", bare)

	root := t.TempDir()
	write(t, root, "kite.yaml", "site:\n  title: Test\n  baseURL: https://example.com\n")
	write(t, root, "content/posts/hello/index.md", "---\ntitle: Hello\n---\n\nbody\n")
	write(t, root, "static/logo.txt", "logo\n")
	write(t, root, ".gitignore", "/.kite/\n/public/\n")
	write(t, root, ".ssh/id_ed25519", "a key that must never be committed\n")
	write(t, root, "notes.txt", "the author's own file\n")
	// kite init makes these folders empty, and git has nothing to commit in
	// an empty folder.
	for _, empty := range []string{"layouts", "themes"} {
		if err := os.MkdirAll(filepath.Join(root, empty), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	c := &connection{root: root, api: api, host: "file://" + remotes, bare: bare, getenv: map[string]string{}}
	c.pub = gitpub.New(gitpub.Options{
		Root:       root,
		GitHubAPI:  srv.URL,
		GitHubHost: c.host,
		Getenv:     func(key string) string { return c.getenv[key] },
		Now:        func() time.Time { return time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC) },
	})
	return c
}

func (c *connection) connect(t *testing.T, req publish.GitHubRequest) (*publish.GitHubState, error) {
	t.Helper()
	if req.Repo == "" {
		req.Repo = "octocat/site"
	}
	return c.pub.ConnectGitHub(t.Context(), req)
}

func problemCode(err error) string {
	var p publish.Problem
	if errors.As(err, &p) {
		return p.Code
	}
	return ""
}

// The site a container makes is not a repository and has no workflow, no
// remote and no identity to commit with. Connecting does all of it, and the
// first commit holds the site's own files and nothing else in the folder.
func TestConnectingASiteThatIsNotARepositoryPushesIt(t *testing.T) {
	c := newConnection(t)
	state, err := c.connect(t, publish.GitHubRequest{Token: "secret-token", Pages: true})
	if err != nil {
		t.Fatalf("ConnectGitHub: %v", err)
	}
	want := []string{publish.GitHubInit, publish.GitHubRemote, publish.GitHubWorkflow, publish.GitHubCommit, publish.GitHubPush, publish.GitHubPages}
	if !slices.Equal(state.Done, want) || state.Token != publish.TokenSaved || state.Login != "octocat" ||
		state.Repo != "octocat/site" || state.PagesURL != "https://octocat.github.io/site/" || len(state.Warnings) > 0 {
		t.Fatalf("state = %+v, want done %v", state, want)
	}

	files := strings.Split(run(t, c.bare, "ls-tree", "-r", "--name-only", "main"), "\n")
	for _, f := range []string{".github/workflows/deploy.yml", ".github/workflows/scheduled.yml", ".gitignore",
		"content/posts/hello/index.md", "kite.yaml", "static/logo.txt"} {
		if !slices.Contains(files, f) {
			t.Errorf("the first commit lacks %s: %v", f, files)
		}
	}
	for _, f := range []string{".ssh/id_ed25519", "notes.txt"} {
		if slices.Contains(files, f) {
			t.Errorf("the first commit carries %s", f)
		}
	}
	if who := run(t, c.bare, "log", "-1", "--format=%an <%ae> %s", "main"); who != "The Octocat <583231+octocat@users.noreply.github.com> Start the site" {
		t.Errorf("first commit = %q", who)
	}
	if up := run(t, c.root, "rev-parse", "--abbrev-ref", "@{upstream}"); up != "origin/main" {
		t.Errorf("upstream = %q", up)
	}
	if c.api.pages != "workflow" {
		t.Errorf("Pages builds with %q", c.api.pages)
	}

	saved := filepath.Join(c.root, filepath.FromSlash(gitpub.TokenFile))
	info, err := os.Stat(saved)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("the token file is %v", info.Mode().Perm())
	}
	if dir, _ := os.Stat(filepath.Dir(saved)); dir.Mode().Perm() != 0o700 {
		t.Errorf("its folder is %v", dir.Mode().Perm())
	}
	config, err := os.ReadFile(filepath.Join(c.root, ".git", "config"))
	if err != nil {
		t.Fatal(err)
	}
	encoded := base64.StdEncoding.EncodeToString([]byte("x-access-token:secret-token"))
	if strings.Contains(string(config), "secret-token") || strings.Contains(string(config), encoded) {
		t.Errorf("the token reached .git/config:\n%s", config)
	}
	if got, _ := c.pub.GitHub(t.Context()); got.Token != publish.TokenSaved || got.Repo != "octocat/site" || got.Login != "octocat" {
		t.Errorf("GitHub = %+v", got)
	}
}

// Whatever a connect would have to refuse, it refuses before it changes a
// thing: no repository is started and no token is kept.
func TestAConnectThatCannotGoAheadChangesNothing(t *testing.T) {
	for _, tc := range []struct {
		name  string
		setup func(c *connection) publish.GitHubRequest
		want  string
	}{
		{"a token GitHub refuses", func(c *connection) publish.GitHubRequest {
			return publish.GitHubRequest{Token: "wrong"}
		}, publish.CodeGitHubToken},
		{"no token at all", func(c *connection) publish.GitHubRequest {
			return publish.GitHubRequest{}
		}, publish.CodeGitHubToken},
		{"a repository the token cannot see", func(c *connection) publish.GitHubRequest {
			return publish.GitHubRequest{Repo: "octocat/other", Token: "secret-token"}
		}, publish.CodeGitHubRepo},
		{"not a repository at all", func(c *connection) publish.GitHubRequest {
			return publish.GitHubRequest{Repo: "just-a-name", Token: "secret-token"}
		}, publish.CodeGitHubRepo},
		{"a repository with commits of its own", func(c *connection) publish.GitHubRequest {
			c.api.empty = false
			return publish.GitHubRequest{Token: "secret-token"}
		}, publish.CodeGitHubNotEmpty},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := newConnection(t)
			_, err := c.connect(t, tc.setup(c))
			if got := problemCode(err); got != tc.want {
				t.Fatalf("error = %v (%s), want %s", err, got, tc.want)
			}
			for _, left := range []string{".git", ".github", gitpub.TokenFile} {
				if _, err := os.Stat(filepath.Join(c.root, filepath.FromSlash(left))); err == nil {
					t.Errorf("%s was made", left)
				}
			}
		})
	}
}

func TestADetachedHeadIsRefused(t *testing.T) {
	c := newConnection(t)
	run(t, c.root, "init", "-q", "-b", "main")
	run(t, c.root, "config", "commit.gpgsign", "false")
	run(t, c.root, "add", "kite.yaml")
	run(t, c.root, "commit", "-q", "-m", "initial")
	run(t, c.root, "checkout", "-q", "--detach")
	if _, err := c.connect(t, publish.GitHubRequest{Token: "secret-token", Pages: true}); problemCode(err) != publish.CodeDetachedHead {
		t.Fatalf("error = %v, want %s", err, publish.CodeDetachedHead)
	}
	if _, err := os.Stat(filepath.Join(c.root, filepath.FromSlash(gitpub.TokenFile))); err == nil {
		t.Error("the token was kept")
	}
}

func TestAnOriginElsewhereIsLeftAlone(t *testing.T) {
	c := newConnection(t)
	run(t, c.root, "init", "-q", "-b", "main")
	run(t, c.root, "remote", "add", "origin", "https://github.com/someone/else.git")
	_, err := c.connect(t, publish.GitHubRequest{Token: "secret-token", Pages: true})
	if got := problemCode(err); got != publish.CodeRemoteElsewhere {
		t.Fatalf("error = %v, want %s", err, publish.CodeRemoteElsewhere)
	}
	if got := run(t, c.root, "remote", "get-url", "origin"); got != "https://github.com/someone/else.git" {
		t.Errorf("origin = %s", got)
	}
	if _, err := os.Stat(filepath.Join(c.root, filepath.FromSlash(gitpub.TokenFile))); err == nil {
		t.Error("the token was kept")
	}
}

// A site that is a repository already gets only the workflow it lacks, in a
// commit of its own, made by whoever the author configured.
func TestConnectingARepositoryCommitsOnlyTheWorkflow(t *testing.T) {
	c := newConnection(t)
	run(t, c.root, "init", "-q", "-b", "main")
	run(t, c.root, "config", "user.name", "Author")
	run(t, c.root, "config", "user.email", "author@example.com")
	run(t, c.root, "config", "commit.gpgsign", "false")
	run(t, c.root, "add", "kite.yaml", "content", ".gitignore")
	run(t, c.root, "commit", "-q", "-m", "initial")
	run(t, c.root, "remote", "add", "origin", c.host+"/octocat/site.git")
	c.api.empty = false
	c.api.pages = "legacy"

	state, err := c.connect(t, publish.GitHubRequest{Token: "secret-token", Pages: true})
	if err != nil {
		t.Fatalf("ConnectGitHub: %v", err)
	}
	want := []string{publish.GitHubWorkflow, publish.GitHubCommit, publish.GitHubPush, publish.GitHubPages}
	if !slices.Equal(state.Done, want) {
		t.Fatalf("done = %v, want %v", state.Done, want)
	}
	if got := run(t, c.bare, "log", "-1", "--format=%an <%ae> %s", "main"); got != "Author <author@example.com> Deploy with GitHub Pages" {
		t.Errorf("commit = %q", got)
	}
	changed := run(t, c.bare, "diff-tree", "--no-commit-id", "--name-only", "-r", "main")
	if changed != ".github/workflows/deploy.yml\n.github/workflows/scheduled.yml" {
		t.Errorf("the commit changed:\n%s", changed)
	}
	if c.api.pages != "workflow" {
		t.Errorf("Pages still builds with %q", c.api.pages)
	}
	if !slices.Contains(c.api.calls, "PUT /repos/octocat/site/pages") {
		t.Errorf("Pages was not switched: %v", c.api.calls)
	}
}

func TestPagesGitHubWillNotTurnOnIsAWarning(t *testing.T) {
	c := newConnection(t)
	c.api.refusePages = http.StatusUnprocessableEntity
	state, err := c.connect(t, publish.GitHubRequest{Token: "secret-token", Pages: true})
	if err != nil {
		t.Fatalf("ConnectGitHub: %v", err)
	}
	if slices.Contains(state.Done, publish.GitHubPages) || !slices.Contains(state.Done, publish.GitHubPush) {
		t.Errorf("done = %v", state.Done)
	}
	if len(state.Warnings) != 1 || state.Warnings[0].Code != publish.CodeGitHubPages ||
		!strings.Contains(state.Warnings[0].Detail, "does not support GitHub Pages") {
		t.Errorf("warnings = %+v", state.Warnings)
	}
}

func TestWithoutPagesNoWorkflowIsWritten(t *testing.T) {
	c := newConnection(t)
	state, err := c.connect(t, publish.GitHubRequest{Token: "secret-token"})
	if err != nil {
		t.Fatalf("ConnectGitHub: %v", err)
	}
	if slices.Contains(state.Done, publish.GitHubWorkflow) || slices.Contains(state.Done, publish.GitHubPages) {
		t.Errorf("done = %v", state.Done)
	}
	if _, err := os.Stat(filepath.Join(c.root, ".github")); err == nil {
		t.Error("a workflow was written")
	}
	if slices.ContainsFunc(c.api.calls, func(call string) bool { return strings.HasSuffix(call, "/pages") }) {
		t.Errorf("Pages was asked about: %v", c.api.calls)
	}
}

// A token the environment gives wins: it is used without being kept, one
// given in the studio instead is refused, and disconnecting cannot take it.
func TestATokenFromTheEnvironmentWins(t *testing.T) {
	c := newConnection(t)
	c.getenv[gitpub.TokenEnv] = "secret-token"
	if state, _ := c.pub.GitHub(t.Context()); state.Token != publish.TokenEnvironment {
		t.Fatalf("token = %q", state.Token)
	}
	if _, err := c.connect(t, publish.GitHubRequest{Token: "another"}); problemCode(err) != publish.CodeGitHubToken {
		t.Fatalf("a second token = %v", err)
	}
	if _, err := c.connect(t, publish.GitHubRequest{Pages: true}); err != nil {
		t.Fatalf("ConnectGitHub: %v", err)
	}
	saved, err := os.ReadFile(filepath.Join(c.root, filepath.FromSlash(gitpub.TokenFile)))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(saved), "secret-token") || !strings.Contains(string(saved), "octocat") {
		t.Errorf("saved:\n%s", saved)
	}
	if state, _ := c.pub.DisconnectGitHub(t.Context()); state.Token != publish.TokenEnvironment {
		t.Errorf("after disconnecting, token = %q", state.Token)
	}
}

func TestDisconnectingForgetsTheSavedToken(t *testing.T) {
	c := newConnection(t)
	if _, err := c.connect(t, publish.GitHubRequest{Token: "secret-token"}); err != nil {
		t.Fatalf("ConnectGitHub: %v", err)
	}
	state, err := c.pub.DisconnectGitHub(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if state.Token != "" || state.Repo != "octocat/site" {
		t.Errorf("state = %+v", state)
	}
	if _, err := os.Stat(filepath.Join(c.root, filepath.FromSlash(gitpub.TokenFile))); err == nil {
		t.Error("the token file is still there")
	}
}
