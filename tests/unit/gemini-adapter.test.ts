/**
 * Tests for GeminiAdapter — Google Vertex AI Gemini LLM adapter.
 *
 * Covers:
 *  - Stub mode (no VERTEX_AI_PROJECT)
 *  - Successful generate() with mocked fetch
 *  - System prompt extraction from request and messages
 *  - maxTokens / temperature defaults and overrides
 *  - Location env var default and override
 *  - API error responses (non-ok status)
 *  - Response parsing with missing/partial fields
 *  - generateStructured() with and without schema
 *  - classify() end-to-end
 *  - getAccessToken success and failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock retry to run inline (no delays)
// ---------------------------------------------------------------------------

vi.mock('../../server/lib/llm/retry.js', () => ({
  executeWithRetry: async <T>(fn: () => Promise<T>) => fn(),
}));

// ---------------------------------------------------------------------------
// Mock child_process for getAccessToken
// ---------------------------------------------------------------------------

const mockExecSync = vi.fn().mockReturnValue('fake-access-token\n');

vi.mock('node:child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

import { GeminiAdapter } from '../../server/lib/llm/gemini-adapter.js';
import type { ModelConfig } from '../../server/lib/llm/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG: ModelConfig = {
  provider: 'gemini',
  modelId: 'gemini-2.0-flash-lite',
  displayName: 'Gemini Flash Lite',
  tier: 'FREE',
  maxTokens: 8192,
  supportsStructuredOutput: true,
};

function makeGeminiResponse(text: string, finishReason = 'STOP') {
  return {
    candidates: [{
      content: { parts: [{ text }] },
      finishReason,
    }],
    usageMetadata: {
      promptTokenCount: 15,
      candidatesTokenCount: 25,
    },
  };
}

// ==========================================================================
// CONSTRUCTOR
// ==========================================================================

describe('GeminiAdapter — constructor', () => {
  it('sets provider to "gemini"', () => {
    const adapter = new GeminiAdapter(TEST_CONFIG);
    expect(adapter.provider).toBe('gemini');
  });

  it('sets modelId from config', () => {
    const adapter = new GeminiAdapter(TEST_CONFIG);
    expect(adapter.modelId).toBe('gemini-2.0-flash-lite');
  });
});

// ==========================================================================
// STUB MODE (no VERTEX_AI_PROJECT)
// ==========================================================================

describe('GeminiAdapter — stub mode', () => {
  let adapter: GeminiAdapter;

  beforeEach(() => {
    delete process.env['VERTEX_AI_PROJECT'];
    adapter = new GeminiAdapter(TEST_CONFIG);
  });

  it('returns a stub response when VERTEX_AI_PROJECT is absent', async () => {
    const response = await adapter.generate({
      messages: [{ role: 'user', content: 'Hello Gemini' }],
    });

    expect(response.finishReason).toBe('STUB');
    expect(response.provider).toBe('gemini');
    expect(response.model).toBe('gemini-2.0-flash-lite');
    expect(response.usage.inputTokens).toBe(0);
    expect(response.usage.outputTokens).toBe(0);
    expect(response.content).toContain('Gemini stub');
    expect(response.content).toContain('VERTEX_AI_PROJECT not configured');
  });

  it('includes truncated message content in stub', async () => {
    const longContent = 'B'.repeat(200);
    const response = await adapter.generate({
      messages: [{ role: 'user', content: longContent }],
    });
    expect(response.content).toContain('B'.repeat(100));
    expect(response.content).toContain('...');
  });

  it('handles empty messages array in stub', async () => {
    const response = await adapter.generate({ messages: [] });
    expect(response.finishReason).toBe('STUB');
    expect(response.content).toContain('...');
  });
});

// ==========================================================================
// GENERATE — with VERTEX_AI_PROJECT set
// ==========================================================================

describe('GeminiAdapter — generate()', () => {
  let adapter: GeminiAdapter;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env['VERTEX_AI_PROJECT'] = 'test-project-123';
    delete process.env['VERTEX_AI_LOCATION'];
    adapter = new GeminiAdapter(TEST_CONFIG);
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env['VERTEX_AI_PROJECT'];
    delete process.env['VERTEX_AI_LOCATION'];
    globalThis.fetch = originalFetch;
  });

  it('calls the correct Vertex AI URL with default location', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('Hello'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('us-central1-aiplatform.googleapis.com'),
      expect.anything(),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('test-project-123'),
      expect.anything(),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-2.0-flash-lite:generateContent'),
      expect.anything(),
    );
  });

  it('uses custom VERTEX_AI_LOCATION', async () => {
    process.env['VERTEX_AI_LOCATION'] = 'europe-west1';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('Bonjour'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('europe-west1-aiplatform.googleapis.com'),
      expect.anything(),
    );
  });

  it('maps assistant role to model role', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('reply'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'Follow up' },
      ],
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hi' }] },
      { role: 'model', parts: [{ text: 'Hello' }] },
      { role: 'user', parts: [{ text: 'Follow up' }] },
    ]);
  });

  it('filters out system messages from contents', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('ok'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [
        { role: 'system', content: 'System instruction' },
        { role: 'user', content: 'test' },
      ],
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'test' }] },
    ]);
  });

  it('uses systemPrompt from request', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('ok'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
      systemPrompt: 'Be helpful',
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Be helpful' }] });
  });

  it('extracts system prompt from system-role message when no explicit systemPrompt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('ok'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [
        { role: 'system', content: 'Instruction from message' },
        { role: 'user', content: 'test' },
      ],
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Instruction from message' }] });
  });

  it('omits systemInstruction when no system prompt exists', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('ok'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body).not.toHaveProperty('systemInstruction');
  });

  it('uses default maxTokens and temperature', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('ok'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(8192);
    expect(body.generationConfig.temperature).toBe(0.3);
  });

  it('uses custom maxTokens and temperature', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('ok'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 2048,
      temperature: 0.7,
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
    expect(body.generationConfig.temperature).toBe(0.7);
  });

  it('sends the access token in Authorization header', async () => {
    mockExecSync.mockReturnValue('my-token\n');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('ok'),
    }) as unknown as typeof fetch;

    await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[1].headers.Authorization).toBe('Bearer my-token');
  });

  it('returns correct LLMResponse shape', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('Answer text', 'STOP'),
    }) as unknown as typeof fetch;

    const response = await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(response).toEqual({
      content: 'Answer text',
      provider: 'gemini',
      model: 'gemini-2.0-flash-lite',
      usage: { inputTokens: 15, outputTokens: 25 },
      finishReason: 'STOP',
    });
  });

  it('handles empty candidates array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [], usageMetadata: {} }),
    }) as unknown as typeof fetch;

    const response = await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(response.content).toBe('');
    expect(response.finishReason).toBe('STOP');
    expect(response.usage.inputTokens).toBe(0);
    expect(response.usage.outputTokens).toBe(0);
  });

  it('handles missing candidates field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const response = await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(response.content).toBe('');
    expect(response.finishReason).toBe('STOP');
  });

  it('handles missing usageMetadata', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('text'),
    }) as unknown as typeof fetch;

    // Override to remove usageMetadata
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }),
    }) as unknown as typeof fetch;

    const response = await adapter.generate({
      messages: [{ role: 'user', content: 'test' }],
    });

    expect(response.usage.inputTokens).toBe(0);
    expect(response.usage.outputTokens).toBe(0);
  });

  // -----------------------------------------------------------------------
  // API errors
  // -----------------------------------------------------------------------

  it('throws on non-ok response with status and body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request body',
    }) as unknown as typeof fetch;

    await expect(
      adapter.generate({ messages: [{ role: 'user', content: 'test' }] }),
    ).rejects.toThrow('Gemini API error: 400 Bad request body');
  });

  it('sets status property on error for error classification', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    }) as unknown as typeof fetch;

    try {
      await adapter.generate({ messages: [{ role: 'user', content: 'test' }] });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect((err as Error & { status: number }).status).toBe(429);
    }
  });

  it('throws on 500 server error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    }) as unknown as typeof fetch;

    await expect(
      adapter.generate({ messages: [{ role: 'user', content: 'test' }] }),
    ).rejects.toThrow('Gemini API error: 500');
  });

  // -----------------------------------------------------------------------
  // getAccessToken
  // -----------------------------------------------------------------------

  it('throws when gcloud auth fails', async () => {
    mockExecSync.mockImplementation(() => { throw new Error('gcloud not found'); });

    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    await expect(
      adapter.generate({ messages: [{ role: 'user', content: 'test' }] }),
    ).rejects.toThrow('Failed to get GCP access token');
  });
});

// ==========================================================================
// GENERATE STRUCTURED
// ==========================================================================

describe('GeminiAdapter — generateStructured()', () => {
  let adapter: GeminiAdapter;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env['VERTEX_AI_PROJECT'] = 'test-project-123';
    adapter = new GeminiAdapter(TEST_CONFIG);
    vi.clearAllMocks();
    mockExecSync.mockReturnValue('token\n');
  });

  afterEach(() => {
    delete process.env['VERTEX_AI_PROJECT'];
    globalThis.fetch = originalFetch;
  });

  it('parses JSON response without schema', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('{"name":"test","value":42}'),
    }) as unknown as typeof fetch;

    const { data, response } = await adapter.generateStructured<{ name: string; value: number }>({
      messages: [{ role: 'user', content: 'give json' }],
    });

    expect(data).toEqual({ name: 'test', value: 42 });
    expect(response.provider).toBe('gemini');
  });

  it('applies schema.parse when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('{"name":"test"}'),
    }) as unknown as typeof fetch;

    const schema = {
      parse: (d: unknown) => ({ ...(d as Record<string, unknown>), validated: true }),
    };

    const { data } = await adapter.generateStructured({
      messages: [{ role: 'user', content: 'test' }],
    }, schema);

    expect(data).toEqual({ name: 'test', validated: true });
  });

  it('appends JSON instruction to system prompt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('{"ok":true}'),
    }) as unknown as typeof fetch;

    await adapter.generateStructured({
      messages: [{ role: 'user', content: 'test' }],
      systemPrompt: 'Base prompt',
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.systemInstruction.parts[0].text).toContain('Base prompt');
    expect(body.systemInstruction.parts[0].text).toContain('Respond with valid JSON only');
  });

  it('throws on invalid JSON in response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('not json at all'),
    }) as unknown as typeof fetch;

    await expect(
      adapter.generateStructured({
        messages: [{ role: 'user', content: 'test' }],
      }),
    ).rejects.toThrow();
  });

  it('throws when schema.parse rejects', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('{"bad":true}'),
    }) as unknown as typeof fetch;

    const schema = {
      parse: () => { throw new Error('Validation error'); },
    };

    await expect(
      adapter.generateStructured({
        messages: [{ role: 'user', content: 'test' }],
      }, schema),
    ).rejects.toThrow('Validation error');
  });
});

// ==========================================================================
// CLASSIFY
// ==========================================================================

describe('GeminiAdapter — classify()', () => {
  let adapter: GeminiAdapter;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env['VERTEX_AI_PROJECT'] = 'test-project-123';
    adapter = new GeminiAdapter(TEST_CONFIG);
    vi.clearAllMocks();
    mockExecSync.mockReturnValue('token\n');
  });

  afterEach(() => {
    delete process.env['VERTEX_AI_PROJECT'];
    globalThis.fetch = originalFetch;
  });

  it('returns category and confidence from LLM', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('{"category":"GREEN","confidence":0.92}'),
    }) as unknown as typeof fetch;

    const result = await adapter.classify(
      'What is the TD rate?',
      ['GREEN', 'YELLOW', 'RED'],
    );

    expect(result.category).toBe('GREEN');
    expect(result.confidence).toBe(0.92);
    expect(result.response.provider).toBe('gemini');
  });

  it('passes system prompt to underlying generate', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('{"category":"RED","confidence":0.85}'),
    }) as unknown as typeof fetch;

    await adapter.classify(
      'Should I settle?',
      ['GREEN', 'YELLOW', 'RED'],
      'UPL classifier',
    );

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.systemInstruction.parts[0].text).toContain('UPL classifier');
  });

  it('uses temperature 0 for classification', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('{"category":"GREEN","confidence":1.0}'),
    }) as unknown as typeof fetch;

    await adapter.classify('test', ['GREEN', 'RED']);

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    expect(body.generationConfig.temperature).toBe(0);
  });

  it('includes categories in the classification prompt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('{"category":"A","confidence":0.9}'),
    }) as unknown as typeof fetch;

    await adapter.classify('text', ['A', 'B', 'C']);

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse(callArgs[1].body);
    const userContent = body.contents[0].parts[0].text;
    expect(userContent).toContain('A, B, C');
  });

  it('works without a system prompt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeGeminiResponse('{"category":"X","confidence":0.5}'),
    }) as unknown as typeof fetch;

    const result = await adapter.classify('text', ['X', 'Y']);
    expect(result.category).toBe('X');
  });
});
