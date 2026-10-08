package git

import (
	"bytes"
	"cmp"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/kite-plus/kite/internal/publish"
)

// TokenFile is where a token given in the studio is kept, relative to the
// project root: beside the account, under a directory every project Kite
// creates ignores, readable by its owner alone.
const TokenFile = ".kite/secrets/github.json"

// TokenEnv supplies the token instead, for a container or CI, and wins over
// the file.
const TokenEnv = "KITE_GITHUB_TOKEN"

// GitHubHost is where repositories on GitHub are pushed to over https.
const GitHubHost = "https://github.com"

// githubAccount is what TokenFile holds: the token, and who it belongs to,
// as GitHub said when the site was connected.
type githubAccount struct {
	Version   int       `json:"version"`
	Token     string    `json:"token,omitempty"`
	Login     string    `json:"login,omitempty"`
	ID        int64     `json:"id,omitempty"`
	Name      string    `json:"name,omitempty"`
	UpdatedAt time.Time `json:"updated_at,omitzero"`
}

func readAccount(root string) (githubAccount, error) {
	var a githubAccount
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(TokenFile)))
	if errors.Is(err, fs.ErrNotExist) {
		return a, nil
	}
	if err != nil {
		return a, err
	}
	if err := json.Unmarshal(data, &a); err != nil {
		return a, fmt.Errorf("git: %s: %w", TokenFile, err)
	}
	return a, nil
}

// writeAccount saves the account through a temporary file, so an
// interrupted write cannot leave half a token behind.
func writeAccount(root string, a githubAccount) error {
	a.Version = 1
	data, err := json.MarshalIndent(a, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(root, filepath.FromSlash(TokenFile))
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

// token is the token the project pushes and asks GitHub with, and where it
// comes from: publish.TokenEnvironment, publish.TokenSaved or "".
func (p *Publisher) token() (string, string) {
	if t := strings.TrimSpace(p.opts.Getenv(TokenEnv)); t != "" {
		return t, publish.TokenEnvironment
	}
	a, err := readAccount(p.opts.Root)
	if err != nil || a.Token == "" {
		return "", ""
	}
	return a.Token, publish.TokenSaved
}

// credentials is the git configuration that sends token with every request
// to host over https, as actions/checkout does, given as environment
// variables numbered after any the environment already sets. Nothing is
// written to a config file, and nothing appears among a command's arguments.
func credentials(host, token string, environ []string) []string {
	n := 0
	for _, kv := range environ {
		if v, ok := strings.CutPrefix(kv, "GIT_CONFIG_COUNT="); ok {
			n, _ = strconv.Atoi(v)
		}
	}
	basic := base64.StdEncoding.EncodeToString([]byte("x-access-token:" + token))
	return []string{
		"GIT_CONFIG_COUNT=" + strconv.Itoa(n+1),
		fmt.Sprintf("GIT_CONFIG_KEY_%d=http.%s/.extraheader", n, strings.TrimSuffix(host, "/")),
		fmt.Sprintf("GIT_CONFIG_VALUE_%d=AUTHORIZATION: basic %s", n, basic),
	}
}

// committer is who commits are made by where git has no identity of its
// own, as in a container: the connected account, at the noreply address
// GitHub gives it, so a commit counts as its own without showing its email.
// An identity the author configured always wins.
func (p *Publisher) committer(ctx context.Context) []string {
	if email, _ := p.git.read(ctx, "config", "user.email"); email != "" {
		return nil
	}
	for _, key := range []string{"GIT_COMMITTER_EMAIL", "GIT_AUTHOR_EMAIL", "EMAIL"} {
		if p.opts.Getenv(key) != "" {
			return nil
		}
	}
	a, err := readAccount(p.opts.Root)
	if err != nil || a.Login == "" || a.ID == 0 {
		return nil
	}
	name := cmp.Or(a.Name, a.Login)
	email := fmt.Sprintf("%d+%s@users.noreply.github.com", a.ID, a.Login)
	return []string{
		"GIT_AUTHOR_NAME=" + name, "GIT_AUTHOR_EMAIL=" + email,
		"GIT_COMMITTER_NAME=" + name, "GIT_COMMITTER_EMAIL=" + email,
	}
}

var (
	ownerName = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`)
	repoName  = regexp.MustCompile(`^[A-Za-z0-9._-]{1,100}$`)
)

// parseRepo reads owner/name out of what an author typed: owner/name itself
// or any address git accepts for the repository on host.
func parseRepo(s, host string) (string, bool) {
	s = strings.TrimSpace(s)
	repo, ok := githubRepo(s)
	if !ok {
		if rest, found := strings.CutPrefix(s, strings.TrimSuffix(host, "/")+"/"); found {
			s = rest
		}
		repo = strings.TrimSuffix(strings.Trim(s, "/"), ".git")
	}
	owner, name, found := strings.Cut(repo, "/")
	if !found || !ownerName.MatchString(owner) || !repoName.MatchString(name) || name == "." || name == ".." {
		return "", false
	}
	return owner + "/" + name, true
}

// newTokenURL opens GitHub's form for a fine-grained token with what
// connecting needs: pushing, the workflow files and Pages, for a year. The
// repository itself is chosen on the form.
func newTokenURL(repo string) string {
	q := url.Values{}
	q.Set("name", strings.TrimSpace("Kite "+repo))
	q.Set("description", "Lets Kite push this site and turn on GitHub Pages")
	q.Set("expires_in", "365")
	q.Set("contents", "write")
	q.Set("workflows", "write")
	q.Set("pages", "write")
	if owner, _, ok := strings.Cut(repo, "/"); ok {
		q.Set("target_name", owner)
	}
	return "https://github.com/settings/personal-access-tokens/new?" + q.Encode()
}

// githubClient asks GitHub's API on behalf of the token a connect was given.
type githubClient struct {
	api    string
	token  string
	client *http.Client
}

type ghUser struct {
	Login string `json:"login"`
	ID    int64  `json:"id"`
	Name  string `json:"name"`
}

type ghPages struct {
	BuildType string `json:"build_type"`
	HTMLURL   string `json:"html_url"`
}

// call makes one request and decodes a JSON answer into v. It returns the
// status, and GitHub's own message for an answer that is not a success.
func (c githubClient) call(ctx context.Context, method, path string, body, v any) (int, string, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return 0, "", err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.api+path, reader)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return 0, "", publish.Problem{
			Code:   publish.CodeGitHubUnreachable,
			Detail: "GitHub could not be reached: " + err.Error(),
			Fix:    "check that this machine can reach api.github.com",
		}
	}
	defer func() { _ = resp.Body.Close() }()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return resp.StatusCode, "", err
	}
	if resp.StatusCode >= 300 {
		var said struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(data, &said)
		return resp.StatusCode, cmp.Or(said.Message, resp.Status), nil
	}
	if v != nil && len(data) > 0 {
		return resp.StatusCode, "", json.Unmarshal(data, v)
	}
	return resp.StatusCode, "", nil
}

// refused is the problem an answer of GitHub's that is neither a success nor
// one a step expects stands for.
func refused(status int, message string) error {
	if status == http.StatusUnauthorized {
		return publish.Problem{
			Code:   publish.CodeGitHubToken,
			Detail: "GitHub refused the token: " + message,
			Fix:    "make a new fine-grained token and connect again",
		}
	}
	return publish.Problem{
		Code:   publish.CodeGitHubUnreachable,
		Detail: fmt.Sprintf("GitHub answered %d: %s", status, message),
		Fix:    "try again in a moment",
	}
}

// user is who the token belongs to.
func (c githubClient) user(ctx context.Context) (ghUser, error) {
	var u ghUser
	status, message, err := c.call(ctx, http.MethodGet, "/user", nil, &u)
	if err != nil {
		return u, err
	}
	if status != http.StatusOK {
		return u, refused(status, message)
	}
	return u, nil
}

// visible checks that the token can see the repository at all.
func (c githubClient) visible(ctx context.Context, repo string) error {
	status, message, err := c.call(ctx, http.MethodGet, "/repos/"+repo, nil, nil)
	if err != nil {
		return err
	}
	switch status {
	case http.StatusOK:
		return nil
	case http.StatusNotFound:
		return publish.Problem{
			Code:   publish.CodeGitHubRepo,
			Detail: "the token cannot see " + repo,
			Fix:    "check that the repository exists and that the token was given access to it",
		}
	default:
		return refused(status, message)
	}
}

// empty reports whether the repository has no commits yet, which GitHub
// answers listing them with 409.
func (c githubClient) empty(ctx context.Context, repo string) (bool, error) {
	status, message, err := c.call(ctx, http.MethodGet, "/repos/"+repo+"/commits?per_page=1", nil, nil)
	if err != nil {
		return false, err
	}
	switch status {
	case http.StatusConflict:
		return true, nil
	case http.StatusOK:
		return false, nil
	default:
		return false, refused(status, message)
	}
}

// pages turns GitHub Pages on for the repository with GitHub Actions as its
// source, or switches it there, and returns the site's address. A refusal
// is returned as a warning: Pages can still be turned on by hand.
func (c githubClient) pages(ctx context.Context, repo string) (string, *publish.Problem, error) {
	var site ghPages
	status, message, err := c.call(ctx, http.MethodGet, "/repos/"+repo+"/pages", nil, &site)
	if err != nil {
		return "", nil, err
	}
	switch {
	case status == http.StatusNotFound:
		status, message, err = c.call(ctx, http.MethodPost, "/repos/"+repo+"/pages",
			map[string]string{"build_type": "workflow"}, &site)
	case status == http.StatusOK && site.BuildType != "workflow":
		status, message, err = c.call(ctx, http.MethodPut, "/repos/"+repo+"/pages",
			map[string]string{"build_type": "workflow"}, nil)
		if err == nil && status < 300 {
			status, message, err = c.call(ctx, http.MethodGet, "/repos/"+repo+"/pages", nil, &site)
		}
	}
	if err != nil {
		return "", nil, err
	}
	if status >= 300 {
		fix := "turn it on under Settings -> Pages -> Source -> GitHub Actions"
		if status == http.StatusForbidden || status == http.StatusNotFound {
			fix = "give the token Pages: read and write, or " + fix
		}
		return "", &publish.Problem{
			Code:   publish.CodeGitHubPages,
			Detail: "GitHub did not turn Pages on: " + message,
			Fix:    fix,
		}, nil
	}
	return site.HTMLURL, nil, nil
}
