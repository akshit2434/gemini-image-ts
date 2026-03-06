import fs from "fs";

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-infobars",
];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Strings that indicate Gemini returned a text-only response due to
 * an expired or invalid session.
 */
const EXPIRY_SIGNALS = [
  "signed out",
  "sign in",
  "can't create",
  "cannot create",
  "not available",
  "image creation isn't available",
  "can't seem to create",
  "i can't create that image",
  "creation is currently unavailable",
  "creation isn't available",
];

/**
 * Returns true if the Gemini text response indicates an expired session.
 */
export function isSessionExpired(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return EXPIRY_SIGNALS.some((signal) => lower.includes(signal));
}

/**
 * Interactive session saver — opens a visible Chrome window so the user
 * can log in to gemini.google.com manually. Saves the session to a JSON file.
 *
 * @param sessionPath - Where to save the session JSON.
 */
export async function saveSession(sessionPath: string): Promise<void> {
  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new Error(
      "playwright is required to save sessions. " +
        "Install it: pnpm add playwright"
    );
  }

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: STEALTH_ARGS,
  });

  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();
  await page.goto("https://gemini.google.com/app");

  console.log("\n✅ Log in to Google/Gemini in the browser if prompted.");
  console.log("✅ Make sure you can see the Gemini chat interface.");
  console.log("\nPress ENTER here when ready...\n");

  await new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });

  const dir = sessionPath.substring(0, sessionPath.lastIndexOf("/"));
  if (dir) fs.mkdirSync(dir, { recursive: true });

  await context.storageState({ path: sessionPath });

  const cookies = await context.cookies();
  type Cookie = { name: string; value: string };
  const psid = cookies.find((c: Cookie) => c.name === "__Secure-1PSID")?.value;
  const psidts = cookies.find((c: Cookie) => c.name === "__Secure-1PSIDTS")?.value;

  if (psid && psidts) {
    console.log(`✅ Session saved to ${sessionPath}`);
  } else {
    console.log("⚠️  Session saved but no PSID cookies found. Are you logged in?");
  }

  await browser.close();
}

/**
 * Proactively check if the session in sessionPath is still valid.
 * Launches a headless browser, loads storageState, and checks for SNlM0e.
 */
export async function isSessionValid(sessionPath: string): Promise<boolean> {
  if (!fs.existsSync(sessionPath)) return false;

  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new Error("playwright is required. Install it: pnpm add playwright");
  }

  const browser = await chromium.launch({
    headless: true,
    args: STEALTH_ARGS,
  });

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      storageState: sessionPath,
    });
    const page = await context.newPage();
    await page.goto("https://gemini.google.com/app", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const content = await page.content();
    return content.includes("SNlM0e");
  } catch (err) {
    return false;
  } finally {
    await browser.close();
  }
}

/**
 * Semi-automatic session recovery. Opens a headed browser for the user to log in,
 * polls for the SNlM0e token to appear (surviving navigations), then saves the session.
 */
export async function autoRecoverSession(sessionPath: string): Promise<void> {
  console.log("\n🔐 Session expired or not found. Opening browser for re-login...");
  console.log("👉 Log in to your Google account. The window will close automatically.\n");

  let chromium: typeof import("playwright").chromium;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    throw new Error("playwright is required. Install it: pnpm add playwright");
  }

  const browser = await chromium.launch({
    headless: false,
    args: ["--start-maximized", ...STEALTH_ARGS],
  });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    await page.goto("https://gemini.google.com/");

    // Poll every 2 seconds for up to 2 minutes
    // Survives navigation to accounts.google.com and back
    const deadline = Date.now() + 120_000;
    let found = false;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const url = page.url();
        // Only check when we're back on Gemini app, not on landing or login pages
        if (url.includes("gemini.google.com/app")) {
          const content = await page.content();
          // Check for the actual token JSON structure
          const hasToken = /"SNlM0e":\s*"[^"]+"/.test(content) || 
                           /'SNlM0e':\s*'[^']+'/.test(content) ||
                           /"SNlM0e",\s*null,\s*"[^"]+"/.test(content);
          
          if (hasToken) {
            found = true;
            break;
          }
        }
      } catch {
        // Page is mid-navigation, swallow and keep polling
      }
    }

    if (!found) {
      throw new Error("⏰ Login timed out after 2 minutes. Please try again.");
    }

    const dir = sessionPath.substring(0, sessionPath.lastIndexOf("/"));
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await context.storageState({ path: sessionPath });
    console.log("✅ Session saved. Resuming...\n");
  } finally {
    await browser.close();
  }
}
