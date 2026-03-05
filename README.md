# gemini-image-ts

Minimal, zero-dependency TypeScript client for generating images through Gemini's web interface — no official API key needed.

## Features

- 🖼️ **Image generation** via Gemini's web UI (reverse-engineered)
- 🎯 **Model selection** — choose between Flash, Pro, and Flash Thinking
- 🍪 **Simple auth** — just provide your browser cookies
- 🔄 **Cookie rotation** — auto-refresh `__Secure-1PSIDTS`
- 📦 **Zero runtime dependencies** — only Node.js native `fetch`
- 🔧 **Dual ESM/CJS** — works in any Node.js project

## Installation

```bash
npm install gemini-image-ts
# or link locally
npm link
```

> **Requires Node.js 18+** (for native `fetch` support).

## Getting Your Cookies

1. Go to [gemini.google.com](https://gemini.google.com) and log in
2. Open DevTools (**F12**) → **Network** tab → refresh the page
3. Click any request → find the **Cookie** header
4. Copy the values of `__Secure-1PSID` and `__Secure-1PSIDTS`

## Quick Start

```typescript
import { GeminiClient } from "gemini-image-ts";

const client = new GeminiClient({
  cookies: {
    psid: process.env.GEMINI_PSID!,
    psidts: process.env.GEMINI_PSIDTS!,
  },
});

await client.init();

const result = await client.generate("Generate a picture of a sunset over mountains");

console.log(result.text);                // Text response
console.log(result.generatedImages);     // [{ url, title, alt }]
```

## Model Selection

Choose a model per-client or per-request:

```typescript
// Set default model for all requests
const client = new GeminiClient({
  cookies: { psid: "...", psidts: "..." },
  model: "gemini-3.0-flash",    // Flash (fast)
});

// Override per-request
const result = await client.generate("Generate a cat", {
  model: "gemini-3.0-pro",      // Pro (higher quality)
});

// Change default at runtime
client.setModel("gemini-3.0-flash-thinking");
```

### Available Models

| Name           | Key                           | Description                  |
| -------------- | ----------------------------- | ---------------------------- |
| Default        | `"unspecified"`               | Gemini's default model       |
| Flash          | `"gemini-3.0-flash"`          | Fast generation              |
| Pro            | `"gemini-3.0-pro"`            | Higher quality               |
| Flash Thinking | `"gemini-3.0-flash-thinking"` | Flash with visible reasoning |

## API

### `new GeminiClient(options)`

| Option    | Type               | Default         | Description              |
| --------- | ------------------ | --------------- | ------------------------ |
| `cookies` | `{ psid, psidts }` | *required*      | Your Gemini auth cookies |
| `timeout` | `number`           | `30000`         | Request timeout in ms    |
| `model`   | `string`           | `"unspecified"` | Default model            |

### `client.init()`

Fetches the CSRF token from Gemini's page. **Must be called before generating.**

### `client.generate(prompt, options?)`

Send a prompt and get back text + images.

```typescript
const result = await client.generate("Generate a cute cat", {
  model: "gemini-3.0-flash",  // optional per-request override
});

// result.text             → string
// result.generatedImages  → GeneratedImage[]
// result.webImages        → WebImage[]
```

### `client.refreshCookies()`

Rotate the `__Secure-1PSIDTS` cookie. Call this if you get auth errors.

### `client.setModel(model)` / `client.setCookies(cookies)`

Update the default model or cookies at runtime.

## Using in Next.js

```bash
# From this package directory:
npm link

# From your Next.js project:
npm link gemini-image-ts
```

Then import as usual:

```typescript
import { GeminiClient } from "gemini-image-ts";
```

## Environment Variables

Create a `.env` file:

```env
GEMINI_PSID=your___Secure-1PSID_value
GEMINI_PSIDTS=your___Secure-1PSIDTS_value
```

## License

MIT
