// Gemini web endpoints
export const ENDPOINTS = {
  /** Initial page load to extract SNlM0e token */
  INIT: "https://gemini.google.com/app",
  /** StreamGenerate endpoint for content generation */
  GENERATE:
    "https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate",
  /** Cookie rotation endpoint */
  ROTATE_COOKIES: "https://accounts.google.com/RotateCookies",
} as const;

/** Default headers matching the Gemini web app */
export const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
  Host: "gemini.google.com",
  Origin: "https://gemini.google.com",
  Referer: "https://gemini.google.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  "X-Same-Domain": "1",
};

/** Model configurations with their header overrides */
export const MODELS = {
  /** Default / unspecified model */
  unspecified: { name: "unspecified", headers: {} },
  /** Nanobanana Pro — higher quality image generation */
  pro: {
    name: "pro",
    headers: {
      "x-goog-ext-525001261-jspb":
        '[1,null,null,null,"e6fa609c3fa255c0",null,null,null,[4]]',
    },
  },
  /** Nanobanana 2 — fast image generation */
  flash: {
    name: "flash",
    headers: {
      "x-goog-ext-525001261-jspb":
        '[1,null,null,null,"56fdd199312815e2",null,null,null,[4]]',
    },
  },
} as const;

export type ModelName = keyof typeof MODELS;
