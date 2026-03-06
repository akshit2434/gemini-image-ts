import { ENDPOINTS, DEFAULT_HEADERS, MODELS } from "./constants.js";
import type { ModelName } from "./constants.js";
import { AuthError, APIError } from "./errors.js";
import { parseFramedResponse, extractResult } from "./parser.js";
import { buildQueryParams, buildRequestBody } from "./payload.js";
import { extractTokensFromPage } from "./token.js";
import { isSessionExpired } from "./session.js";
import type {
  GeminiClientOptions,
  GeminiCookies,
  GenerateOptions,
  GenerateResult,
  SessionTokens,
} from "./types.js";
import type { Browser, BrowserContext, Page } from "playwright";

const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-infobars",
];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Minimal client for Gemini web image generation.
 * Now routes all requests through a headless Playwright browser to prevent session termination.
 */
export class GeminiClient {
  private cookies: GeminiCookies;
  private sessionPath: string | null;
  private timeout: number;
  private model: ModelName | string;
  private tokens: SessionTokens | null = null;
  private reqId: number;
  private debug: boolean;
  private headless: boolean;
  private onProgress?: (message: string) => void;

  public browser: Browser | null = null;
  public context: BrowserContext | null = null;
  public page: Page | null = null;

  constructor(options: GeminiClientOptions) {
    if (!options.sessionPath && !options.cookies) {
      throw new Error("GeminiClient requires either sessionPath or cookies.");
    }
    this.sessionPath = options.sessionPath ?? null;
    this.cookies = options.cookies ?? { psid: "", psidts: "" };
    this.timeout = options.timeout ?? 60_000;
    this.model = options.model ?? "unspecified";
    this.debug = options.debug ?? false;
    this.headless = options.headless ?? true;
    this.onProgress = options.onProgress;
    this.reqId = Math.floor(Math.random() * 90000) + 10000;
  }

  /**
   * Initialize the client by launching a headless browser and navigating to Gemini.
   * This extracts the necessary tokens while ensuring the session is seen as a real browser.
   */
  async init(): Promise<void> {
    let chromium: typeof import("playwright").chromium;
    try {
      const pw = await import("playwright");
      chromium = pw.chromium;
    } catch {
      throw new Error("playwright is required. Install it: pnpm add playwright");
    }

    if (!this.browser) {
      const startTime = Date.now();
      if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Launching browser (headless: ${this.headless})...`);
      this.onProgress?.("Launching browser...");
      this.browser = await chromium.launch({
        headless: this.headless,
        args: STEALTH_ARGS,
      });

      const contextOptions: any = {
        userAgent: USER_AGENT,
      };

      if (this.sessionPath) {
        contextOptions.storageState = this.sessionPath;
      }

      this.context = await this.browser.newContext(contextOptions);

      // If raw cookies were provided, set them in the context
      if (!this.sessionPath && this.cookies.psid) {
        await this.context.addCookies([
          { name: "__Secure-1PSID", value: this.cookies.psid, domain: ".google.com", path: "/" },
          { name: "__Secure-1PSIDTS", value: this.cookies.psidts, domain: ".google.com", path: "/" },
        ]);
      }

      this.page = await this.context.newPage();
    }

    // Optimization: Skip navigation if already on the app page
    const currentUrl = this.page!.url();
    if (currentUrl.includes("gemini.google.com/app")) {
      if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Already on Gemini app page, skipping navigation.`);
    } else {
      const navStart = Date.now();
      if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Navigating to Gemini app...`);
      this.onProgress?.("Navigating to Gemini...");
      await this.page!.goto("https://gemini.google.com/app", {
        waitUntil: "domcontentloaded",
        timeout: this.timeout,
      });
      if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Navigation took ${Date.now() - navStart}ms`);
    }

    // Extract tokens via Playwright
    if (this.debug) {
      const title = await this.page!.title();
      console.log(`[${new Date().toISOString()}] [GeminiClient] Page title: "${title}"`);
      console.log(`[${new Date().toISOString()}] [GeminiClient] Extracting session tokens...`);
    }
    const tokenStart = Date.now();
    this.onProgress?.("Extracting session tokens...");
    this.tokens = await extractTokensFromPage(this.page!);
    if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Tokens extracted successfully in ${Date.now() - tokenStart}ms`);
    
    // Update local cookies state from context (in case of rotation)
    const cookies = await this.context!.cookies();
    const psid = cookies.find((c) => c.name === "__Secure-1PSID")?.value;
    const psidts = cookies.find((c) => c.name === "__Secure-1PSIDTS")?.value;
    if (psid && psidts) {
      this.cookies = { psid, psidts };
      // If we have a session path, keep it updated
      if (this.sessionPath) {
        await this.context!.storageState({ path: this.sessionPath });
      }
    }
  }

  /**
   * Send a prompt to Gemini. All network traffic is routed through the Playwright page.
   */
  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    if (!this.tokens || !this.page) {
      throw new AuthError("Client not initialized. Call `await client.init()` first.");
    }

    const reqId = this.reqId;
    this.reqId += 100000;

    const params = buildQueryParams(reqId, this.tokens);
    const queryString = new URLSearchParams(params).toString();
    const url = `${ENDPOINTS.GENERATE}?${queryString}`;
    const body = buildRequestBody(prompt, this.tokens.accessToken);
    if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] 🚀 STARTING GENERATE - Prompt: "${prompt.slice(0, 50)}..."`);
    this.onProgress?.("Generating content...");

    const genStart = Date.now();

    const selectedModel = options?.model ?? this.model;
    const modelConfig =
      selectedModel in MODELS
        ? MODELS[selectedModel as ModelName]
        : MODELS.unspecified;

    const headers = {
      ...DEFAULT_HEADERS,
      ...modelConfig.headers,
    };

    if (this.debug) {
      console.log(`[GeminiClient] Generating with model: ${selectedModel}`);
      console.log(`[GeminiClient] URL: ${url}`);
    }

    try {
      // Ensure page is still alive, if not re-init
      if (!this.page || this.page.isClosed()) {
        if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Page closed or missing, re-initializing...`);
        await this.init();
      }

      // Execute the request INSIDE the browser context
      const rawText = await this.page!.evaluate(
        async ({ url, body, headers }) => {
          const response = await fetch(url, {
            method: "POST",
            headers,
            body,
          });

          if (!response.ok) {
            throw new Error(`Gemini request failed with status ${response.status}`);
          }

          return await response.text();
        },
        { url, body, headers }
      );

      const envelopes = parseFramedResponse(rawText);
      if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Initial API request took ${Date.now() - genStart}ms`);

      if (envelopes.length === 0) {
        throw new APIError("Empty response from Gemini.");
      }

      const result = extractResult(envelopes, this.cookies);

      if (this.debug) {
        console.log(`[${new Date().toISOString()}] [GeminiClient] Extracted text: "${result.text.slice(0, 100)}..."`);
        console.log(`[${new Date().toISOString()}] [GeminiClient] Found ${result.generatedImages.length} generated images.`);
      }

      // Auto-refresh and retry if session expired mid-run
      if (
        result.generatedImages.length === 0 &&
        isSessionExpired(result.text) &&
        !options?._isRetry
      ) {
        if (this.debug) {
          console.log("[GeminiClient] Session expiry detected in response text. Refreshing...");
        }
        await this.init();
        return this.generate(prompt, { ...options, _isRetry: true } as GenerateOptions);
      }

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new APIError(error.message);
      }
      throw error;
    }
  }

  /**
   * Close the browser instance.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.tokens = null;
    }
  }

  /**
   * Convenience method: auto-prepends "Generate image: " prefix.
   */
  async generateImages(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const IMAGE_PREFIX = "Generate image: ";
    const prefixed = prompt.trimStart().toLowerCase().startsWith(IMAGE_PREFIX.toLowerCase())
      ? prompt
      : `${IMAGE_PREFIX}${prompt}`;
    return this.generate(prefixed, options);
  }

  /** Update the model used for generation. */
  setModel(model: ModelName | string): void {
    this.model = model;
  }

  /** Update cookies (not recommended for sessionPath mode). */
  async setCookies(cookies: GeminiCookies): Promise<void> {
    this.cookies = { ...cookies };
    if (this.context) {
      await this.context.addCookies([
        { name: "__Secure-1PSID", value: this.cookies.psid, domain: ".google.com", path: "/" },
        { name: "__Secure-1PSIDTS", value: this.cookies.psidts, domain: ".google.com", path: "/" },
      ]);
    }
  }
}
