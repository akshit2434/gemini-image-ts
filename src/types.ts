import type { ModelName } from "./constants.js";
import type { Page } from "playwright";

/**
 * Cookie values required to authenticate with Gemini.
 */
export interface GeminiCookies {
  /** __Secure-1PSID cookie value */
  psid: string;
  /** __Secure-1PSIDTS cookie value */
  psidts: string;
}

/**
 * Options for initializing the GeminiClient.
 * Provide either `sessionPath` (recommended) or raw `cookies`.
 */
export interface GeminiClientOptions {
  /**
   * Path to a Playwright storageState JSON file created by `saveSession()`.
   * When provided, the client automatically loads and refreshes cookies from
   * this file — no manual cookie management needed.
   */
  sessionPath?: string;
  /**
   * Raw authentication cookies. Use this if you manage cookies yourself.
   * Not needed when `sessionPath` is provided.
   */
  cookies?: GeminiCookies;
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Model to use (default: "unspecified") */
  model?: ModelName | string;
  /** Enable debug logging (default: false) */
  debug?: boolean;
  /** Run browser in headless mode (default: true) */
  headless?: boolean;
  /** Callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * A single generated image from Gemini.
 * Holds the session cookies needed to download the image bytes.
 */
export class GeneratedImage {
  /** Direct URL to the image (requires auth cookies to access) */
  readonly url: string;
  /** Image title (e.g. "[Generated Image 1]") */
  readonly title: string;
  /** Alt text / description */
  readonly alt: string;
  /** Cookies needed to download this image */
  private readonly cookies: GeminiCookies;

  constructor(opts: { url: string; title: string; alt: string; cookies: GeminiCookies }) {
    this.url = opts.url;
    this.title = opts.title;
    this.alt = opts.alt;
    this.cookies = opts.cookies;
  }

  /**
   * Download the image and return the raw bytes as a Buffer.
   * Routes the download through Playwright's request context to inherit the 
   * Chrome TLS fingerprint and cookies while bypassing CORS.
   *
   * @param page - Playwright Page instance (required for authenticated download).
   */
  async download(page?: Page): Promise<Buffer> {
    if (!page) {
      throw new Error("Playwright Page is required for authenticated download.");
    }

    const response = await page.context().request.get(this.url, {
      headers: {
        "Referer": "https://gemini.google.com/",
      }
    });

    if (!response.ok()) {
      throw new Error(`Failed to download image: HTTP ${response.status()}`);
    }

    const buffer = await response.body();
    return buffer;
  }

  /**
   * Download the image and save it to the given file path.
   * @param filePath - Absolute or relative path to write the image to.
   * @param page - Optional Playwright Page for the download.
   */
  async save(filePath: string, page?: Page): Promise<void> {
    const { writeFile } = await import("fs/promises");
    const buffer = await this.download(page);
    await writeFile(filePath, buffer);
  }

  toJSON() {
    return { url: this.url, title: this.title, alt: this.alt };
  }
}

/**
 * A single web image from Gemini search results.
 */
export interface WebImage {
  /** Direct URL to the image */
  url: string;
  /** Image title */
  title: string;
  /** Alt text / description */
  alt: string;
}

/**
 * Result from a content generation request.
 */
export interface GenerateResult {
  /** Text response from the model */
  text: string;
  /** AI-generated images */
  generatedImages: GeneratedImage[];
  /** Web images found by the model */
  webImages: WebImage[];
}

/**
 * Internal session state after initialization.
 */
export interface SessionTokens {
  /** SNlM0e CSRF token */
  accessToken: string;
  /** cfb2h build label */
  buildLabel: string | null;
  /** FdrFJe session ID */
  sessionId: string | null;
}

/**
 * Options for a single generate() call.
 */
export interface GenerateOptions {
  /** Override the model for this request (e.g. "gemini-3.0-flash", "gemini-3.0-pro") */
  model?: ModelName | string;
  /** @internal */
  _isRetry?: boolean;
}
