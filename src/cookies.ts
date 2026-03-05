import { ENDPOINTS } from "./constants.js";
import type { GeminiCookies } from "./types.js";

/**
 * Build a Cookie header string from the two secure cookie values.
 */
export function buildCookieHeader(cookies: GeminiCookies): string {
  return `__Secure-1PSID=${cookies.psid}; __Secure-1PSIDTS=${cookies.psidts}`;
}

/**
 * Rotate (refresh) the __Secure-1PSIDTS cookie by calling Google's
 * RotateCookies endpoint. Returns the new PSIDTS value, or null if
 * rotation didn't yield a new cookie.
 */
export async function rotatePsidts(
  cookies: GeminiCookies
): Promise<string | null> {
  const response = await fetch(ENDPOINTS.ROTATE_COOKIES, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: buildCookieHeader(cookies),
    },
    body: '[000,"-0000000000000000000"]',
    redirect: "follow",
  });

  if (response.status === 401) {
    return null;
  }

  // Extract __Secure-1PSIDTS from Set-Cookie headers
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    const match = cookie.match(/__Secure-1PSIDTS=([^;]+)/);
    if (match) {
      return match[1];
    }
  }

  return null;
}
