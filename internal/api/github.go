package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/kite-plus/kite/internal/publish"
)

// handleGitHub reports how the project is linked to GitHub: where its token
// comes from, never the token, and the repository its remote points to.
func (s *Server) handleGitHub(w http.ResponseWriter, r *http.Request) {
	gh, ok := githubOf(w, s.src())
	if !ok {
		return
	}
	state, err := gh.GitHub(r.Context())
	if err != nil {
		s.failErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// handleConnectGitHub links the project to a repository on GitHub with a
// token for it and pushes it there; see docs/design/github.md. A connect
// that has to stop does so before changing anything, and says why as a
// publish does.
func (s *Server) handleConnectGitHub(w http.ResponseWriter, r *http.Request) {
	view := s.src()
	gh, ok := githubOf(w, view)
	if !ok || !s.writable(w, view) {
		return
	}
	body, ok := decodeJSON[publish.GitHubRequest](s, w, r)
	if !ok {
		return
	}
	if strings.TrimSpace(body.Repo) == "" {
		failField(w, http.StatusBadRequest, CodeInvalidRequest, "repo", "name the repository, as owner/name")
		return
	}
	state, err := gh.ConnectGitHub(r.Context(), body)
	if err != nil {
		if errors.As(err, new(publish.Problem)) {
			refuse(w, err, nil, nil)
			return
		}
		s.failErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// handleDisconnectGitHub forgets the token the studio saved.
func (s *Server) handleDisconnectGitHub(w http.ResponseWriter, r *http.Request) {
	view := s.src()
	gh, ok := githubOf(w, view)
	if !ok || !s.writable(w, view) {
		return
	}
	state, err := gh.DisconnectGitHub(r.Context())
	if err != nil {
		s.failErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, state)
}

// githubOf is the view's publisher as one that can link to GitHub.
func githubOf(w http.ResponseWriter, view View) (publish.GitHub, bool) {
	gh, ok := view.Publisher.(publish.GitHub)
	if !ok {
		fail(w, http.StatusNotImplemented, CodeReadOnly, "this project does not publish with git")
		return nil, false
	}
	return gh, true
}
