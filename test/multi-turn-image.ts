import { GeminiClient } from "../src/index.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.join(__dirname, "../../../gemini-session.json");

async function runTest() {
  console.log("🚀 Starting Multi-turn Image Generation Test (Headless: false)...");

  const client = new GeminiClient({
    sessionPath,
    debug: true,
    headless: false, // Run with visible browser
  });

  try {
    await client.init();
    console.log("✅ Client initialized.");

    const chat = client.startChat();

    // --- STEP 1: Generate Initial Image ---
    const prompt1 = "Generate an image of a serene mountain lake at sunrise.";
    console.log(`\n[Step 1] Sending prompt: "${prompt1}"`);
    const res1 = await chat.sendMessage(prompt1);
    
    console.log("Response 1 Text:", res1.text);
    if (res1.generatedImages.length > 0) {
      console.log("✅ First image(s) generated:");
      res1.generatedImages.forEach((img, i) => {
        console.log(`  - Image ${i + 1}: ${img.url}`);
      });
    } else {
      console.warn("⚠️ No images found in the first response.");
    }

    // --- STEP 2: Edit the Image in the same chat ---
    const prompt2 = "Now add a small wooden cabin on the shore of the lake.";
    console.log(`\n[Step 2] Sending prompt: "${prompt2}" (using same chat session)`);
    const res2 = await chat.sendMessage(prompt2);

    console.log("Response 2 Text:", res2.text);
    if (res2.generatedImages.length > 0) {
      console.log("✅ Second image(s) (edited) generated:");
      res2.generatedImages.forEach((img, i) => {
        console.log(`  - Image ${i + 1}: ${img.url}`);
      });
    } else {
      console.warn("⚠️ No images found in the second response.");
    }

    console.log("\n✅ Multi-turn image generation test completed successfully.");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    // Keep browser open for a few seconds so user can see the result if they want
    console.log("Closing browser in 5 seconds...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    await client.close();
  }
}

runTest();
