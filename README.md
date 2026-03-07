# gemini-image-ts

Minimal, lightweight TypeScript client for generating images through Gemini's web interface — no official API key needed.

## Features

- 🖼️ **Image generation** via Gemini's web UI (reverse-engineered)
- 💬 **Multi-turn conversation** — stateful chat sessions with context persistence
- 📁 **File Uploads** — attach images or documents for analysis
- 🎯 **Model selection** — choose between Pro and Flash
- 🍪 **Simple auth** — just provide your browser cookies
- 🔄 **Cookie rotation** — auto-refresh `__Secure-1PSIDTS` via Playwright
- 🎭 **Bot Detection Bypass** — routes traffic through a persistent Playwright browser with stealth plugins
- 📦 **Dependencies** — requires `playwright`, `playwright-extra`, and `puppeteer-extra-plugin-stealth`
- 🔧 **Dual ESM/CJS** — works in any Node.js project

## Installation

```bash
pnpm add gemini-image-ts playwright playwright-extra puppeteer-extra-plugin-stealth
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

### 2. Basic Image Generation
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

### 3. Stateful Chat (Multi-turn)
Keep track of conversation state with `ChatSession`.

```typescript
const chat = client.startChat();

// Turn 1
const res1 = await chat.sendMessage("Hi, I'm planning a trip to Japan.");
console.log(res1.text);

// Turn 2 - knows about Japan
const res2 = await chat.sendMessage("What are the best places to visit there?");
console.log(res2.text);
```

### 4. File Upload & Analysis
```typescript
const result = await client.generate("What is in this document?", {
  files: [path.resolve("./data.pdf")],
});

console.log(result.text);
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
- `options.files`: Array of absolute paths or Buffers.
- `options.metadata`: Optional `ConversationMetadata` for resuming sessions manually.

### `client.startChat(options?)`

Returns a `ChatSession` instance for multi-turn conversations.

### `ChatSession` functions
- `await chat.sendMessage(prompt, options?)`: Send a message in this session.
- `chat.getMetadata()`: Get the current conversation metadata (persist this to resume later).

### `GeneratedImage` object

Images returned in `generatedImages` are instances of the `GeneratedImage` class:

- `img.url`: Raw Google URL (requires auth).
- `img.alt`: Alt text describing the image.
- `img.metadata`: Original metadata for the image.
- `await img.save(path, page)`: Download and save the image to disk.

## Session Management

`gemini-image-ts` handles cookie rotation automatically. If your `__Secure-1PSIDTS` cookie expires, the client will attempt to refresh it within the Playwright context and update your `sessionPath` file automatically.

## Using in Next.js

```bash
# From this package directory:
npm link

# From your Next.js project:
pnpm add gemini-image-ts playwright-extra puppeteer-extra-plugin-stealth
```

### Next.js Configuration

Due to the use of browser automation and stealth plugins, you must exclude this package and its dependencies from Next.js bundling:

```ts
// next.config.ts
const nextConfig = {
  serverExternalPackages: [
    "gemini-image-ts",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth"
  ],
};
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
