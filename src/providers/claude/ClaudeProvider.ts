import { BaseLLMProvider } from "../base/BaseLLMProvider";
import {
  LLMCapabilities,
  MotionRequest,
  MotionResponse,
  ProviderError,
} from "../../models/Types";
import { ClaudeClient } from "./ClaudeClient";

/**
 * Claude provider implementation for vim motion calculation
 */
export class ClaudeProvider extends BaseLLMProvider {
  readonly name = "claude";
  readonly version = "3.5-sonnet";
  readonly capabilities: LLMCapabilities = {
    supportsCodeContext: true,
    maxContextLength: 200000,
    supportsStreaming: false,
    supportsBatch: false,
    costPerRequest: 0.3, // Approximately 30 cents per 1M tokens
  };

  private client?: ClaudeClient;

  /**
   * Initialize Claude provider with configuration
   */
  async initialize(config: Record<string, any>): Promise<void> {
    await super.initialize(config);

    this.client = new ClaudeClient(
      config.apiKey,
      config.model || "claude-3-5-sonnet-20241022",
      config.maxTokens || 150
    );
  }

  /**
   * Calculate vim motion using Claude
   */
  async calculateMotion(request: MotionRequest): Promise<MotionResponse> {
    this.ensureInitialized();

    if (!this.client) {
      throw new ProviderError("Claude client not initialized", this.name);
    }

    const prompt = this.buildClaudePrompt(request);

    try {
      const response = await this.client.sendMessage(prompt);
      return this.parseResponse(response);
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      console.error("Claude provider calculation error:", error);

      // Return basic motion as fallback
      return this.calculateBasicMotion(request);
    }
  }

  /**
   * Test connection to Claude API
   */
  async testConnection(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    return await this.client.testConnection();
  }

  /**
   * Get Claude-specific configuration schema
   */
  getConfigSchema(): Record<string, any> {
    return {
      apiKey: {
        type: "string",
        required: true,
        secure: true,
        description:
          "Claude API key from Anthropic console (https://console.anthropic.com/)",
      },
      model: {
        type: "string",
        required: false,
        default: "claude-3-5-sonnet-20241022",
        options: [
          "claude-3-5-sonnet-20241022",
          "claude-3-haiku-20240307",
          "claude-3-opus-20240229",
        ],
        description: "Claude model to use for motion calculation",
      },
      maxTokens: {
        type: "number",
        required: false,
        default: 150,
        min: 50,
        max: 1000,
        description: "Maximum tokens in response",
      },
    };
  }

  /**
   * Validate Claude-specific configuration
   */
  protected async validateConfig(): Promise<void> {
    if (!this.config.apiKey) {
      throw new ProviderError("Claude API key is required", this.name);
    }

    if (typeof this.config.apiKey !== "string") {
      throw new ProviderError("Claude API key must be a string", this.name);
    }

    if (this.config.apiKey.length < 20) {
      throw new ProviderError(
        "Claude API key appears to be invalid (too short)",
        this.name
      );
    }

    // Validate model if provided
    if (this.config.model) {
      const validModels = [
        "claude-3-5-sonnet-20241022",
        "claude-3-haiku-20240307",
        "claude-3-opus-20240229",
      ];

      if (!validModels.includes(this.config.model)) {
        throw new ProviderError(
          `Invalid Claude model: ${
            this.config.model
          }. Valid models: ${validModels.join(", ")}`,
          this.name
        );
      }
    }

    // Validate maxTokens if provided
    if (this.config.maxTokens) {
      if (
        typeof this.config.maxTokens !== "number" ||
        this.config.maxTokens < 50 ||
        this.config.maxTokens > 1000
      ) {
        throw new ProviderError(
          "Claude maxTokens must be a number between 50 and 1000",
          this.name
        );
      }
    }
  }

  /**
   * Build Claude-optimized prompt for vim motion calculation
   */
  private buildClaudePrompt(request: MotionRequest): string {
    const basePrompt = this.buildPrompt(request);

    // Add Claude-specific optimizations
    const claudeSpecific = `

CLAUDE-SPECIFIC INSTRUCTIONS:
- Focus on practical, commonly-used vim motions that work in most vim/neovim setups
- Consider code structure when suggesting motions (use }, ), ], etc. for code blocks)
- For ${request.userLevel} users, prefer ${this.getMotionComplexityHint(
      request.userLevel
    )}
- Always respond with valid JSON only - no additional text before or after
- Ensure the "keys" field contains only valid vim keystrokes`;

    return basePrompt + claudeSpecific;
  }

  /**
   * Get motion complexity hint based on user level
   */
  private getMotionComplexityHint(userLevel: string): string {
    switch (userLevel) {
      case "beginner":
        return "basic motions (h,j,k,l with counts, 0, $)";
      case "intermediate":
        return "word motions (w,b,e), search (f,t), and simple text objects";
      case "advanced":
        return "complex motions, text objects, marks, and efficient combinations";
      default:
        return "intermediate-level motions";
    }
  }

  /**
   * Enhanced response parsing for Claude
   */
  protected parseResponse(response: string): MotionResponse {
    const motion = super.parseResponse(response);

    // Add Claude-specific post-processing if needed
    // For example, we could validate that the keys make sense for the context

    return motion;
  }
}
