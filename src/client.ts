import { ENDPOINTS, DEFAULT_HEADERS, MODELS } from "./constants.js";
import type { ModelName } from "./constants.js";
import { AuthError, APIError } from "./errors.js";
import { parseFramedResponse, extractResult } from "./parser.js";
import { buildQueryParams, buildRequestBody } from "./payload.js";
import { extractTokensFromPage } from "./token.js";
import { isSessionExpired, isSessionValid, autoRecoverSession } from "./session.js";
import type {
  GeminiClientOptions,
  GeminiCookies,
  GenerateOptions,
  GenerateResult,
  SessionTokens,
  ConversationMetadata,
} from "./types.js";
import type { Browser, BrowserContext, Page } from "playwright";
import { ChatSession } from "./chat.js";

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
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private maskDir: string | null = null;

  public browser: Browser | null = null;
  public context: BrowserContext | null = null;
  public page: Page | null = null;

  private maxRetries: number;

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
    this.maxRetries = options.maxRetries ?? 3;
    this.maskDir = options.maskDir ?? null;
  }

  /**
   * Helper for exponential backoff.
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Initialize the client by launching a headless browser and navigating to Gemini.
   * This extracts the necessary tokens while ensuring the session is seen as a real browser.
   */
  async init(): Promise<void> {
    // Proactive session validation
    if (this.sessionPath) {
      const valid = await isSessionValid(this.sessionPath);
      if (!valid) {
        await autoRecoverSession(this.sessionPath);
      }
    }

    let chromium: any;
    try {
      const { chromium: chromiumExtra } = await import("playwright-extra");
      const { default: StealthPlugin } = await import("puppeteer-extra-plugin-stealth");
      chromium = chromiumExtra;
      chromium.use(StealthPlugin());
    } catch {
      throw new Error("playwright-extra and puppeteer-extra-plugin-stealth are required.");
    }

    if (!this.browser) {
      const startTime = Date.now();
      if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Launching browser (headless: ${this.headless})...`);
      this.onProgress?.("Launching browser...");
      const browser = await chromium.launch({
        headless: this.headless,
        args: STEALTH_ARGS,
      });
      this.browser = browser;

      const contextOptions: any = {
        userAgent: USER_AGENT,
      };

      if (this.sessionPath) {
        contextOptions.storageState = this.sessionPath;
      }

      const context = await browser.newContext(contextOptions);
      this.context = context;

      // If raw cookies were provided, set them in the context
      if (!this.sessionPath && this.cookies.psid) {
        await context.addCookies([
          { name: "__Secure-1PSID", value: this.cookies.psid, domain: ".google.com", path: "/" },
          { name: "__Secure-1PSIDTS", value: this.cookies.psidts, domain: ".google.com", path: "/" },
        ]);
      }

      this.page = await context.newPage();
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

    // Start keepalive
    this.startKeepalive();
  }

  /**
   * Start 8-minute keepalive to prevent session death.
   */
  private startKeepalive(): void {
    if (this.keepaliveTimer) return;

    this.keepaliveTimer = setInterval(async () => {
      if (!this.page || this.page.isClosed()) return;

      try {
        if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Running keepalive ping...`);
        
        // Lightweight GET with credentials
        await this.page.evaluate(async () => {
          await fetch("https://gemini.google.com/app", { credentials: "include" });
        });

        // Persist refreshed state
        if (this.sessionPath && this.context) {
          await this.context.storageState({ path: this.sessionPath });
          if (this.debug) console.log(`[${new Date().toISOString()}] [GeminiClient] Keepalive: Session state persisted to disk.`);
        }
      } catch (err) {
        if (this.debug) console.error("[GeminiClient] Keepalive failed:", err);
      }
    }, 8 * 60 * 1000); // 8 minutes
  }

  /**
   * Stop the keepalive timer.
   */
  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  /**
   * Fully re-launches context and page with fresh session state.
   */
  private async reinitContext(): Promise<void> {
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    
    const contextOptions: any = {
      userAgent: USER_AGENT,
    };

    if (this.sessionPath) {
      contextOptions.storageState = this.sessionPath;
    }

    this.context = await this.browser!.newContext(contextOptions);

    if (!this.sessionPath && this.cookies.psid) {
      await this.context.addCookies([
        { name: "__Secure-1PSID", value: this.cookies.psid, domain: ".google.com", path: "/" },
        { name: "__Secure-1PSIDTS", value: this.cookies.psidts, domain: ".google.com", path: "/" },
      ]);
    }

    this.page = await this.context.newPage();
    await this.page.goto("https://gemini.google.com/app", {
      waitUntil: "domcontentloaded",
      timeout: this.timeout,
    });

    // Re-extract tokens
    this.tokens = await extractTokensFromPage(this.page);
  }

  /**
   * Upload a file to Google's content-push service.
   */
  private async uploadFile(file: string | Buffer): Promise<string> {
    if (!this.page) throw new Error("Client not initialized.");

    let fileBuffer: Buffer;
    let fileName = "input_file.png";

    if (typeof file === "string") {
      const fs = await import("fs");
      const path = await import("path");
      fileBuffer = fs.readFileSync(file);
      fileName = path.basename(file);
    } else {
      fileBuffer = file;
    }

    const base64Content = fileBuffer.toString("base64");
    
    // Simple MIME type detection by extension
    let mimeType = "application/octet-stream";
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'pdf') mimeType = 'application/pdf';
    else if (ext === 'txt') mimeType = 'text/plain';
    else if (ext === 'md') mimeType = 'text/markdown';
    else if (ext === 'doc' || ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    if (this.debug) console.log(`[GeminiClient] Uploading file: ${fileName} (${fileBuffer.length} bytes)`);

    const uploadUrl = "https://content-push.googleapis.com/upload";
    const result = await this.page.evaluate(
      async ({ url, base64, name, mime }) => {
        const bin = atob(base64);
        const uint8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) uint8[i] = bin.charCodeAt(i);
        const blob = new Blob([uint8], { type: mime });

        const formData = new FormData();
        formData.append("file", blob, name);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Push-ID": "feeds/mcudyrk2a4khkz",
          },
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`);
        }

        return await response.text();
      },
      { url: uploadUrl, base64: base64Content, name: fileName, mime: mimeType }
    );

    if (this.debug) console.log(`[GeminiClient] File uploaded successfully. ID: ${result}`);
    return result;
  }

  /**
   * Send a prompt to Gemini. All network traffic is routed through the Playwright page.
   * Includes automated retries for transient errors.
   */
  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    let lastError: Error | null = null;
    let attempt = 0;
    const maxRetries = options?.maxRetries ?? this.maxRetries;

    while (attempt <= maxRetries) {
      if (attempt > 0) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
        if (this.debug) console.log(`[GeminiClient] Retry attempt ${attempt}/${maxRetries} in ${backoff}ms...`);
        await this.sleep(backoff);
      }

      try {
        return await this._generateInternal(prompt, options);
      } catch (error: any) {
        lastError = error;
        attempt++;

        const errorMsg = error.message?.toLowerCase() ?? "";
        const isRetriable = 
          errorMsg.includes("failed to fetch") || 
          errorMsg.includes("status 429") || 
          errorMsg.includes("empty response") ||
          errorMsg.includes("snlm0e not found") ||
          errorMsg.includes("status 401") ||
          errorMsg.includes("status 403");

        if (!isRetriable || attempt > maxRetries) {
          break;
        }

        if (this.debug) console.log(`[GeminiClient] Encountered retriable error: ${error.message}`);
        
        // If it's a session/auth error, try to refresh tokens before retrying
        if (errorMsg.includes("snlm0e") || errorMsg.includes("401") || errorMsg.includes("403")) {
          if (this.debug) console.log("[GeminiClient] Attempting session recovery before retry...");
          try {
            if (this.sessionPath) await autoRecoverSession(this.sessionPath);
            await this.reinitContext();
          } catch (recoveryError) {
            if (this.debug) console.error("[GeminiClient] Session recovery failed:", recoveryError);
          }
        }
      }
    }

    throw lastError ?? new APIError("Generation failed after multiple attempts.");
  }

  /**
   * Internal generation logic.
   */
  private async _generateInternal(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    if (!this.tokens || !this.page) {
      throw new AuthError("Client not initialized. Call `await client.init()` first.");
    }

    const reqId = this.reqId;
    this.reqId += 100000;

    let fileData: any[] | undefined = undefined;
    if (options?.files && options.files.length > 0) {
      if (this.debug) console.log(`[GeminiClient] Handling ${options.files.length} file attachments...`);
      const fileUrls = await Promise.all(options.files.map((f) => this.uploadFile(f)));
      fileData = fileUrls.map((url, i) => {
          const name = typeof options.files![i] === 'string' 
            ? (options.files![i] as string).split('/').pop() 
            : `file_${i}.png`;
          return [[url], name];
      });
    }

    const params = buildQueryParams(reqId, this.tokens);
    const queryString = new URLSearchParams(params).toString();
    const url = `${ENDPOINTS.GENERATE}?${queryString}`;
    const body = buildRequestBody(prompt, this.tokens.accessToken, fileData, options?.metadata);
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

    const result = extractResult(envelopes, this.cookies, this.maskDir ?? undefined);

    if (this.debug) {
      console.log(`[${new Date().toISOString()}] [GeminiClient] Extracted text: "${result.text.slice(0, 100)}..."`);
      console.log(`[${new Date().toISOString()}] [GeminiClient] Found ${result.generatedImages.length} generated images.`);
    }

    // Auto-refresh and retry if session expired mid-run
    if (
      result.generatedImages.length === 0 &&
      isSessionExpired(result.text)
    ) {
      throw new AuthError("Session expiry detected in response text.");
    }


    return result;
  }


  /**
   * Close the browser instance.
   */
  async close(): Promise<void> {
    this.stopKeepalive();
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

  /**
   * Start a new multi-turn chat session.
   */
  startChat(metadata?: ConversationMetadata): ChatSession {
    return new ChatSession(this, metadata);
  }
}
