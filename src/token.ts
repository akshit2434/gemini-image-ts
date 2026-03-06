import type { Page } from "playwright";
import { AuthError } from "./errors.js";
import type { SessionTokens } from "./types.js";

/**
 * Extract the SNlM0e access token, build label, and session ID from
 * the Gemini web app page using Playwright's page context.
 *
 * @throws {AuthError} If the tokens aren't found in the page.
 */
export async function extractTokensFromPage(
  page: Page
): Promise<SessionTokens> {
  // Wait a bit for the page to potentially load more scripts
  // and for the tokens to be injected into WIZ_global_data
  let tokens: any = null;
  const maxRetries = 5;
  
  for (let i = 0; i < maxRetries; i++) {
    tokens = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;

      const getMatch = (key: string) => {
        const regexes = [
          new RegExp(`"${key}":\\s*"(.*?)"`),
          new RegExp(`'${key}':\\s*'(.*?)'`),
          new RegExp(`"${key}",\\s*null,\\s*"(.*?)"`), // Sometimes in AF_initDataCallback
        ];
        for (const re of regexes) {
          const m = html.match(re);
          if (m?.[1]) return m[1];
        }
        return null;
      };

      const accessToken = getMatch("SNlM0e") || getMatch("snlM0e");
      const buildLabel = getMatch("cfb2h");
      const sessionId = getMatch("FdrFJe");

      // Debug: find keys in WIZ_global_data
      let wizKeys: string[] = [];
      if ((window as any).WIZ_global_data) {
        wizKeys = Object.keys((window as any).WIZ_global_data);
      }

      return {
        accessToken,
        buildLabel,
        sessionId,
        wizKeys,
        htmlSample: accessToken ? null : html.slice(0, 5000)
      };
    });

    if (tokens.accessToken) break;
    
    // If not found, wait 1 second and retry
    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!tokens.accessToken) {
    console.log(`[GeminiClient] ❌ FAILED to find SNlM0e after ${maxRetries} attempts.`);
    console.log(`[GeminiClient] WIZ_global_data keys: ${JSON.stringify(tokens.wizKeys)}`);
    // Check if we are on a landing page
    if (tokens.wizKeys.includes("GtQXDc") && !tokens.wizKeys.includes("SNlM0e")) {
      console.log(`[GeminiClient] ⚠️ Detected landing page structure without chat tokens. You might need to accept new terms or the session is partially restricted.`);
    }
    
    throw new AuthError(
      "Could not find SNlM0e (access token) in Gemini page. " +
        "Cookies may be invalid, expired, or the page failed to load correctly."
    );
  }

  console.log(`[GeminiClient] 🔑 Token check - SNlM0e: YES, buildLabel: ${tokens.buildLabel ? 'YES' : 'NO'}`);

  return {
    accessToken: tokens.accessToken,
    buildLabel: tokens.buildLabel,
    sessionId: tokens.sessionId,
  };
}
