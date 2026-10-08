package cli

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/kite-plus/kite/internal/publish"
	gitpub "github.com/kite-plus/kite/internal/publish/git"
	"github.com/kite-plus/kite/internal/site"
)

func newGitHubCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "github",
		Short: "Link the site to a repository on GitHub",
		Long: "With no subcommand, says how the site is linked to GitHub: where its token\n" +
			"comes from, never the token, and the repository its remote points to.\n\n" +
			"connect links it with a fine-grained token for that repository alone, with\n" +
			"Contents, Workflows and Pages: read and write. The token is read from\n" +
			gitpub.TokenEnv + ", or else asked for without echoing it and kept in\n" +
			gitpub.TokenFile + ", readable by its owner alone.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			gh, done, err := openGitHub(cmd)
			if err != nil {
				return err
			}
			defer done()
			state, err := gh.GitHub(cmd.Context())
			if err != nil {
				return err
			}
			if jsonOut(cmd) {
				return writeJSON(cmd.OutOrStdout(), state)
			}
			describeGitHub(cmd, state)
			return nil
		},
	}
	cmd.AddCommand(newGitHubConnectCmd(), newGitHubDisconnectCmd())
	return cmd
}

func newGitHubConnectCmd() *cobra.Command {
	var noPages, stdin bool
	cmd := &cobra.Command{
		Use:   "connect owner/name",
		Short: "Link the site to a repository on GitHub and push it there",
		Long: "Starts a repository and adds origin where there is none, writes the deploy\n" +
			"workflow and turns GitHub Pages on, commits the site's own files and pushes.\n" +
			"A new site needs an empty repository.\n\n" +
			"What it would have to refuse, it refuses before changing anything: a token\n" +
			"GitHub does not take, a repository it cannot see, one with commits of its\n" +
			"own while the site has none, an origin that points elsewhere.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			gh, done, err := openGitHub(cmd)
			if err != nil {
				return err
			}
			defer done()

			var token string
			if os.Getenv(gitpub.TokenEnv) == "" {
				if token, err = readToken(cmd, stdin); err != nil {
					return err
				}
			}
			state, err := gh.ConnectGitHub(cmd.Context(), publish.GitHubRequest{Repo: args[0], Token: token, Pages: !noPages})
			if err != nil {
				return problemError(err)
			}
			if jsonOut(cmd) {
				return writeJSON(cmd.OutOrStdout(), state)
			}
			for _, step := range state.Done {
				printf(cmd, "%s\n", githubSteps[step])
			}
			for _, w := range state.Warnings {
				printf(cmd, "warning: %s\n", w.Detail)
				if w.Fix != "" {
					printf(cmd, "         %s\n", w.Fix)
				}
			}
			if state.PagesURL != "" {
				printf(cmd, "\nonce the first deploy finishes, the site is at %s\n", state.PagesURL)
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&noPages, "no-pages", false, "leave the deploy workflow and GitHub Pages alone, for a site another host builds")
	cmd.Flags().BoolVar(&stdin, "stdin", false, "read the token from standard input")
	return cmd
}

func newGitHubDisconnectCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "disconnect",
		Short: "Forget the token kept for GitHub",
		Long: "Deletes " + gitpub.TokenFile + ". A token " + gitpub.TokenEnv + " gives stays,\n" +
			"and so does the remote: pushing goes back to whatever credentials git has.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			gh, done, err := openGitHub(cmd)
			if err != nil {
				return err
			}
			defer done()
			state, err := gh.DisconnectGitHub(cmd.Context())
			if err != nil {
				return err
			}
			if jsonOut(cmd) {
				return writeJSON(cmd.OutOrStdout(), state)
			}
			if state.Token == publish.TokenEnvironment {
				printf(cmd, "the token in %s is still used; take it out of the environment\n", gitpub.TokenEnv)
				return nil
			}
			printf(cmd, "the token is forgotten\n")
			return nil
		},
	}
}

// githubSteps say what each step of a connect did.
var githubSteps = map[string]string{
	publish.GitHubInit:     "started a git repository",
	publish.GitHubRemote:   "added origin",
	publish.GitHubWorkflow: "wrote the deploy workflow",
	publish.GitHubCommit:   "committed the site",
	publish.GitHubPush:     "pushed it to GitHub",
	publish.GitHubPages:    "turned GitHub Pages on, building with GitHub Actions",
}

// openGitHub opens the site in the working directory and returns its
// publisher as one that links to GitHub.
func openGitHub(cmd *cobra.Command) (publish.GitHub, func(), error) {
	wd, err := os.Getwd()
	if err != nil {
		return nil, nil, err
	}
	s, err := site.Open(cmd.Context(), wd)
	if err != nil {
		return nil, nil, err
	}
	done := func() { _ = s.Close() }
	gh, ok := s.Publisher().(publish.GitHub)
	if !ok {
		done()
		return nil, nil, errors.New("github: this project does not publish with git")
	}
	return gh, done, nil
}

func describeGitHub(cmd *cobra.Command, state *publish.GitHubState) {
	switch state.Token {
	case publish.TokenEnvironment:
		printf(cmd, "token: from %s\n", gitpub.TokenEnv)
	case publish.TokenSaved:
		printf(cmd, "token: kept in %s\n", gitpub.TokenFile)
	default:
		printf(cmd, "token: none; connect with 'kite github connect owner/name'\n")
	}
	if state.Login != "" {
		printf(cmd, "account: %s\n", state.Login)
	}
	if state.Repo != "" {
		printf(cmd, "repository: %s, as %s\n", state.Repo, state.Remote)
	} else {
		printf(cmd, "repository: no remote on GitHub\n")
	}
	if state.Token == "" {
		printf(cmd, "\nmake a token for it at\n  %s\n", state.NewTokenURL)
	}
}

// readToken asks for the token without echoing it, or reads it from a pipe.
func readToken(cmd *cobra.Command, stdin bool) (string, error) {
	fd := int(os.Stdin.Fd())
	if stdin || !term.IsTerminal(fd) {
		data, err := io.ReadAll(io.LimitReader(cmd.InOrStdin(), 4096))
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(data)), nil
	}
	printf(cmd, "token: ")
	// The token never reaches the terminal, so it cannot be left on screen.
	typed, err := term.ReadPassword(fd)
	printf(cmd, "\n")
	if err != nil {
		return "", fmt.Errorf("could not read the token: %w", err)
	}
	return strings.TrimSpace(string(typed)), nil
}

// problemError turns a publisher's problem into an error that says what to
// do about it.
func problemError(err error) error {
	var p publish.Problem
	if !errors.As(err, &p) || p.Fix == "" {
		return err
	}
	return fmt.Errorf("%s\n  %s", p.Detail, p.Fix)
}
