/**
 * Manual test script for gemini-image-ts
 *
 * Usage:
 *   1. Run `pnpm save-session` once to create gemini-session.json
 *   2. Run: pnpm test
 */

import path from "path";
import { fileURLToPath } from "url";
import { GeminiClient } from "../src/index.js";

declare const process: any;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = path.resolve(__dirname, "../../../gemini-session.json");

async function main() {
  console.log("🔧 Creating client...");
  const client = new GeminiClient({
    sessionPath: SESSION_PATH,
    model: "flash",
    timeout: 90_000,
    headless: true,
    onProgress: (msg) => console.log(`  [Progress] ${msg}`),
  });

  console.log("🔑 Initializing (loading session + fetching access token)...");
  await client.init();
  console.log("✅ Client initialized successfully!\n");

  const prompt = "Generate an image of a cute cat wearing a tiny top hat";
  console.log(`📝 Prompt: "${prompt}"\n`);
  console.log("⏳ Generating...");

  const result = await client.generateImages(prompt);

  console.log("\n--- Text Response ---");
  console.log(result.text || "(no text)");

  if (result.generatedImages.length > 0) {
    console.log(`\n--- Generated Images (${result.generatedImages.length}) ---`);
    for (const img of result.generatedImages) {
      console.log(`  ${img.title}`);
      console.log(`  URL: ${img.url}`);
      console.log(`  Alt: ${img.alt || "(none)"}`);

      // Test download()
      process.stdout.write(`  Downloading...`);
      const buffer = await img.download(client.page!);
      console.log(` ${buffer.length} bytes ✅`);
      console.log();
    }
  } else {
    console.log("\n⚠️  No generated images in response.");
  }

  if (result.webImages.length > 0) {
    console.log(`\n--- Web Images (${result.webImages.length}) ---`);
    for (const img of result.webImages) {
      console.log(`  ${img.title}: ${img.url}`);
    }
  }
  await client.close();
  console.log("\n✅ Done!");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
