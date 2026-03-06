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
