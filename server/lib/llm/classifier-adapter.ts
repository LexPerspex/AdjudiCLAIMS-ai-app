/**
 * Classifier LLM adapter — bridges AdjudiCLAIMS's ClaudeAdapter to the
 * @adjudica/document-classifier IClassifierLLMAdapter interface.
 *
 * The classifier package uses dependency injection: it accepts any adapter
 * that implements generateStructured(). This adapter wraps our ClaudeAdapter
 * to provide that interface, using Claude Haiku for fast/cheap classification.
 *
 * Note: The classifier package uses zod v3 while AdjudiCLAIMS uses zod v4.
 * The adapter uses structural typing (duck typing) rather than importing
 * IClassifierLLMAdapter directly to avoid the zod type incompatibility.
 * The classifier's runtime validation uses its own zod v3 instance, so
 * the schema parameter is passed through as-is.
 */

import { ClaudeAdapter } from './claude-adapter.js';
import type { ModelConfig } from './types.js';

/** Model config for classification — uses Haiku for speed and cost */
const CLASSIFIER_MODEL_CONFIG: ModelConfig = {
  provider: 'anthropic',
  modelId: 'claude-haiku-4-5-20251001',
  displayName: 'Claude Haiku (Classification)',
  tier: 'FREE',
  maxTokens: 1024,
  supportsStructuredOutput: true,
};

/**
 * Wraps AdjudiCLAIMS's ClaudeAdapter to satisfy the classifier package's
 * IClassifierLLMAdapter interface via structural typing.
 *
 * Falls back gracefully when ANTHROPIC_API_KEY is not set (ClaudeAdapter
 * returns a stub response, which the classifier will fail to parse,
 * triggering its error handling path).
 */
export class ClassifierLLMAdapter {
  private adapter: ClaudeAdapter;

  constructor(modelConfig?: ModelConfig) {
    this.adapter = new ClaudeAdapter(modelConfig ?? CLASSIFIER_MODEL_CONFIG);
  }

  async generateStructured(
    config: {
      systemPrompt?: string;
      userPrompt?: string;
      temperature?: number;
      maxOutputTokens?: number;
      options?: { disableTemplateParsing?: boolean };
    },
    schema: { parse: (data: unknown) => unknown },
  ): Promise<{ content: unknown }> {
    const { data } = await this.adapter.generateStructured(
      {
        messages: [
          ...(config.userPrompt
            ? [{ role: 'user' as const, content: config.userPrompt }]
            : []),
        ],
        systemPrompt: config.systemPrompt,
        temperature: config.temperature ?? 0.1,
        maxTokens: config.maxOutputTokens ?? 512,
      },
      schema,
    );

    return { content: data };
  }
}
