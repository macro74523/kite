package publish

import "context"

// GitHub links a repository to GitHub with a token the author gives, which
// then pushes, turns on Pages and asks about deployments. A publisher that
// can do that implements it; see docs/design/github.md.
type GitHub interface {
	// GitHub reports the link as it stands, never the token itself.
	GitHub(ctx context.Context) (*GitHubState, error)

	// ConnectGitHub links the project to a repository and pushes it there.
	// What it cannot do without changing something it should not, it
	// refuses with a [Problem] before changing anything.
	ConnectGitHub(ctx context.Context, req GitHubRequest) (*GitHubState, error)

	// DisconnectGitHub forgets the token the studio saved.
	DisconnectGitHub(ctx context.Context) (*GitHubState, error)
}

// GitHubRequest is what connecting needs.
type GitHubRequest struct {
	// Repo is owner/name, or any address git accepts for the repository.
	Repo string `json:"repo"`

	// Token is a fine-grained token for the repository. Empty uses the one
	// the environment or an earlier connection gave.
	Token string `json:"token,omitempty"`

	// Pages deploys the site with GitHub Pages: it writes the deploy
	// workflow where there is none and turns Pages on with GitHub Actions
	// as its source. A site another host builds from the repository leaves
	// it off.
	Pages bool `json:"pages"`
}

// Where a token comes from, as GitHubState.Token says.
const (
	TokenSaved       = "saved"
	TokenEnvironment = "environment"
)

// GitHubState is what is known about the link.
type GitHubState struct {
	// Token says where the token comes from: TokenSaved, TokenEnvironment,
	// or "" when there is none.
	Token string `json:"token"`

	// Login is the account the token belongs to, as it was when connected.
	Login string `json:"login,omitempty"`

	// Repo is owner/name of the repository the remote points to on GitHub,
	// and Remote that remote's name.
	Repo   string `json:"repo,omitempty"`
	Remote string `json:"remote,omitempty"`

	// NewTokenURL opens GitHub's form for a fine-grained token, filled in
	// with the permissions connecting needs.
	NewTokenURL string `json:"new_token_url"`

	// Done lists what a connect did, in order: GitHubInit, GitHubRemote,
	// GitHubWorkflow, GitHubCommit, GitHubPages and GitHubPush.
	Done []string `json:"done,omitempty"`

	// PagesURL is where GitHub Pages serves the site, once a connect has
	// turned it on.
	PagesURL string `json:"pages_url,omitempty"`

	// Warnings are what a connect could not do but did not stop for, such
	// as Pages GitHub would not turn on.
	Warnings []Problem `json:"warnings,omitempty"`
}

// The steps of a connect, as GitHubState.Done names them.
const (
	GitHubInit     = "init"
	GitHubRemote   = "remote"
	GitHubWorkflow = "workflow"
	GitHubCommit   = "commit"
	GitHubPages    = "pages"
	GitHubPush     = "push"
)

// Problem codes of a connect.
const (
	CodeGitHubToken       = "github_token"
	CodeGitHubRepo        = "github_repo"
	CodeGitHubNotEmpty    = "github_not_empty"
	CodeGitHubUnreachable = "github_unreachable"
	CodeGitHubPages       = "github_pages"
	CodeRemoteElsewhere   = "remote_elsewhere"
)
