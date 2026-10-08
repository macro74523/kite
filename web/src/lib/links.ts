/**
 * siteHome is where the server this studio runs on shows the site: the path
 * of the base URL, on this origin, since a site published under a path is
 * previewed under it too.
 */
export function siteHome(site?: { base_url: string }): string {
  try {
    return new URL(site?.base_url ?? "/", window.location.origin).pathname;
  } catch {
    return "/";
  }
}

/**
 * destination is how markdown writes the address a link or a picture points
 * to: as it is, or in angle brackets when a space or an unmatched parenthesis
 * would end it early, as in a screenshot's name. Without them the markdown
 * reads back as text.
 */
export function destination(link: string): string {
  return bare(link) ? link : `<${link.replace(/[<>]/g, "\\$&")}>`;
}

/** bare says markdown reads an address whole without angle brackets around it. */
function bare(link: string): boolean {
  if (link.startsWith("<") || /[\s\x00-\x1f\x7f]/.test(link)) return false;
  let open = 0;
  for (const char of link) {
    if (char === "(") open++;
    else if (char === ")" && --open < 0) return false;
  }
  return open === 0;
}

/**
 * resolveLink turns a link written relative to a page into one the admin can
 * load. A link from the site's root, as "/uploads/a.jpg", is under home, the
 * path the site is previewed at, as the build puts it under the path the
 * site is published at.
 */
export function resolveLink(link: string, base?: string, home = "/"): string {
  const root = home.replace(/\/$/, "");
  if (root && link.startsWith("/") && !link.startsWith("//") && link !== root && !link.startsWith(root + "/")) {
    link = root + link;
  }
  try {
    return new URL(link, new URL(base ?? "/", window.location.origin)).toString();
  } catch {
    return link;
  }
}
