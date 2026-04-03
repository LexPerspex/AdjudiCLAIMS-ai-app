/**
 * Classifier LLM adapter — bridges AdjudiCLAIMS's GeminiAdapter to the
 * @adjudica/document-classifier IClassifierLLMAdapter interface.
 *
 * The classifier package uses dependency injection: it accepts any adapter
 * that implements generateStructured(). This adapter wraps our GeminiAdapter
 * to provide that interface, using Gemini Flash for fast/cost-effective
 * classification.
 *
 * Note: The classifier package uses zod v3 while AdjudiCLAIMS uses zod v4.
 * The adapter uses structural typing (duck typing) rather than importing
 * IClassifierLLMAdapter directly to avoid the zod type incompatibility.
 * The classifier's runtime validation uses its own zod v3 instance, so
 * the schema parameter is passed through as-is.
 */

import { GeminiAdapter } from './gemini-adapter.js';
import type { ModelConfig } from './types.js';

/** Model config for classification — uses Gemini Flash for speed and cost */
const CLASSIFIER_MODEL_CONFIG: ModelConfig = {
  provider: 'gemini',
  modelId: 'gemini-2.0-flash',
  displayName: 'Gemini Flash (Classification)',
  tier: 'STANDARD',
  maxTokens: 1024,
  supportsStructuredOutput: true,
};

/**
 * Wraps AdjudiCLAIMS's GeminiAdapter to satisfy the classifier package's
 * IClassifierLLMAdapter interface via structural typing.
 *
 * Falls back gracefully when VERTEX_AI_PROJECT is not set (GeminiAdapter
 * returns a stub response, which the classifier will fail to parse,
 * triggering its error handling path).
 */
export class ClassifierLLMAdapter {
  private adapter: GeminiAdapter;

  constructor(modelConfig?: ModelConfig) {
    this.adapter = new GeminiAdapter(modelConfig ?? CLASSIFIER_MODEL_CONFIG);
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
