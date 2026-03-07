import type { GeminiClient } from "./client.js";
import type { GenerateOptions, GenerateResult, ConversationMetadata } from "./types.js";

/**
 * Manages a multi-turn conversation with Gemini.
 * Stores and automatically updates conversation metadata (cid, rid, rcid).
 */
export class ChatSession {
  private client: GeminiClient;
  public metadata: ConversationMetadata | undefined;
  public lastResult: GenerateResult | null = null;

  constructor(client: GeminiClient, metadata?: ConversationMetadata) {
    this.client = client;
    this.metadata = metadata;
  }

  /**
   * Send a message in the current conversation.
   * automatically includes and updates conversation metadata.
   */
  async sendMessage(prompt: string, options?: GenerateOptions): Promise<GenerateResult> {
    const combinedOptions: GenerateOptions = {
      ...options,
      metadata: this.metadata,
    };

    const result = await this.client.generate(prompt, combinedOptions);
    
    if (result.metadata) {
      this.metadata = result.metadata;
    }
    
    this.lastResult = result;
    return result;
  }

  /**
   * Reset the session metadata to start a fresh conversation.
   */
  reset(): void {
    this.metadata = undefined;
    this.lastResult = null;
  }
}
