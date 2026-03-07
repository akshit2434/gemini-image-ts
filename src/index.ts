// Main client
export { GeminiClient } from "./client.js";
export { ChatSession } from "./chat.js";

// Types
export type {
  GeminiClientOptions,
  GeminiCookies,
  GenerateOptions,
  WebImage,
  GenerateResult,
  SessionTokens,
  ConversationMetadata,
} from "./types.js";
export { GeneratedImage } from "./types.js";

// Session management (public API)
export { saveSession, isSessionExpired } from "./session.js";

// Errors
export { AuthError, APIError } from "./errors.js";

// Constants (for advanced usage)
export { MODELS, ENDPOINTS } from "./constants.js";
export type { ModelName } from "./constants.js";

// Utilities (manual override if needed)
export { extractTokensFromPage } from "./token.js";
