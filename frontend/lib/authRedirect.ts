const PRODUCTION_APP_URL = 'https://pichuelectrico.github.io/malla-curricular-interactiva/';

function normalizeAppUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function urlFromBasePath(origin: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.startsWith('/') ? base : `/${base}`;
  const withTrailingSlash = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;
  return `${origin}${withTrailingSlash}`;
}

/**
 * Canonical URL where Supabase should redirect after email confirmation,
 * password recovery, etc. Must match Site URL / Redirect URLs in Supabase.
 */
export function getAuthRedirectUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_URL as string | undefined;
  if (fromEnv) return normalizeAppUrl(fromEnv);
  return urlFromBasePath(window.location.origin);
}

/** Password-reset emails should always land on the public site, not localhost. */
export function getPasswordResetRedirectUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_URL as string | undefined;
  if (fromEnv) return normalizeAppUrl(fromEnv);
  return PRODUCTION_APP_URL;
}

export function hasAuthCallbackHash(): boolean {
  const hash = window.location.hash;
  return (
    hash.includes('access_token=') ||
    hash.includes('error=') ||
    hash.includes('error_description=') ||
    hash.includes('type=recovery') ||
    hash.includes('type=signup')
  );
}

/** Remove auth tokens from the URL hash after Supabase establishes the session. */
export function cleanAuthHashFromUrl(): void {
  if (hasAuthCallbackHash()) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
