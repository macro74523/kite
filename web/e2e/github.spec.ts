import type { Route } from "@playwright/test";

import { expect, test } from "./fixtures";

const tokenForm = "https://github.com/settings/personal-access-tokens/new?name=Kite&contents=write&workflows=write&pages=write";

// GitHub itself is never reached from here: the server's answers are stood
// in for, and the connect behind them is tested in internal/publish/git.
test("connecting GitHub says what stopped it, then what it did", async ({ page }) => {
  let state: Record<string, unknown> = { token: "", new_token_url: tokenForm };
  const sent: unknown[] = [];
  let refuse = true;
  await page.route("**/api/v1/github", async (route: Route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ json: state });
      return;
    }
    sent.push(request.postDataJSON());
    if (refuse) {
      refuse = false;
      await route.fulfill({
        status: 409,
        json: {
          error: { code: "publish_failed", message: "the token cannot see octocat/site" },
          problem: {
            code: "github_repo",
            detail: "the token cannot see octocat/site",
            fix: "check that the repository exists and that the token was given access to it",
          },
        },
      });
      return;
    }
    state = {
      token: "saved",
      login: "octocat",
      repo: "octocat/site",
      remote: "origin",
      new_token_url: tokenForm,
      done: ["init", "remote", "workflow", "commit", "push", "pages"],
      pages_url: "https://octocat.github.io/site/",
    };
    await route.fulfill({ json: state });
  });

  await page.goto("/admin/deploy");
  const card = page.locator('[data-slot="card"]').filter({ hasText: "Connect GitHub" });
  await card.getByLabel("Repository").fill("octocat/site");
  const create = card.getByRole("link", { name: "Create one on GitHub" });
  await expect(create).toHaveAttribute("href", /target_name=octocat/);
  await expect(create).toHaveAttribute("href", /name=Kite\+octocat%2Fsite/);
  await expect(card.getByRole("button", { name: "Connect" })).toBeDisabled();
  await card.getByLabel("Token").fill("github_pat_e2e");

  await card.getByRole("button", { name: "Connect" }).click();
  await expect(card.getByRole("alert")).toContainText("That repository was not found on GitHub.");
  await expect(card.getByRole("alert")).toContainText("the token was given access to it");

  await card.getByRole("button", { name: "Connect" }).click();
  await expect(card.getByText("Connected to octocat/site as octocat.")).toBeVisible();
  for (const step of ["Started a git repository", "Wrote the deploy workflow", "Pushed it to GitHub", "Turned GitHub Pages on"]) {
    await expect(card.getByText(step)).toBeVisible();
  }
  await expect(card.getByText("https://octocat.github.io/site/")).toBeVisible();
  await expect(card.getByRole("button", { name: "Disconnect" })).toBeVisible();
  await expect(card.getByLabel("Token")).toBeHidden();
  expect(sent).toEqual([
    { repo: "octocat/site", token: "github_pat_e2e", pages: true },
    { repo: "octocat/site", token: "github_pat_e2e", pages: true },
  ]);
});
