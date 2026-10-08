package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kite-plus/kite/internal/publish"
	gitpub "github.com/kite-plus/kite/internal/publish/git"
)

// What reaches GitHub is tested in internal/publish/git against a GitHub of
// its own; the command is tested up to the point where it would ask.
func TestTheGitHubCommandSaysWhereThingsStand(t *testing.T) {
	t.Setenv(gitpub.TokenEnv, "")
	root := newSite(t)

	if out := runKite(t, root, "github"); !strings.Contains(out, "token: none") ||
		!strings.Contains(out, "personal-access-tokens/new") {
		t.Errorf("kite github said:\n%s", out)
	}

	t.Setenv(gitpub.TokenEnv, "from-the-environment")
	out := runKite(t, root, "--json", "github")
	var state publish.GitHubState
	if err := json.Unmarshal([]byte(out), &state); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, out)
	}
	if state.Token != publish.TokenEnvironment || strings.Contains(out, "from-the-environment") {
		t.Errorf("kite github --json said:\n%s", out)
	}
}

func TestConnectingSaysWhatToFixAndChangesNothing(t *testing.T) {
	t.Setenv(gitpub.TokenEnv, "")
	root := newSite(t)
	t.Chdir(root)
	cmd := newRootCmd()
	cmd.SetIn(strings.NewReader("github_pat_test\n"))
	cmd.SetOut(new(strings.Builder))
	cmd.SetErr(new(strings.Builder))
	cmd.SetArgs([]string{"github", "connect", "--stdin", "not-a-repository"})
	err := cmd.ExecuteContext(t.Context())
	if err == nil || !strings.Contains(err.Error(), "give it as owner/name") {
		t.Fatalf("connect = %v", err)
	}
	for _, left := range []string{".git", ".github", gitpub.TokenFile} {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(left))); err == nil {
			t.Errorf("%s was made", left)
		}
	}
}
