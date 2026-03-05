import { ENDPOINTS, DEFAULT_HEADERS } from "./constants.js";
import { buildCookieHeader } from "./cookies.js";
import { AuthError } from "./errors.js";
import type { GeminiCookies, SessionTokens } from "./types.js";

/**
 * Fetch the SNlM0e access token, build label, and session ID from
 * the Gemini web app page. These are embedded in the HTML as JS variables.
 *
 * @throws {AuthError} If the page can't be loaded or tokens aren't found.
 */
export async function fetchAccessToken(
  cookies: GeminiCookies
): Promise<SessionTokens> {
  const response = await fetch(ENDPOINTS.INIT, {
    method: "GET",
    headers: {
      ...DEFAULT_HEADERS,
      Cookie: buildCookieHeader(cookies),
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new AuthError(
      `Failed to load Gemini page. Status: ${response.status}`
    );
  }

  const html = await response.text();

  // Extract SNlM0e — the CSRF/access token required for all POST requests
  const snlm0eMatch = html.match(/"SNlM0e":\s*"(.*?)"/);
  // Extract cfb2h — the build label (sent as ?bl= query param)
  const cfb2hMatch = html.match(/"cfb2h":\s*"(.*?)"/);
  // Extract FdrFJe — the session ID (sent as ?f.sid= query param)
  const fdrfjeMatch = html.match(/"FdrFJe":\s*"(.*?)"/);

  if (!snlm0eMatch && !cfb2hMatch && !fdrfjeMatch) {
    throw new AuthError(
      "Could not find SNlM0e, cfb2h, or FdrFJe in Gemini page. " +
        "Cookies may be invalid or expired."
    );
  }

  return {
    accessToken: snlm0eMatch?.[1] ?? "",
    buildLabel: cfb2hMatch?.[1] ?? null,
    sessionId: fdrfjeMatch?.[1] ?? null,
  };
}
