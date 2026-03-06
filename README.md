# gemini-image-ts

Minimal, zero-dependency TypeScript client for generating images through Gemini's web interface — no official API key needed.

## Features

- 🖼️ **Image generation** via Gemini's web UI (reverse-engineered)
- 🎯 **Model selection** — choose between Pro and Flash
- 🍪 **Simple auth** — just provide your browser cookies
- 🔄 **Cookie rotation** — auto-refresh `__Secure-1PSIDTS` via Playwright
- 🎭 **Bot Detection Bypass** — routes traffic through a persistent Playwright browser to ensure a real Chrome TLS fingerprint
- 📦 **Minimal dependencies** — now requires `playwright` for all generation tasks
- 🔧 **Dual ESM/CJS** — works in any Node.js project

## Installation

```bash
pnpm add gemini-image-ts playwright
# or link locally
pnpm link
```

> [!IMPORTANT]
> **Requires Node.js 18+** and **Playwright**.
> All requests now run inside a headless Chromium instance to prevent `__Secure-1PSID` cookie invalidation.

## How it Works

Unlike other libraries that use raw `fetch` from Node.js, `gemini-image-ts` launches a headless browser on `client.init()`. This browser stays alive and is reused for all subsequent calls. By executing `fetch` calls inside the browser context, we inherit the real Chrome TLS fingerprint, headers, and behavior, making the automation indistinguishable from a real user.

## Getting Your Cookies

1. Go to [gemini.google.com](https://gemini.google.com) and log in
2. Open DevTools (**F12**) → **Network** tab → refresh the page
3. Click any request → find the **Cookie** header
4. Copy the values of `__Secure-1PSID` and `__Secure-1PSIDTS`

## Quick Start

### 1. Save your session
The easiest way to authenticate is to use the provided `save-session` script, which launches a visible browser for you to log in and saves your cookies to a JSON file.

```bash
pnpm save-session
```

### 2. Use the client
```typescript
import { GeminiClient } from "gemini-image-ts";
import path from "path";

const client = new GeminiClient({
  sessionPath: path.join(process.cwd(), "gemini-session.json"),
});

await client.init();

const result = await client.generate("Generate a picture of a sunset over mountains");

console.log(result.text);                // Text response
console.log(result.generatedImages);     // [GeneratedImage, ...]

// Save the first image
await result.generatedImages[0].save("sunset.jpg", client.page);
```

## Model Selection

Choose a model per-client or per-request:

```typescript
// Set default model for all requests
const client = new GeminiClient({
  cookies: { psid: "...", psidts: "..." },
  model: "flash",    // Nanobanana 2 (fast)
});

// Override per-request
const result = await client.generate("Generate a cat", {
  model: "pro",      // Nanobanana Pro (higher quality)
});

// Change default at runtime
client.setModel("pro");
```

### Available Models

| Name    | Key             | Engine         | Description      |
| ------- | --------------- | -------------- | ---------------- |
| Default | `"unspecified"` | —              | Gemini's default |
| Pro     | `"pro"`         | Nanobanana Pro | Higher quality   |
| Flash   | `"flash"`       | Nanobanana 2   | Fast generation  |

## API

### `new GeminiClient(options)`

| Option        | Type      | Default         | Description                               |
| ------------- | --------- | --------------- | ----------------------------------------- |
| `sessionPath` | `string`  | `undefined`     | Path to `storageState.json` (Recommended) |
| `cookies`     | `object`  | `undefined`     | Raw `{ psid, psidts }` cookies            |
| `timeout`     | `number`  | `60000`         | Request timeout in ms                     |
| `model`       | `string`  | `"unspecified"` | Default model                             |
| `headless`    | `boolean` | `true`          | Run browser in background                 |

### `client.init()`

Launches the Playwright browser and extracts the essential `SNlM0e` tokens. **Must be called before generating.**

### `client.generate(prompt, options?)`

Send a prompt and get back text + images.

### `GeneratedImage` object

Images returned in `generatedImages` are instances of the `GeneratedImage` class:

- `img.url`: Raw Google URL (requires auth).
- `await img.save(path, page)`: Download and save the image to disk.

## Session Management

`gemini-image-ts` handles cookie rotation automatically. If your `__Secure-1PSIDTS` cookie expires, the client will attempt to refresh it within the Playwright context and update your `sessionPath` file automatically.

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
