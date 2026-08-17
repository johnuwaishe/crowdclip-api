/**
 * The origins a browser uses to reach CrowdClip.
 *
 * Instagram must be able to reach the OAuth callback and the webhook endpoint,
 * so in local development the API is published through a tunnel while the web
 * app stays on localhost. The tunnel origin is therefore *cross-site* from the
 * web app, which changes which cookie attributes a browser will accept, so both
 * the callback URL and the cookie attributes are derived from one value here.
 */

const DEFAULT_API_PUBLIC_URL = 'http://localhost:3000';

export function apiPublicUrl(): string {
  const configured = process.env.CROWDCLIP_API_PUBLIC_URL?.trim();
  return parseOrigin(
    configured || DEFAULT_API_PUBLIC_URL,
    'CROWDCLIP_API_PUBLIC_URL',
  );
}

export function webAppUrl(): string | null {
  const configured = process.env.CROWDCLIP_WEB_APP_URL?.trim();
  if (!configured) return null;
  return parseOrigin(configured, 'CROWDCLIP_WEB_APP_URL');
}

export function instagramCallbackUrl(): string {
  return new URL('/auth/instagram/callback', apiPublicUrl()).toString();
}

export interface BrowserCookieOptions {
  secure: boolean;
  sameSite: 'lax' | 'none';
}

/**
 * Cookie attributes the browser will accept for this API origin.
 *
 * `SameSite=Lax` cookies are only sent on same-site requests and on top-level
 * navigations, which is enough for the OAuth handshake but not for the web
 * app's `fetch` calls when the API lives on a different site. Those need
 * `SameSite=None`, which browsers only honour together with `Secure`.
 */
export function browserCookieOptions(): BrowserCookieOptions {
  const api = new URL(apiPublicUrl());
  const secure = api.protocol === 'https:' || isProduction();
  const web = webAppUrl();
  const crossSite =
    web !== null && !isSameSite(api.hostname, new URL(web).hostname);
  return { secure, sameSite: crossSite && secure ? 'none' : 'lax' };
}

/**
 * True when the web app cannot hold a session against this API because the two
 * are cross-site but the API is not served over HTTPS. Reported at startup
 * rather than left to surface as an opaque 401.
 */
export function crossSiteCookiesUnavailable(): boolean {
  const web = webAppUrl();
  if (web === null) return false;
  const api = new URL(apiPublicUrl());
  return (
    !isSameSite(api.hostname, new URL(web).hostname) &&
    browserCookieOptions().sameSite !== 'none'
  );
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isSameSite(a: string, b: string): boolean {
  if (a === b) return true;
  return a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function parseOrigin(value: string, variableName: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be an absolute URL, got "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${variableName} must be an http(s) URL, got "${value}"`);
  }
  return url.origin;
}
