// Shared by the auth pages. Keep the redirect validation in one place: it is
// security-sensitive and easy to drift.

/**
 * Resolve ?returnTo= to a safe same-origin path, else "/".
 *
 * The same-origin check alone is not enough: a value like /.//evil.com or
 * /\evil.com parses same-origin but normalizes to a protocol-relative
 * //evil.com when assigned to location.href, which is an open redirect. So require
 * the resolved path to have exactly one leading slash (no "//" prefix, no backslash).
 *
 * @param {string} [search] query string to read, defaults to the current URL's
 * @returns {string}
 */
export function safeReturnTo(search = window.location.search) {
  const raw = new URLSearchParams(search).get("returnTo");
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    const path = url.pathname + url.search + url.hash;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    return path;
  } catch {
    return "/";
  }
}

/**
 * Append ?returnTo= to an in-app path, skipping it when the destination is home.
 *
 * @param {string} path e.g. "/login"
 * @param {string} returnTo a path already validated by safeReturnTo
 * @returns {string}
 */
export function withReturnTo(path, returnTo) {
  return returnTo && returnTo !== "/" ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path;
}

/**
 * Absolute URL that Supabase redirects to after OAuth, magic links and email
 * confirmation. It must match the redirect URLs allowed in Supabase Auth settings.
 *
 * @param {string} returnTo a path already validated by safeReturnTo
 * @returns {string}
 */
export function authCallbackUrl(returnTo) {
  return window.location.origin + withReturnTo("/auth/callback", returnTo);
}
