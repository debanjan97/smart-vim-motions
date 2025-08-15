import { ILLMProvider } from './ILLMProvider';
import { 
  LLMCapabilities, 
  MotionRequest, 
  MotionResponse, 
  ProviderError 
} from '../../models/Types';

/**
 * Abstract base class providing common functionality for LLM providers
 */
export abstract class BaseLLMProvider implements ILLMProvider {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly capabilities: LLMCapabilities;
  
  protected config: Record<string, any> = {};
  protected isInitialized = false;

  /**
   * Initialize the provider with configuration
   */
  async initialize(config: Record<string, any>): Promise<void> {
    this.config = { ...config };
    await this.validateConfig();
    this.isInitialized = true;
  }

  /**
   * Abstract methods that must be implemented by concrete providers
   */
  abstract calculateMotion(request: MotionRequest): Promise<MotionResponse>;
  abstract testConnection(): Promise<boolean>;
  abstract getConfigSchema(): Record<string, any>;

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.isInitialized = false;
    this.config = {};
  }

  /**
   * Validate provider-specific configuration
   * Override in concrete providers for custom validation
   */
  protected abstract validateConfig(): Promise<void>;

  /**
   * Check if provider is initialized
   */
  protected ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new ProviderError('Provider not initialized', this.name);
    }
  }

  /**
   * Build a standardized prompt for motion calculation
   * Can be overridden by providers for customization
   */
  protected buildPrompt(request: MotionRequest): string {
    const { context, codeContext, userLevel } = request;
    
    return `You are a vim expert helping a user learn efficient vim motions.

CONTEXT:
- User is currently at line ${context.currentPosition.line + 1}, column ${context.currentPosition.character + 1}
- They need to navigate to line ${context.targetPosition.line + 1}, column ${context.targetPosition.character + 1}
- Action needed: ${context.actionType}
- Language: ${codeContext.language}
- User level: ${userLevel}

CODE CONTEXT:
Current line: "${codeContext.currentLine}"
Target line: "${codeContext.targetLine}"

Surrounding code:
${codeContext.surroundingLines.slice(0, 10).join('\n')}

REQUIREMENTS:
- Suggest the most efficient vim motion sequence for a ${userLevel} user
- Consider code structure (functions, blocks, brackets, etc.)
- Prefer commonly-used motions over obscure ones
- Be concise but clear in explanation

RESPONSE FORMAT (JSON only):
{
  "keys": "5j2w",
  "explanation": "5 lines down, 2 words right",
  "confidence": 0.9
}`;
  }

  /**
   * Parse LLM response and extract motion information
   * Provides error handling and fallback responses
   */
  protected parseResponse(response: string): MotionResponse {
    try {
      // Extract JSON from response (handles cases where LLM adds extra text)
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!parsed.keys || typeof parsed.keys !== 'string') {
        throw new Error('Invalid or missing keys field');
      }

      return {
        keys: this.sanitizeKeys(parsed.keys),
        explanation: parsed.explanation || 'Move to target position',
        confidence: this.normalizeConfidence(parsed.confidence),
        calculatedAt: Date.now(),
        provider: this.name,
        alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : undefined
      };
      
    } catch (error) {
      console.error(`${this.name}: Failed to parse response:`, error);
      console.error(`${this.name}: Raw response:`, response);
      return this.getFallbackResponse();
    }
  }

  /**
   * Sanitize vim key sequence to ensure it's valid
   */
  private sanitizeKeys(keys: string): string {
    // Remove any non-vim characters and normalize
    return keys
      .replace(/[^0-9a-zA-Z{}()<>[\].,;:'"/?\\|`~!@#$%^&*+=_-]/g, '')
      .trim()
      .slice(0, 50); // Reasonable limit on key sequence length
  }

  /**
   * Normalize confidence score to be between 0 and 1
   */
  private normalizeConfidence(confidence: any): number {
    if (typeof confidence !== 'number') {
      return 0.5; // Default confidence
    }
    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * Generate a fallback response when parsing fails
   */
  protected getFallbackResponse(): MotionResponse {
    return {
      keys: 'j',
      explanation: 'Move down one line (fallback)',
      confidence: 0.3,
      calculatedAt: Date.now(),
      provider: this.name
    };
  }

  /**
   * Calculate a basic rule-based motion as fallback
   * Used when LLM providers fail
   */
  protected calculateBasicMotion(request: MotionRequest): MotionResponse {
    const { context } = request;
    const lineDiff = context.targetPosition.line - context.currentPosition.line;
    const colDiff = context.targetPosition.character - context.currentPosition.character;
    
    let keys = '';
    let explanation = '';
    
    // Vertical movement
    if (lineDiff > 0) {
      keys += `${lineDiff}j`;
      explanation += `${lineDiff} lines down`;
    } else if (lineDiff < 0) {
      keys += `${Math.abs(lineDiff)}k`;
      explanation += `${Math.abs(lineDiff)} lines up`;
    }
    
    // Horizontal movement
    if (colDiff > 0) {
      keys += `${colDiff}l`;
      explanation += (explanation ? ', ' : '') + `${colDiff} chars right`;
    } else if (colDiff < 0) {
      keys += `${Math.abs(colDiff)}h`;
      explanation += (explanation ? ', ' : '') + `${Math.abs(colDiff)} chars left`;
    }
    
    // Add action-specific commands
    if (context.actionType === 'insert') {
      keys += 'i';
      explanation += (explanation ? ', then ' : '') + 'insert mode';
    } else if (context.actionType === 'delete') {
      keys += 'x';
      explanation += (explanation ? ', then ' : '') + 'delete character';
    }
    
    return {
      keys: keys || 'j',
      explanation: explanation || 'Move down one line',
      confidence: 0.7,
      calculatedAt: Date.now(),
      provider: this.name
    };
  }
}