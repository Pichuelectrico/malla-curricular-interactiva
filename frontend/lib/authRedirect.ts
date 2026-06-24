/**
 * Canonical URL where Supabase should redirect after email confirmation,
 * password recovery, etc. Must match Site URL / Redirect URLs in Supabase.
 */
export function getAuthRedirectUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.startsWith('/') ? base : `/${base}`;
  const withTrailingSlash = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;
  return `${window.location.origin}${withTrailingSlash}`;
}

/** Remove auth tokens from the URL hash after Supabase establishes the session. */
export function cleanAuthHashFromUrl(): void {
  const hash = window.location.hash;
  if (
    hash.includes('access_token=') ||
    hash.includes('error=') ||
    hash.includes('error_description=') ||
    hash.includes('type=recovery') ||
    hash.includes('type=signup')
  ) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
