/**
 * Manual test script for gemini-image-ts
 *
 * Usage:
 *   1. Create a .env file in the implementation/ folder:
 *      GEMINI_PSID=your___Secure-1PSID_value
 *      GEMINI_PSIDTS=your___Secure-1PSIDTS_value
 *
 *   2. Run:
 *      npx tsx test/manual.ts
 */

import "dotenv/config";
import { GeminiClient } from "../src/index.js";

async function main() {
  const psid = process.env.GEMINI_PSID;
  const psidts = process.env.GEMINI_PSIDTS;

  if (!psid || !psidts) {
    console.error(
      "❌ Missing cookies. Set GEMINI_PSID and GEMINI_PSIDTS environment variables."
    );
    console.error(
      "\nHow to get them:\n" +
        "  1. Go to https://gemini.google.com and log in\n" +
        "  2. Open DevTools → Network tab → refresh the page\n" +
        "  3. Click any request → copy __Secure-1PSID and __Secure-1PSIDTS from Cookie header"
    );
    process.exit(1);
  }

  console.log("🔧 Creating client...");
  const client = new GeminiClient({
    cookies: { psid, psidts },
    timeout: 60_000,
  });

  console.log("🔑 Initializing (fetching access token)...");
  await client.init();
  console.log("✅ Client initialized successfully!\n");

  const prompt = "Generate an image of a cute cat wearing a tiny top hat";
  console.log(`📝 Prompt: "${prompt}"\n`);
  console.log("⏳ Generating...");

  const result = await client.generate(prompt);

  console.log("\n--- Text Response ---");
  console.log(result.text || "(no text)");

  if (result.generatedImages.length > 0) {
    console.log(`\n--- Generated Images (${result.generatedImages.length}) ---`);
    for (const img of result.generatedImages) {
      console.log(`  ${img.title}`);
      console.log(`  URL: ${img.url}`);
      console.log(`  Alt: ${img.alt || "(none)"}`);
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

  console.log("\n✅ Done!");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
