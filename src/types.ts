import type { ModelName } from "./constants.js";

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
 */
export interface GeminiClientOptions {
  /** Authentication cookies */
  cookies: GeminiCookies;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Model to use (default: "unspecified") */
  model?: ModelName | string;
}

/**
 * A single generated image from Gemini.
 */
export interface GeneratedImage {
  /** Direct URL to the image */
  url: string;
  /** Image title (e.g. "[Generated Image 1]") */
  title: string;
  /** Alt text / description */
  alt: string;
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
}
