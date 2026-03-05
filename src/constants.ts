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
  /** Gemini 3.0 Pro */
  "gemini-3.0-pro": {
    name: "gemini-3.0-pro",
    headers: {
      "x-goog-ext-525001261-jspb":
        '[1,null,null,null,"9d8ca3786ebdfbea",null,null,0,[4],null,null,1]',
    },
  },
  /** Gemini 3.0 Flash */
  "gemini-3.0-flash": {
    name: "gemini-3.0-flash",
    headers: {
      "x-goog-ext-525001261-jspb":
        '[1,null,null,null,"fbb127bbb056c959",null,null,0,[4],null,null,1]',
    },
  },
  /** Gemini 3.0 Flash Thinking */
  "gemini-3.0-flash-thinking": {
    name: "gemini-3.0-flash-thinking",
    headers: {
      "x-goog-ext-525001261-jspb":
        '[1,null,null,null,"5bf011840784117a",null,null,0,[4],null,null,1]',
    },
  },
} as const;

export type ModelName = keyof typeof MODELS;
