import { ILLMProvider } from "./base/ILLMProvider";
import { ClaudeProvider } from "./claude/ClaudeProvider";
import { ProviderType, ProviderError } from "../models/Types";

// Future imports when we add more providers:
// import { OpenAIProvider } from './openai/OpenAIProvider';
// import { GeminiProvider } from './gemini/GeminiProvider';

/**
 * Factory for creating and managing LLM provider instances
 */
export class ProviderFactory {
  private static providers = new Map<ProviderType, new () => ILLMProvider>();
  private static instances = new Map<string, ILLMProvider>();

  /**
   * Static initialization - register all available providers
   */
  static {
    // Register currently available providers
    this.registerProvider("claude", ClaudeProvider);

    // Future provider registrations:
    // this.registerProvider('openai', OpenAIProvider);
    // this.registerProvider('gemini', GeminiProvider);
    // this.registerProvider('ollama', OllamaProvider);
  }

  /**
   * Register a new LLM provider type
   * @param type Provider type identifier
   * @param providerClass Provider implementation class
   */
  static registerProvider(
    type: ProviderType,
    providerClass: new () => ILLMProvider
  ): void {
    this.providers.set(type, providerClass);
    console.log(`Vim Motion Trainer: Registered provider '${type}'`);
  }

  /**
   * Unregister a provider type
   * @param type Provider type to remove
   */
  static unregisterProvider(type: ProviderType): void {
    // Clean up any existing instances of this provider type
    for (const [key, instance] of this.instances.entries()) {
      if (key.startsWith(`${type}_`)) {
        instance.dispose();
        this.instances.delete(key);
      }
    }

    this.providers.delete(type);
    console.log(`Vim Motion Trainer: Unregistered provider '${type}'`);
  }

  /**
   * Get list of available provider types
   * @returns Array of registered provider types
   */
  static getAvailableProviders(): ProviderType[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider type is available
   * @param type Provider type to check
   * @returns True if provider is registered
   */
  static isProviderAvailable(type: ProviderType): boolean {
    return this.providers.has(type);
  }

  /**
   * Create and initialize a provider instance
   * @param type Provider type
   * @param config Provider configuration
   * @returns Initialized provider instance
   */
  static async createProvider(
    type: ProviderType,
    config: Record<string, any>
  ): Promise<ILLMProvider> {
    // Create instance key for caching
    const configHash = this.hashConfig(config);
    const instanceKey = `${type}_${configHash}`;

    // Return existing instance if available and valid
    const existingInstance = this.instances.get(instanceKey);
    if (existingInstance) {
      // Test if existing instance is still working
      try {
        const isWorking = await existingInstance.testConnection();
        if (isWorking) {
          console.log(
            `Vim Motion Trainer: Reusing existing ${type} provider instance`
          );
          return existingInstance;
        } else {
          // Remove broken instance
          existingInstance.dispose();
          this.instances.delete(instanceKey);
        }
      } catch (error) {
        console.warn(
          `Vim Motion Trainer: Existing ${type} provider failed test:`,
          error
        );
        existingInstance.dispose();
        this.instances.delete(instanceKey);
      }
    }

    // Create new instance
    const ProviderClass = this.providers.get(type);
    if (!ProviderClass) {
      throw new ProviderError(`Unknown provider type: ${type}`, type);
    }

    console.log(`Vim Motion Trainer: Creating new ${type} provider instance`);

    try {
      const provider = new ProviderClass();
      await provider.initialize(config);

      // Test the new provider
      const isWorking = await provider.testConnection();
      if (!isWorking) {
        provider.dispose();
        throw new ProviderError(
          `Provider ${type} failed connection test`,
          type
        );
      }

      // Cache the working instance
      this.instances.set(instanceKey, provider);
      console.log(`Vim Motion Trainer: Successfully created ${type} provider`);

      return provider;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }

      throw new ProviderError(
        `Failed to create ${type} provider: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        type
      );
    }
  }

  /**
   * Get provider information without creating an instance
   * @param type Provider type
   * @returns Provider metadata
   */
  static getProviderInfo(type: ProviderType): {
    name: string;
    version: string;
    capabilities: any;
    configSchema: any;
  } {
    const ProviderClass = this.providers.get(type);
    if (!ProviderClass) {
      throw new ProviderError(`Unknown provider type: ${type}`, type);
    }

    // Create temporary instance to get metadata
    const tempProvider = new ProviderClass();
    const info = {
      name: tempProvider.name,
      version: tempProvider.version,
      capabilities: tempProvider.capabilities,
      configSchema: tempProvider.getConfigSchema(),
    };

    // Clean up temporary instance
    tempProvider.dispose();

    return info;
  }

  /**
   * Get information about all available providers
   * @returns Array of provider information objects
   */
  static getAllProviderInfo(): Array<{
    type: ProviderType;
    name: string;
    version: string;
    capabilities: any;
    configSchema: any;
  }> {
    return this.getAvailableProviders().map((type) => ({
      type,
      ...this.getProviderInfo(type),
    }));
  }

  /**
   * Get statistics about current provider instances
   * @returns Usage statistics
   */
  static getInstanceStats(): {
    totalInstances: number;
    providerCounts: Record<string, number>;
    oldestInstance: Date | null;
  } {
    const providerCounts: Record<string, number> = {};
    let oldestTimestamp = Infinity;

    for (const key of this.instances.keys()) {
      const providerType = key.split("_")[0];
      providerCounts[providerType] = (providerCounts[providerType] || 0) + 1;

      // Extract timestamp from key if available
      const timestamp = parseInt(key.split("_").pop() || "0");
      if (timestamp > 0 && timestamp < oldestTimestamp) {
        oldestTimestamp = timestamp;
      }
    }

    return {
      totalInstances: this.instances.size,
      providerCounts,
      oldestInstance:
        oldestTimestamp === Infinity ? null : new Date(oldestTimestamp),
    };
  }

  /**
   * Clean up unused provider instances
   * @param maxAge Maximum age in milliseconds (default: 1 hour)
   */
  static cleanupInstances(maxAge: number = 60 * 60 * 1000): void {
    const now = Date.now();
    const instancesToRemove: string[] = [];

    for (const [key, instance] of this.instances.entries()) {
      // Extract timestamp from key
      const parts = key.split("_");
      const timestamp = parseInt(parts[parts.length - 1] || "0");

      if (timestamp > 0 && now - timestamp > maxAge) {
        instancesToRemove.push(key);
        instance.dispose();
      }
    }

    for (const key of instancesToRemove) {
      this.instances.delete(key);
    }

    if (instancesToRemove.length > 0) {
      console.log(
        `Vim Motion Trainer: Cleaned up ${instancesToRemove.length} old provider instances`
      );
    }
  }

  /**
   * Dispose of all provider instances
   * Called when extension is deactivated
   */
  static dispose(): void {
    console.log(
      `Vim Motion Trainer: Disposing ${this.instances.size} provider instances`
    );

    for (const provider of this.instances.values()) {
      try {
        provider.dispose();
      } catch (error) {
        console.error("Error disposing provider:", error);
      }
    }

    this.instances.clear();
  }

  /**
   * Hash configuration object for instance caching
   * @param config Configuration object
   * @returns Hash string
   */
  private static hashConfig(config: Record<string, any>): string {
    // Create a stable hash of the configuration
    const configString = JSON.stringify(config, Object.keys(config).sort());
    let hash = 0;

    for (let i = 0; i < configString.length; i++) {
      const char = configString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36) + "_" + Date.now();
  }
}
