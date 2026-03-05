import { ENDPOINTS, DEFAULT_HEADERS, MODELS } from "./constants.js";
import type { ModelName } from "./constants.js";
import { buildCookieHeader, rotatePsidts } from "./cookies.js";
import { AuthError, APIError } from "./errors.js";
import { parseFramedResponse, extractResult } from "./parser.js";
import { buildQueryParams, buildRequestBody } from "./payload.js";
import { fetchAccessToken } from "./token.js";
import type {
  GeminiClientOptions,
  GeminiCookies,
  GenerateOptions,
  GenerateResult,
  SessionTokens,
} from "./types.js";

/**
 * Minimal client for Gemini web image generation.
 *
 * @example
 * ```ts
 * const client = new GeminiClient({
 *   cookies: { psid: "YOUR_PSID", psidts: "YOUR_PSIDTS" },
 * });
 * await client.init();
 * const result = await client.generateImages("Generate a sunset over mountains");
 * console.log(result.generatedImages);
 * ```
 */
export class GeminiClient {
  private cookies: GeminiCookies;
  private timeout: number;
  private model: ModelName | string;
  private tokens: SessionTokens | null = null;
  private reqId: number;

  constructor(options: GeminiClientOptions) {
    this.cookies = { ...options.cookies };
    this.timeout = options.timeout ?? 30_000;
    this.model = options.model ?? "unspecified";
    this.reqId = Math.floor(Math.random() * 90000) + 10000;
  }

  /**
   * Initialize the client by fetching the SNlM0e access token and
   * session metadata from the Gemini page.
   *
   * Must be called before `generate()` or `generateImages()`.
   *
   * @throws {AuthError} If cookies are invalid or expired.
   */
  async init(): Promise<void> {
    this.tokens = await fetchAccessToken(this.cookies);
  }

  /**
   * Try to refresh the __Secure-1PSIDTS cookie.
   * Call this if you get auth errors after a long-running session.
   *
   * @returns The new PSIDTS value, or null if rotation failed.
   */
  async refreshCookies(): Promise<string | null> {
    const newPsidts = await rotatePsidts(this.cookies);
    if (newPsidts) {
      this.cookies.psidts = newPsidts;
    }
    return newPsidts;
  }

  /**
   * Send a prompt to Gemini and return the full result including
   * text, generated images, and web images.
   *
   * @param prompt - Text prompt to send
   * @param options - Optional overrides (e.g. model)
   *
   * @throws {AuthError} If client is not initialized.
   * @throws {APIError} If the request fails or response can't be parsed.
   */
  async generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    if (!this.tokens) {
      throw new AuthError(
        "Client not initialized. Call `await client.init()` first."
      );
    }

    const reqId = this.reqId;
    this.reqId += 100000;

    // Build query parameters
    const params = buildQueryParams(reqId, this.tokens);
    const queryString = new URLSearchParams(params).toString();
    const url = `${ENDPOINTS.GENERATE}?${queryString}`;

    // Build request body
    const body = buildRequestBody(prompt, this.tokens.accessToken);

    // Resolve model — per-request override takes priority over default
    const selectedModel = options?.model ?? this.model;
    const modelConfig =
      selectedModel in MODELS
        ? MODELS[selectedModel as ModelName]
        : MODELS.unspecified;

    // Make the request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...DEFAULT_HEADERS,
          ...modelConfig.headers,
          Cookie: buildCookieHeader(this.cookies),
        },
        body,
        signal: controller.signal,
        redirect: "follow",
      });

      if (!response.ok) {
        throw new APIError(
          `Gemini request failed with status ${response.status}`
        );
      }

      const rawText = await response.text();

      // Parse the framed response and extract results
      const envelopes = parseFramedResponse(rawText);

      if (envelopes.length === 0) {
        throw new APIError(
          "Empty response from Gemini. The response contained no parseable data."
        );
      }

      return extractResult(envelopes);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new APIError(
          `Request timed out after ${this.timeout}ms. Try increasing the timeout.`
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Convenience method: send a prompt and return only the generated images.
   * Shortcut for `generate(prompt, options)`.
   */
  async generateImages(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    return this.generate(prompt, options);
  }

  /**
   * Update the model used for generation.
   */
  setModel(model: ModelName | string): void {
    this.model = model;
  }

  /**
   * Update cookies (e.g. after manual refresh).
   */
  setCookies(cookies: GeminiCookies): void {
    this.cookies = { ...cookies };
  }
}
