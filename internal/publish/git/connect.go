package git

import (
	"cmp"
	"context"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/kite-plus/kite/internal/kitew"
	"github.com/kite-plus/kite/internal/publish"
)

// siteFiles are what a site's first commit holds: what a publish carries,
// and the rest of what kite init writes. A container's home is the site's
// own folder, so anything else there, such as ~/.ssh, stays out.
var siteFiles = append(slices.Clone(watched), "layouts", "i18n", ".gitignore", "kitew", "kitew.ps1", ".github")

// GitHub reports the link to GitHub as it stands.
func (p *Publisher) GitHub(ctx context.Context) (*publish.GitHubState, error) {
	state := &publish.GitHubState{}
	_, state.Token = p.token()
	if state.Token != "" {
		if a, err := readAccount(p.opts.Root); err == nil {
			state.Login = a.Login
		}
	}
	if remote := p.remote(ctx); remote != "" {
		if u, err := p.git.read(ctx, "remote", "get-url", remote); err == nil {
			if repo, ok := p.repoOf(u); ok {
				state.Repo, state.Remote = repo, remote
			}
		}
	}
	state.NewTokenURL = newTokenURL(state.Repo)
	return state, nil
}

// DisconnectGitHub forgets the token the studio saved. One the environment
// gives cannot be taken away from here.
func (p *Publisher) DisconnectGitHub(ctx context.Context) (*publish.GitHubState, error) {
	if err := os.Remove(filepath.Join(p.opts.Root, filepath.FromSlash(TokenFile))); err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	return p.GitHub(ctx)
}

// repoOf reads owner/name out of a remote's address on GitHub, or on the
// host a test pushes to instead.
func (p *Publisher) repoOf(remote string) (string, bool) {
	if repo, ok := githubRepo(remote); ok {
		return repo, true
	}
	if p.opts.GitHubHost == GitHubHost {
		return "", false
	}
	rest, ok := strings.CutPrefix(remote, strings.TrimSuffix(p.opts.GitHubHost, "/")+"/")
	if !ok {
		return "", false
	}
	return parseRepo(rest, p.opts.GitHubHost)
}

// ConnectGitHub links the project to a repository on GitHub and pushes it
// there; see docs/design/github.md. Everything that could refuse is asked
// first, so a connect that stops has changed nothing.
func (p *Publisher) ConnectGitHub(ctx context.Context, req publish.GitHubRequest) (*publish.GitHubState, error) {
	repo, ok := parseRepo(req.Repo, p.opts.GitHubHost)
	if !ok {
		return nil, publish.Problem{
			Code:   publish.CodeGitHubRepo,
			Detail: "not a repository on GitHub: " + req.Repo,
			Fix:    "give it as owner/name",
		}
	}
	given := strings.TrimSpace(req.Token)
	token, source := p.token()
	if given != "" {
		if source == publish.TokenEnvironment && given != token {
			return nil, publish.Problem{
				Code:   publish.CodeGitHubToken,
				Detail: TokenEnv + " is set, and its token wins over one given here",
				Fix:    "connect without a token to use it, or take it out of the environment",
			}
		}
		token, source = given, publish.TokenSaved
	}
	if token == "" {
		return nil, publish.Problem{
			Code:   publish.CodeGitHubToken,
			Detail: "connecting needs a token",
			Fix:    "make a fine-grained token for the repository and give it here",
		}
	}

	gh := githubClient{
		api:    strings.TrimSuffix(cmp.Or(p.opts.GitHubAPI, GitHubAPI), "/"),
		token:  token,
		client: &http.Client{Timeout: 20 * time.Second},
	}
	user, err := gh.user(ctx)
	if err != nil {
		return nil, err
	}
	if err := gh.visible(ctx, repo); err != nil {
		return nil, err
	}

	release, err := p.lock.acquire()
	if err != nil {
		return nil, err
	}
	defer release()

	isRepo, err := p.ownRepository(ctx)
	if err != nil {
		return nil, err
	}
	hasCommits := isRepo && p.git.ok(ctx, "rev-parse", "--verify", "-q", "HEAD")
	if isRepo && p.currentBranch(ctx) == "" {
		return nil, publish.Problem{
			Code:   publish.CodeDetachedHead,
			Detail: "HEAD is not on a branch",
			Fix:    "check out the branch the site publishes from",
		}
	}
	if !hasCommits {
		empty, err := gh.empty(ctx, repo)
		if err != nil {
			return nil, err
		}
		if !empty {
			return nil, publish.Problem{
				Code:   publish.CodeGitHubNotEmpty,
				Detail: repo + " already has commits, and this site has none of them",
				Fix:    "connect an empty repository, or clone this one and run Kite in it",
			}
		}
	}
	addRemote := true
	if isRepo {
		if existing, err := p.git.read(ctx, "remote", "get-url", "origin"); err == nil && existing != "" {
			if got, ok := p.repoOf(existing); !ok || !strings.EqualFold(got, repo) {
				return nil, publish.Problem{
					Code:   publish.CodeRemoteElsewhere,
					Detail: "origin points to " + existing,
					Fix:    "connect that repository, or change origin in a terminal first",
				}
			}
			addRemote = false
		}
	}

	// Everything has been asked; from here on the project changes.
	saved, err := readAccount(p.opts.Root)
	if err != nil {
		return nil, err
	}
	if source == publish.TokenSaved {
		saved.Token = token
	}
	saved.Login, saved.ID, saved.Name, saved.UpdatedAt = user.Login, user.ID, user.Name, p.opts.Now().UTC()
	if err := writeAccount(p.opts.Root, saved); err != nil {
		return nil, err
	}

	state := &publish.GitHubState{Token: source, Login: user.Login, Repo: repo, Remote: "origin", NewTokenURL: newTokenURL(repo)}
	step := func(name string) { state.Done = append(state.Done, name) }

	if !isRepo {
		if _, err := p.git.call(ctx, "", "init", "-q", "-b", "main"); err != nil {
			return nil, err
		}
		step(publish.GitHubInit)
	}
	if addRemote {
		remote := strings.TrimSuffix(p.opts.GitHubHost, "/") + "/" + repo + ".git"
		if _, err := p.git.call(ctx, "", "remote", "add", "origin", remote); err != nil {
			return nil, err
		}
		step(publish.GitHubRemote)
	}
	branch := p.currentBranch(ctx)

	var workflows []string
	if req.Pages {
		if workflows, err = kitew.WriteWorkflows(p.opts.Root, branch); err != nil {
			return nil, err
		}
		if len(workflows) > 0 {
			step(publish.GitHubWorkflow)
		}
	}

	paths, message := siteFiles, "Start the site"
	if hasCommits {
		paths, message = nil, "Deploy with GitHub Pages"
		for _, w := range workflows {
			paths = append(paths, filepath.ToSlash(w))
		}
	}
	commit, err := p.committable(ctx, paths)
	if err != nil {
		return nil, err
	}
	if len(commit) > 0 {
		committer := p.git.literal().with(p.committer(ctx)...)
		if _, err := committer.call(ctx, "", append([]string{"add", "--"}, commit...)...); err != nil {
			return nil, err
		}
		if _, err := committer.call(ctx, "", append([]string{"commit", "-q", "-m", message, "--"}, commit...)...); err != nil {
			return nil, err
		}
		step(publish.GitHubCommit)
	}

	// Pages goes on before the push, so the run the push starts finds it.
	// GitHub may not take it for a repository with nothing in it yet, and
	// is asked again once the push has been made.
	var refusal *publish.Problem
	if req.Pages {
		if state.PagesURL, refusal, err = gh.pages(ctx, repo); err != nil {
			return nil, err
		}
	}
	if err := p.push(ctx, "origin", branch, p.head(ctx)); err != nil {
		return nil, err
	}
	step(publish.GitHubPush)
	if req.Pages && refusal != nil {
		if state.PagesURL, refusal, err = gh.pages(ctx, repo); err != nil {
			return nil, err
		}
	}
	if req.Pages {
		if refusal != nil {
			state.Warnings = append(state.Warnings, *refusal)
		} else {
			step(publish.GitHubPages)
		}
	}
	return state, nil
}

// committable lists the files under paths a commit would carry: those git
// tracks or would add, and none it ignores. An empty folder, such as the
// layouts kite init makes, holds none, and naming it would fail the commit.
func (p *Publisher) committable(ctx context.Context, paths []string) ([]string, error) {
	if len(paths) == 0 {
		return nil, nil
	}
	args := append([]string{"ls-files", "-z", "--cached", "--others", "--exclude-standard", "--"}, paths...)
	out, err := p.git.literal().readRaw(ctx, args...)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, name := range strings.Split(out, "\x00") {
		if name != "" {
			files = append(files, name)
		}
	}
	return files, nil
}

// ownRepository reports whether the project is a repository of its own. A
// site inside a larger one cannot be connected: pushing it would push every
// other file of that repository too.
func (p *Publisher) ownRepository(ctx context.Context) (bool, error) {
	top, err := p.git.read(ctx, "rev-parse", "--show-toplevel")
	if err != nil {
		return false, nil
	}
	if same(top, p.opts.Root) {
		return true, nil
	}
	return false, publish.Problem{
		Code:   publish.CodeRemoteElsewhere,
		Detail: "the site is inside the repository at " + top,
		Fix:    "connect that repository from a terminal, or move the site to a folder of its own",
	}
}

// same reports whether two paths name one directory, through any symlink
// such as macOS's /var.
func same(a, b string) bool {
	ra, errA := filepath.EvalSymlinks(a)
	rb, errB := filepath.EvalSymlinks(b)
	if errA != nil || errB != nil {
		return filepath.Clean(a) == filepath.Clean(b)
	}
	return ra == rb
}
