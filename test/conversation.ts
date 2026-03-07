import { GeminiClient } from "../src/index.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionPath = path.join(__dirname, "../../../gemini-session.json");

async function test() {
  console.log("🚀 Starting Complex Gemini Enhancement Test...");
  
  const client = new GeminiClient({
    sessionPath,
    debug: true,
  });

  try {
    await client.init();
    console.log("✅ Client initialized.");

    const testImagePath = path.join(__dirname, "../../../automation-dashboard/tmp/gemini-1772850985771-0.jpg");
    console.log(`Using test image: ${testImagePath}`);

    // --- SCENARIO 1: Session A ---
    console.log("\n[Scenario 1] Starting Session A...");
    const chatA = client.startChat();
    const resA1 = await chatA.sendMessage("Let's play a game. My secret code is 'ALPHA-99'. Don't forget it.");
    console.log("Session A Response 1:", resA1.text);
    const metadataA = chatA.metadata; // Save for later

    // --- SCENARIO 2: Session B (Interleaved) ---
    console.log("\n[Scenario 2] Starting Session B...");
    const chatB = client.startChat();
    const resB1 = await chatB.sendMessage("What is the capital of France?");
    console.log("Session B Response 1:", resB1.text);

    // --- SCENARIO 3: Resume Session A ---
    console.log("\n[Scenario 3] Resuming Session A...");
    const chatAResumed = client.startChat(metadataA);
    const resA2 = await chatAResumed.sendMessage("What was my secret code? Also, tell me what you see in this image.", {
      files: [testImagePath]
    });
    console.log("Session A Response 2 (Resumed):", resA2.text);

    if (resA2.text.includes("ALPHA-99")) {
      console.log("✅ Session A memory PERSISTED across interleaved Session B!");
    } else {
      console.warn("⚠️ Session A memory might have been lost.");
    }

    // --- SCENARIO 4: Session B follow-up ---
    console.log("\n[Scenario 4] Following up in Session B...");
    const resB2 = await chatB.sendMessage("And what's the capital of Germany?");
    console.log("Session B Response 2:", resB2.text);

    console.log("\n✅ Complex testing completed.");
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await client.close();
  }
}

test();
