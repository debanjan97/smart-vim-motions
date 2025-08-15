import { MotionRequest, MotionResponse, LLMCapabilities } from '../../models/Types';

/**
 * Interface that all LLM providers must implement
 */
export interface ILLMProvider {
  /**
   * Provider identification
   */
  readonly name: string;
  readonly version: string;
  readonly capabilities: LLMCapabilities;
  
  /**
   * Initialize the provider with configuration
   * @param config Provider-specific configuration object
   */
  initialize(config: Record<string, any>): Promise<void>;
  
  /**
   * Calculate vim motion using the LLM
   * @param request Motion calculation request
   * @returns Promise resolving to motion response
   */
  calculateMotion(request: MotionRequest): Promise<MotionResponse>;
  
  /**
   * Test if provider is properly configured and accessible
   * @returns Promise resolving to true if connection is successful
   */
  testConnection(): Promise<boolean>;
  
  /**
   * Get provider-specific configuration schema
   * @returns Configuration schema object
   */
  getConfigSchema(): Record<string, any>;
  
  /**
   * Cleanup resources when provider is no longer needed
   */
  dispose(): void;
}