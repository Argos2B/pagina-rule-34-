const ACCESS_TOKEN_KEY = "booru_access_token";
const REFRESH_TOKEN_KEY = "booru_refresh_token";

/**
 * Centralized JWT storage. Kept in one place so the API client and the auth
 * context never duplicate token-reading/writing logic.
 *
 * Note: tokens are stored in localStorage because the backend issues JWTs via
 * response body (not httpOnly cookies), which is what SimpleJWT's
 * TokenObtainPairView returns. This is a standard trade-off for JWT-based SPAs
 * without a cookie-issuing backend; it does mean tokens are readable by any
 * script running on the page, so the app must avoid rendering unsanitized
 * user input (see the "no dangerouslySetInnerHTML" rule followed throughout).
 */
export const tokenStorage = {
  getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  setAccessToken(token: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  },
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setRefreshToken(token: string): void {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  },
  setTokens(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};
