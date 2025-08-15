import * as vscode from 'vscode';
import { ExtensionConfig, ProviderType, UserLevel, ConfigurationError } from '../models/Types';

/**
 * Manages extension configuration through VSCode settings
 */
export class ConfigManager {
  private static readonly CONFIG_SECTION = 'vimMotionTrainer';
  private configChangeEmitter = new vscode.EventEmitter<ExtensionConfig>();
  private disposables: vscode.Disposable[] = [];

  /**
   * Event fired when configuration changes
   */
  readonly onConfigChanged = this.configChangeEmitter.event;

  constructor() {
    // Listen for configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(ConfigManager.CONFIG_SECTION)) {
        console.log('Vim Motion Trainer: Configuration changed');
        this.configChangeEmitter.fire(this.getConfig());
      }
    });
    
    this.disposables.push(configWatcher, this.configChangeEmitter);
  }

  /**
   * Get current extension configuration
   * @returns Complete extension configuration
   */
  getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
    
    try {
      return {
        enabled: config.get<boolean>('enabled', true),
        
        // Provider settings
        activeProvider: config.get<ProviderType>('activeProvider', 'claude'),
        providerConfigs: {
          claude: {
            apiKey: config.get<string>('providers.claude.apiKey', ''),
            model: config.get<string>('providers.claude.model', 'claude-3-5-sonnet-20241022'),
            maxTokens: config.get<number>('providers.claude.maxTokens', 150)
          }
          // Future provider configs will be added here
        },
        
        // UI settings
        hoverDelay: config.get<number>('hoverDelay', 500),
        maxContextLines: config.get<number>('maxContextLines', 5),
        userLevel: config.get<UserLevel>('userLevel', 'intermediate'),
        showDebugInfo: config.get<boolean>('showDebugInfo', false),
        showAlternatives: config.get<boolean>('showAlternatives', false),
        
        // Performance settings
        cacheEnabled: config.get<boolean>('cacheEnabled', true),
        maxCacheSize: config.get<number>('maxCacheSize', 1000)
      };
    } catch (error) {
      throw new ConfigurationError(
        `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update configuration values
   * @param updates Partial configuration to update
   * @param target Configuration target (Global, Workspace, or WorkspaceFolder)
   */
  async updateConfig(
    updates: Partial<ExtensionConfig>, 
    target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
    
    try {
      // Update each provided setting
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          await this.updateSetting(config, key, value, target);
        }
      }
      
      console.log('Vim Motion Trainer: Configuration updated successfully');
      
    } catch (error) {
      throw new ConfigurationError(
        `Failed to update configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        Object.keys(updates).join(', ')
      );
    }
  }

  /**
   * Get provider-specific configuration
   * @param providerType Provider type
   * @returns Provider configuration or null if not found
   */
  getProviderConfig(providerType: ProviderType): Record<string, any> | null {
    const config = this.getConfig();
    
    // Type-safe access to provider configs
    let providerConfig: Record<string, any> | undefined;
    switch (providerType) {
      case 'claude':
        providerConfig = config.providerConfigs.claude;
        break;
      case 'openai':
        providerConfig = config.providerConfigs.openai;
        break;
      default:
        // For future providers, return null
        return null;
    }
    
    if (!providerConfig) {
      return null;
    }
    
    // Filter out empty values
    const filteredConfig: Record<string, any> = {};
    for (const [key, value] of Object.entries(providerConfig)) {
      if (value !== '' && value !== null && value !== undefined) {
        filteredConfig[key] = value;
      }
    }
    
    return Object.keys(filteredConfig).length > 0 ? filteredConfig : null;
  }

  /**
   * Validate current configuration
   * @returns Validation result with any errors
   */
  validateConfig(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const config = this.getConfig();
      
      // Validate basic settings
      if (config.hoverDelay < 100 || config.hoverDelay > 5000) {
        errors.push('hoverDelay must be between 100 and 5000 milliseconds');
      }
      
      if (config.maxContextLines < 1 || config.maxContextLines > 50) {
        errors.push('maxContextLines must be between 1 and 50');
      }
      
      if (config.maxCacheSize < 10 || config.maxCacheSize > 10000) {
        warnings.push('maxCacheSize should be between 10 and 10000 for optimal performance');
      }
      
      // Validate provider configuration
      const providerConfig = this.getProviderConfig(config.activeProvider);
      if (!providerConfig) {
        errors.push(`No configuration found for active provider: ${config.activeProvider}`);
      } else {
        // Validate provider-specific settings
        if (config.activeProvider === 'claude') {
          if (!providerConfig.apiKey || typeof providerConfig.apiKey !== 'string') {
            errors.push('Claude API key is required');
          } else if (providerConfig.apiKey.length < 20) {
            warnings.push('Claude API key appears to be invalid (too short)');
          }
        }
      }
      
    } catch (error) {
      errors.push(`Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Reset configuration to defaults
   * @param target Configuration target
   */
  async resetToDefaults(target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global): Promise<void> {
    const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
    
    const defaultSettings = {
      enabled: true,
      activeProvider: 'claude' as ProviderType,
      hoverDelay: 500,
      maxContextLines: 5,
      userLevel: 'intermediate' as UserLevel,
      showDebugInfo: false,
      showAlternatives: false,
      cacheEnabled: true,
      maxCacheSize: 1000
    };
    
    try {
      for (const [key, value] of Object.entries(defaultSettings)) {
        await config.update(key, value, target);
      }
      
      console.log('Vim Motion Trainer: Configuration reset to defaults');
      
    } catch (error) {
      throw new ConfigurationError(
        `Failed to reset configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Export current configuration
   * @returns Serializable configuration object
   */
  exportConfig(): Record<string, any> {
    const config = this.getConfig();
    
    // Remove sensitive information like API keys
    const exportConfig = { ...config };
    if (exportConfig.providerConfigs.claude?.apiKey) {
      exportConfig.providerConfigs.claude.apiKey = '[REDACTED]';
    }
    
    return exportConfig;
  }

  /**
   * Get configuration summary for display
   * @returns Human-readable configuration summary
   */
  getConfigSummary(): string {
    const config = this.getConfig();
    const validation = this.validateConfig();
    
    const summary = [
      `Status: ${config.enabled ? 'Enabled' : 'Disabled'}`,
      `Provider: ${config.activeProvider}`,
      `User Level: ${config.userLevel}`,
      `Hover Delay: ${config.hoverDelay}ms`,
      `Cache: ${config.cacheEnabled ? 'Enabled' : 'Disabled'}`,
      `Configuration: ${validation.isValid ? 'Valid' : `Invalid (${validation.errors.length} errors)`}`
    ];
    
    if (validation.warnings.length > 0) {
      summary.push(`Warnings: ${validation.warnings.length}`);
    }
    
    return summary.join('\n');
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  /**
   * Update a specific setting with proper nesting support
   */
  private async updateSetting(
    config: vscode.WorkspaceConfiguration,
    key: string,
    value: any,
    target: vscode.ConfigurationTarget
  ): Promise<void> {
    // Handle nested settings like 'providers.claude.apiKey'
    if (key.includes('.')) {
      const parts = key.split('.');
      const settingKey = parts.join('.');
      await config.update(settingKey, value, target);
    } else {
      await config.update(key, value, target);
    }
  }
}