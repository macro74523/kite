import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap, type components } from "@/api/client";

export type GitHubState = components["schemas"]["GitHubState"];
export type GitHubRequest = components["schemas"]["GitHubRequest"];
type Problem = components["schemas"]["Problem"];

/** GitHubRefusal is why a connect stopped, as the server put it, with what to do. */
export class GitHubRefusal extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail);
    this.name = "GitHubRefusal";
  }
}

/**
 * useGitHub reports how the site is linked to GitHub: where its token comes
 * from, never the token, and the repository its remote points to. A server
 * that publishes nothing answers 501, which leaves the query in error.
 */
export function useGitHub() {
  return useQuery({
    queryKey: ["github"],
    queryFn: async () => unwrap(await api.GET("/github", {})),
    retry: false,
  });
}

/**
 * useConnectGitHub links the site to a repository and pushes it there. A
 * refusal carries the server's own account of it, which says what to do.
 */
export function useConnectGitHub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: GitHubRequest) => {
      const result = await api.PUT("/github", { body });
      const refused = result.error as { problem?: Problem } | undefined;
      if (refused?.problem) throw new GitHubRefusal(refused.problem);
      return unwrap(result);
    },
    onSuccess: (state) => {
      queryClient.setQueryData(["github"], state);
      void queryClient.invalidateQueries({ queryKey: ["publish"] });
    },
  });
}

/** useDisconnectGitHub forgets the token the studio saved. */
export function useDisconnectGitHub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.DELETE("/github", {})),
    onSuccess: (state) => {
      queryClient.setQueryData(["github"], state);
      void queryClient.invalidateQueries({ queryKey: ["publish"] });
    },
  });
}
