import fetch from "node-fetch";
import { ProviderError } from "../../models/Types";

/**
 * HTTP client for interacting with Claude API
 */
export class ClaudeClient {
  private readonly baseUrl = "https://api.anthropic.com/v1/messages";
  private readonly defaultModel = "claude-3-5-sonnet-20241022";
  private readonly defaultMaxTokens = 150;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-3-5-sonnet-20241022",
    private readonly maxTokens: number = 150
  ) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new ProviderError("Invalid Claude API key", "claude");
    }
  }

  /**
   * Send a message to Claude and get response
   */
  async sendMessage(prompt: string): Promise<string> {
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new ProviderError(
          `Claude API error: ${response.status} ${response.statusText}\n${errorBody}`,
          "claude",
          response.status
        );
      }

      const data = (await response.json()) as any;

      if (
        !data.content ||
        !Array.isArray(data.content) ||
        data.content.length === 0
      ) {
        throw new ProviderError(
          "Invalid response format from Claude API",
          "claude"
        );
      }

      return data.content[0].text;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      // Handle network errors, JSON parsing errors, etc.
      throw new ProviderError(
        `Failed to communicate with Claude API: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "claude"
      );
    }
  }

  /**
   * Test the connection to Claude API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.sendMessage('Test connection. Respond with: {"test": true}');
      return true;
    } catch (error) {
      console.error("Claude connection test failed:", error);
      return false;
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      model: this.model,
      maxTokens: this.maxTokens,
      baseUrl: this.baseUrl,
    };
  }
}
