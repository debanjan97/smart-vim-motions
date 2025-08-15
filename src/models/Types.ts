/**
 * Core position interface matching VSCode's Position
 */
export interface Position {
  line: number;
  character: number;
}

/**
 * Context about a Cursor suggestion that was detected
 */
export interface SuggestionContext {
  id: string; // Unique identifier for this suggestion
  currentPosition: Position; // Where the cursor currently is
  targetPosition: Position; // Where the suggestion wants to make changes
  actionType: "insert" | "delete" | "replace";
  suggestionText: string; // The actual suggestion text
  documentUri: string; // Document URI
  timestamp: number; // When this suggestion was detected
}

/**
 * Code context around the suggestion for LLM understanding
 */
export interface CodeContext {
  currentLine: string; // Line where cursor currently is
  targetLine: string; // Line where suggestion targets
  surroundingLines: string[]; // Context lines with line numbers
  language: string; // Programming language
  fileName: string; // File name for context
}

/**
 * Request sent to LLM providers for motion calculation
 */
export interface MotionRequest {
  context: SuggestionContext;
  codeContext: CodeContext;
  userLevel: UserLevel;
}

/**
 * Response from LLM providers with vim motion
 */
export interface MotionResponse {
  keys: string; // Vim key sequence (e.g., "5j2w")
  explanation: string; // Human-readable explanation
  confidence: number; // 0-1 confidence score
  calculatedAt: number; // Timestamp of calculation
  provider: string; // Which provider generated this
  alternatives?: string[]; // Alternative motion sequences
}

/**
 * Cache entry for storing motion responses
 */
export interface CacheEntry {
  key: string;
  motion: MotionResponse;
  expiresAt: number;
  provider: string;
}

/**
 * User skill levels for vim
 */
export type UserLevel = "beginner" | "intermediate" | "advanced";

/**
 * Available LLM provider types
 */
export type ProviderType = "claude" | "openai" | "gemini" | "ollama";

/**
 * LLM provider capabilities
 */
export interface LLMCapabilities {
  supportsCodeContext: boolean; // Can handle code context in prompts
  maxContextLength: number; // Maximum context length in tokens
  supportsStreaming: boolean; // Supports streaming responses
  supportsBatch: boolean; // Supports batch requests
  costPerRequest?: number; // Estimated cost per request in cents
}

/**
 * Configuration for individual providers
 */
export interface ProviderConfig {
  claude?: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
  };
  openai?: {
    apiKey: string;
    model?: string;
    maxTokens?: number;
  };
  // Future provider configs...
}

/**
 * Main extension configuration
 */
export interface ExtensionConfig {
  enabled: boolean;

  // Provider settings
  activeProvider: ProviderType;
  providerConfigs: ProviderConfig;

  // UI settings
  hoverDelay: number; // Milliseconds before showing hint
  maxContextLines: number; // Lines of context to send to LLM
  userLevel: UserLevel;
  showDebugInfo: boolean;
  showAlternatives: boolean;

  // Performance settings
  cacheEnabled: boolean;
  maxCacheSize: number;
}

/**
 * Events that can be emitted by the extension
 */
export interface ExtensionEvents {
  providerChanged: (provider: ProviderType) => void;
  motionCalculated: (motion: MotionResponse) => void;
  suggestionDetected: (suggestion: SuggestionContext) => void;
  configChanged: (config: ExtensionConfig) => void;
}

/**
 * Error types specific to the extension
 */
export class VimTrainerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: string
  ) {
    super(message);
    this.name = "VimTrainerError";
  }
}

export class ProviderError extends VimTrainerError {
  constructor(
    message: string,
    provider: string,
    public readonly statusCode?: number
  ) {
    super(message, "PROVIDER_ERROR", provider);
    this.name = "ProviderError";
  }
}

export class ConfigurationError extends VimTrainerError {
  constructor(message: string, public readonly setting?: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigurationError";
  }
}
