// Main client
export { GeminiClient } from "./client.js";

// Types
export type {
  GeminiClientOptions,
  GeminiCookies,
  GeneratedImage,
  GenerateOptions,
  WebImage,
  GenerateResult,
} from "./types.js";

// Errors
export { AuthError, APIError, TimeoutError } from "./errors.js";

// Constants (for advanced usage)
export { MODELS, ENDPOINTS } from "./constants.js";
export type { ModelName } from "./constants.js";

// Utilities (for advanced usage)
export { buildCookieHeader, rotatePsidts } from "./cookies.js";
export { fetchAccessToken } from "./token.js";
