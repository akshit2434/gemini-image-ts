/**
 * One-time setup: save your Gemini session to a JSON file.
 *
 * Usage:
 *   pnpm save-session
 * or:
 *   npx tsx scripts/save-session.ts [path/to/session.json]
 *
 * Default output: ../../gemini-session.json (monorepo root)
 */
import path from "path";
import { fileURLToPath } from "url";
import { saveSession } from "../src/session.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sessionPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(__dirname, "../../../gemini-session.json");

console.log(`📁 Saving session to: ${sessionPath}\n`);

saveSession(sessionPath)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Failed:", err.message);
    process.exit(1);
  });
