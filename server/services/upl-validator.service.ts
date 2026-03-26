/**
 * UPL Output Validator Service
 *
 * Post-generation validation that scans AI-generated responses for prohibited
 * language patterns that could constitute unauthorized practice of law.
 *
 * Two-stage validation:
 *   Stage 1: Regex scan -- 11 prohibited patterns (fast, synchronous)
 *   Stage 2: LLM validation -- subtle advisory framing detection (async, optional)
 *
 * This is the third enforcement layer in the UPL compliance pipeline:
 *   1. Query classifier (pre-chat) -- classifyQuery()
 *   2. System prompt (during generation) -- role-specific prompt
 *   3. Output validator (post-generation) -- this service
 *
 * Any violation detected by the regex scan is CRITICAL and must block the output.
 */

import { getLLMAdapter } from '../lib/llm/index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single prohibited language violation found in AI-generated output.
 *
 * Each violation corresponds to one of 11 prohibited patterns that detect
 * language constituting legal advice, legal conclusions, or case evaluation.
 * All regex-detected violations are CRITICAL severity (must block output).
 * LLM-detected violations are WARNING severity (advisory, still blocks in
 * full validation mode).
 *
 * The 11 patterns cover: recommendations on claim decisions, direct advice,
 * strategy language, legal directives, case valuations, case strength
 * assessments, case law citations, coverage determinations, liability
 * assessments, outcome predictions, and direct decision directives.
 */
export interface Violation {
  /** Pattern name that triggered this violation (e.g., 'recommendation_action'). */
  pattern: string;
  /** The actual text that matched the prohibited pattern. */
  matchedText: string;
  /** Character position in the source text (-1 for LLM-detected violations). */
  position: number;
  /** CRITICAL = must block output; WARNING = advisory from LLM stage. */
  severity: 'CRITICAL' | 'WARNING';
  /** Suggested rewrite to make the text compliant. */
  suggestion: string;
}

/**
 * Result of UPL output validation.
 *
 * PASS means no prohibited patterns were detected and the output is safe
 * to deliver to the examiner. FAIL means at least one CRITICAL violation
 * was found and the output must be blocked or rewritten before delivery.
 *
 * suggestedRewrites maps each matched text to its suggested compliant
 * alternative, enabling future auto-rewrite functionality.
 */
export interface ValidationResult {
  /** PASS if no critical violations; FAIL if output must be blocked. */
  result: 'PASS' | 'FAIL';
  /** All violations found (both CRITICAL and WARNING). */
  violations: Violation[];
  /** Map of matched text to suggested compliant rewrite (when violations exist). */
  suggestedRewrites?: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Prohibited pattern definitions
// ---------------------------------------------------------------------------

interface ProhibitedPattern {
  pattern: RegExp;
  name: string;
  severity: 'CRITICAL' | 'WARNING';
  suggestion: string;
}

/**
 * 11 prohibited output patterns.
 *
 * These patterns detect language that constitutes legal advice, legal
 * analysis, or legal conclusions that a non-attorney may not receive.
 * All are CRITICAL severity -- any match blocks the output.
 */
const PROHIBITED_PATTERNS: ProhibitedPattern[] = [
  {
    pattern: /\byou should\b[^.]*\b(?:deny|accept|settle|refer|increase|decrease|approve|reject)\b/i,
    name: 'recommendation_action',
    severity: 'CRITICAL',
    suggestion: 'Remove recommendation. State factual data only and note that substantive decisions are for the examiner.',
  },
  {
    pattern: /\b(?:i recommend|i suggest|my recommendation)\b/i,
    name: 'direct_recommendation',
    severity: 'CRITICAL',
    suggestion: 'Replace with factual statement. AI must not make recommendations on claim decisions.',
  },
  {
    pattern: /\b(?:best strategy|best approach|best course)\b/i,
    name: 'strategy_advice',
    severity: 'CRITICAL',
    suggestion: 'Remove strategy language. Present factual options without ranking or recommending.',
  },
  {
    pattern: /\bthe law (?:requires|mandates|prohibits) you\b/i,
    name: 'legal_directive',
    severity: 'CRITICAL',
    suggestion: 'Reframe as statutory citation: "Per LC XXXX, the statutory requirement is..." without directing the examiner.',
  },
  {
    pattern: /\b(?:claim is worth|case is worth|value of this claim)\b/i,
    name: 'case_valuation',
    severity: 'CRITICAL',
    suggestion: 'Remove valuation. Case valuation is legal analysis reserved for attorneys.',
  },
  {
    pattern: /\b(?:strong|weak)\s+(?:case|claim|defense|position|argument)\b/i,
    name: 'case_strength',
    severity: 'CRITICAL',
    suggestion: 'Remove case strength assessment. This constitutes legal analysis.',
  },
  {
    pattern: /\bunder\s+[A-Z][a-z]+\s+v\.\s+/i,
    name: 'case_law_interpretation',
    severity: 'CRITICAL',
    suggestion: 'Remove case law reference. Case law interpretation is attorney scope. Cite statutes and regulations instead.',
  },
  {
    pattern: /\bcoverage\s+(?:exists|does not exist|is|isn't)\b/i,
    name: 'coverage_determination',
    severity: 'CRITICAL',
    suggestion: 'Remove coverage conclusion. Coverage determinations involve legal analysis. Present factual claim data instead.',
  },
  {
    pattern: /\bliability\s+(?:is|appears|seems)\s+(?:clear|likely|unlikely|disputed)\b/i,
    name: 'liability_assessment',
    severity: 'CRITICAL',
    suggestion: 'Remove liability assessment. Liability determinations are legal conclusions. Present factual evidence instead.',
  },
  {
    pattern: /\b(?:applicant|claimant)\s+will\s+(?:likely|probably|almost certainly)\b/i,
    name: 'outcome_prediction',
    severity: 'CRITICAL',
    suggestion: 'Remove outcome prediction. Predicting claim outcomes is legal analysis reserved for attorneys.',
  },
  {
    pattern: /\byou should\s+(?:deny|accept|approve|reject)\b/i,
    name: 'direct_decision_advice',
    severity: 'CRITICAL',
    suggestion: 'Remove decision directive. The examiner makes all substantive claim decisions independently.',
  },
];

// ---------------------------------------------------------------------------
// Stage 1: Regex validation (synchronous)
// ---------------------------------------------------------------------------

/**
 * Scan text for prohibited UPL patterns using regex.
 *
 * Returns all violations found. Any CRITICAL violation means the output
 * must be blocked or rewritten before delivery to the user.
 */
function scanForProhibitedPatterns(text: string): Violation[] {
  const violations: Violation[] = [];

  for (const rule of PROHIBITED_PATTERNS) {
    // Use a new RegExp with global flag for finding all matches
    const globalPattern = new RegExp(rule.pattern.source, 'gi');
    let match: RegExpExecArray | null;

    while ((match = globalPattern.exec(text)) !== null) {
      violations.push({
        pattern: rule.name,
        matchedText: match[0],
        position: match.index,
        severity: rule.severity,
        suggestion: rule.suggestion,
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Stage 2: LLM validation (async)
// ---------------------------------------------------------------------------

const OUTPUT_VALIDATOR_SYSTEM_PROMPT = `You are a UPL (Unauthorized Practice of Law) compliance validator for a California Workers' Compensation claims management AI system.

Your job is to review AI-generated output text and detect any language that constitutes:
1. Legal advice or legal recommendations
2. Legal analysis or legal conclusions
3. Case evaluation or case strength assessment
4. Settlement or valuation recommendations
5. Outcome predictions
6. Directive language telling the examiner what decision to make
7. Case law interpretation
8. Coverage or liability determinations

The output is being delivered to a claims examiner (NOT an attorney). Under Cal. Bus. & Prof. Code section 6125, non-attorneys cannot receive legal advice.

ACCEPTABLE output includes:
- Factual data extraction and summaries
- Statutory citations with explanations of requirements
- Benefit calculations (arithmetic)
- Regulatory deadline information
- Medical record summaries
- Statistical data with appropriate disclaimers

If you find violations, respond with a JSON array of objects:
[{"matchedText": "the problematic text", "reason": "why this is a violation", "suggestion": "how to rewrite"}]

If no violations found, respond with an empty array: []`;

/**
 * Parse the LLM validation response into violations.
 */
function parseLlmValidationResponse(responseText: string): Violation[] {
  try {
    // Extract JSON array from the response
    const jsonMatch = /\[[\s\S]*\]/.exec(responseText);
    if (!jsonMatch) {
      return [];
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const violations: Violation[] = [];
    for (const item of parsed) {
      if (
        typeof item === 'object' &&
        item !== null &&
        'matchedText' in item &&
        'reason' in item
      ) {
        const obj = item as Record<string, unknown>;
        violations.push({
          pattern: 'llm_detected',
          matchedText: typeof obj['matchedText'] === 'string' ? obj['matchedText'] : '',
          position: -1, // LLM does not provide position
          severity: 'WARNING',
          suggestion: typeof obj['suggestion'] === 'string'
            ? obj['suggestion']
            : typeof obj['reason'] === 'string'
              ? obj['reason']
              : 'Review and revise this language',
        });
      }
    }

    return violations;
  } catch {
    // Parse errors should not block the output -- regex stage is primary
    return [];
  }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Validate AI-generated output text for UPL violations (regex-only, synchronous).
 *
 * Scans the text against 11 prohibited patterns. Returns FAIL if any
 * CRITICAL violation is found.
 *
 * @param text - The AI-generated output text to validate.
 * @returns Validation result with any violations found.
 */
export function validateOutput(text: string): ValidationResult {
  const violations = scanForProhibitedPatterns(text);

  const hasCritical = violations.some((v) => v.severity === 'CRITICAL');

  const suggestedRewrites = new Map<string, string>();
  for (const v of violations) {
    suggestedRewrites.set(v.matchedText, v.suggestion);
  }

  return {
    result: hasCritical ? 'FAIL' : 'PASS',
    violations,
    suggestedRewrites: suggestedRewrites.size > 0 ? suggestedRewrites : undefined,
  };
}

/**
 * Validate AI-generated output text for UPL violations (full pipeline, async).
 *
 * Stage 1: Regex scan for prohibited patterns (always runs).
 * Stage 2: LLM validation for subtle advisory framing (runs only if regex passes
 *          and API key is available).
 *
 * @param text - The AI-generated output text to validate.
 * @returns Validation result with any violations found.
 */
export async function validateOutputFull(text: string): Promise<ValidationResult> {
  // Stage 1: regex scan
  const regexViolations = scanForProhibitedPatterns(text);
  const hasCriticalRegex = regexViolations.some((v) => v.severity === 'CRITICAL');

  // If regex found critical violations, no need for LLM check
  if (hasCriticalRegex) {
    const suggestedRewrites = new Map<string, string>();
    for (const v of regexViolations) {
      suggestedRewrites.set(v.matchedText, v.suggestion);
    }

    return {
      result: 'FAIL',
      violations: regexViolations,
      suggestedRewrites: suggestedRewrites.size > 0 ? suggestedRewrites : undefined,
    };
  }

  // Stage 2: LLM validation (adapter returns stub when no API key is configured)
  let llmViolations: Violation[] = [];

  try {
    const adapter = getLLMAdapter('FREE');
    const response = await adapter.generate({
      messages: [
        {
          role: 'user',
          content: `Review this AI-generated output for UPL compliance violations:\n\n"${text}"`,
        },
      ],
      systemPrompt: OUTPUT_VALIDATOR_SYSTEM_PROMPT,
      temperature: 0,
      maxTokens: 512,
    });

    // Skip LLM validation if stub response (no API key configured)
    if (response.finishReason !== 'STUB' && response.content) {
      llmViolations = parseLlmValidationResponse(response.content);
    }
  } catch {
    // LLM validation errors should not block the output -- regex stage is primary
    llmViolations = [];
  }

  const allViolations = [...regexViolations, ...llmViolations];
  const hasCritical = allViolations.some((v) => v.severity === 'CRITICAL');
  const hasWarning = allViolations.some((v) => v.severity === 'WARNING');

  const suggestedRewrites = new Map<string, string>();
  for (const v of allViolations) {
    suggestedRewrites.set(v.matchedText, v.suggestion);
  }

  return {
    result: hasCritical || hasWarning ? 'FAIL' : 'PASS',
    violations: allViolations,
    suggestedRewrites: suggestedRewrites.size > 0 ? suggestedRewrites : undefined,
  };
}
