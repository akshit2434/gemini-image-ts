import { GeminiClient } from "../src/client.js";
import { extractMask } from "../src/watermark.js";
import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const maskDir = path.resolve(process.cwd(), "resources/masks");
  const sessionPath = path.resolve(process.cwd(), "../../gemini-session.json");

  console.log("🚀 Initializing Gemini Client...");
  const client = new GeminiClient({
    sessionPath,
    headless: true,
  });

  await client.init();

  try {
    console.log("🖼️ Generating pure black image for mask extraction...");
    // We use a specific prompt to get a pure black image.
    // "Generate a completely pure black image, no details, just #000000"
    const result = await client.generateImages("Generate a completely pure black image, hex #000000, no details, no texture, just absolute black.");

    if (result.generatedImages.length === 0) {
      throw new Error("No images generated.");
    }

    const image = result.generatedImages[0];
    console.log("📥 Downloading image...");
    const buffer = await image.download(client.page!);

    console.log("✂️ Extracting masks...");
    // Gemini images are usually 2048x2048 or 1536x1536, both use 96x96 mask.
    // We can also try to get a smaller one if needed, but 96 is most common.
    
    const mask96 = await extractMask(buffer, 96);
    await fs.writeFile(path.join(maskDir, "mask-96.png"), mask96);
    console.log("✅ Saved mask-96.png");

    // For 48x48, we might need a smaller image, but we can try to resize or just wait for a smaller gen.
    // Usually, we can just extract 48 from the same black image if the watermark scales.
    const mask48 = await extractMask(buffer, 48);
    await fs.writeFile(path.join(maskDir, "mask-48.png"), mask48);
    console.log("✅ Saved mask-48.png");

    console.log(`\n🎉 All masks saved to ${maskDir}`);
    console.log("You can now use `removeWatermark: true` or pass `maskDir` to GeminiClient.");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
  }
}

main();
