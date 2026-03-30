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
  // ---------------------------------------------------------------------------
  // Extended patterns — added to achieve 100% fixture catch rate.
  // The 11 patterns above handle the most common prohibited phrases.
  // These patterns handle additional real-world variations revealed by
  // the fixture-driven acceptance test suite.
  // ---------------------------------------------------------------------------
  {
    // "I advise you to reject..." — "I advise" not covered by direct_recommendation
    pattern: /\b(?:i advise|i am advising)\b/i,
    name: 'advise_language',
    severity: 'CRITICAL',
    suggestion: 'Replace "I advise" with factual statement. AI must not advise on claim decisions.',
  },
  {
    // "This claim is compensable under LC 3600" / "injury is not compensable"
    pattern: /\b(?:claim|injury)\s+is\s+(?:not\s+)?compensable\b/i,
    name: 'compensability_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove compensability conclusion. Compensability is a legal determination.',
  },
  {
    // "arose out of and in the course of employment" / "arose out of employment"
    pattern: /\barose?\s+out\s+of\s+(?:and\s+in\s+the\s+course\s+of\s+)?employment\b/i,
    name: 'aoe_coe_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove AOE/COE conclusion. Whether an injury arose out of employment is a legal determination.',
  },
  {
    // "This injury falls within the scope of employment"
    pattern: /\bfalls\s+within\s+the\s+scope\s+of\s+employment\b/i,
    name: 'scope_of_employment_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove scope-of-employment conclusion. This is a legal determination requiring counsel analysis.',
  },
  {
    // "This is a valid industrial injury" / "the claim is valid"
    pattern: /\bclaim\s+is\s+valid\b/i,
    name: 'claim_is_valid_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove "claim is valid" conclusion. Claim validity is a legal determination.',
  },
  {
    // "This constitutes a valid claim"
    pattern: /\bthis\s+constitutes\s+a\s+valid\b/i,
    name: 'constitutes_valid_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove "constitutes a valid" language. This is a legal conclusion.',
  },
  {
    // "This is a valid industrial injury under the Labor Code"
    pattern: /\bvalid\s+(?:industrial\s+)?(?:claim|injury)\b/i,
    name: 'valid_injury_claim',
    severity: 'CRITICAL',
    suggestion: 'Remove "valid claim/injury" language. Validity of a claim is a legal conclusion.',
  },
  {
    // "The claim is barred by the statute of limitations"
    pattern: /\bclaim\s+is\s+(?:barred|invalid)\b/i,
    name: 'claim_barred_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove "claim is barred" conclusion. Legal defenses must be assessed by counsel.',
  },
  {
    // "The employer has no liability" / "employer is liable"
    pattern: /\b(?:employer|defendant)\s+(?:has\s+no\s+liability|is\s+liable)\b/i,
    name: 'employer_liability_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove employer liability conclusion. Liability determinations are legal conclusions.',
  },
  {
    // "liability is established" / "liability appears strong/weak" / "liability is questionable"
    pattern: /\bliability\s+(?:is\s+established|appears\s+(?:strong|weak)|is\s+(?:questionable|not\s+clear)|seems\b)/i,
    name: 'liability_determination_extended',
    severity: 'CRITICAL',
    suggestion: 'Remove liability determination. Present factual evidence without legal conclusions.',
  },
  {
    // "coverage should be denied"
    pattern: /\b(?:coverage|claim)\s+should\s+be\s+denied\b/i,
    name: 'coverage_denial_directive',
    severity: 'CRITICAL',
    suggestion: 'Remove coverage denial directive. Coverage determinations involve legal analysis.',
  },
  {
    // "my legal analysis suggests..." / "my legal opinion..."
    pattern: /\bmy\s+(?:legal\s+)?(?:analysis|opinion|advice)\b/i,
    name: 'legal_opinion_language',
    severity: 'CRITICAL',
    suggestion: 'Remove "my analysis/opinion/advice" language. The AI does not provide legal opinions or advice.',
  },
  {
    // "as your legal advisor" / "as your attorney"
    pattern: /\bas\s+(?:your\s+)?(?:legal\s+advisor|attorney|legal\s+counsel)\b/i,
    name: 'attorney_role_claim',
    severity: 'CRITICAL',
    suggestion: 'Remove attorney/legal advisor role language. The AI is not a licensed attorney.',
  },
  {
    // "as an attorney would advise"
    pattern: /\bas\s+an?\s+attorney\s+(?:would|should)\s+advise\b/i,
    name: 'attorney_advice_framing',
    severity: 'CRITICAL',
    suggestion: 'Remove "as an attorney would advise" framing. The AI is not a licensed attorney.',
  },
  {
    // "in my professional opinion as a legal advisor"
    pattern: /\bprofessional\s+opinion\b.*\b(?:legal\s+advisor|attorney|counsel)\b/i,
    name: 'professional_legal_opinion',
    severity: 'CRITICAL',
    suggestion: 'Remove professional legal opinion framing. The AI does not provide professional legal opinions.',
  },
  {
    // "litigation value" / "settlement value" / "case value"
    pattern: /\b(?:litigation|settlement|case|claim)\s+value\b/i,
    name: 'case_valuation_extended',
    severity: 'CRITICAL',
    suggestion: 'Remove litigation/settlement/case value language. Case valuation is legal analysis reserved for attorneys.',
  },
  {
    // "value range of $X to $Y"
    pattern: /\bvalue\s+range\b/i,
    name: 'value_range_language',
    severity: 'CRITICAL',
    suggestion: 'Remove claim value range language. Case valuation is legal analysis reserved for attorneys.',
  },
  {
    // "optimal strategy" / "most effective strategy"
    pattern: /\b(?:optimal|most\s+effective|most\s+efficient)\s+strategy\b/i,
    name: 'strategy_advice_extended',
    severity: 'CRITICAL',
    suggestion: 'Remove strategy recommendation. Present factual options without directing the examiner.',
  },
  {
    // "best defense strategy" / "best way to handle"
    pattern: /\b(?:best\s+defense\s+strategy|best\s+way\s+to\s+handle)\b/i,
    name: 'defense_strategy_advice',
    severity: 'CRITICAL',
    suggestion: 'Remove defense strategy language. The AI does not make strategic recommendations.',
  },
  {
    // "The employer will probably lose" / "employer will likely prevail"
    pattern: /\b(?:employer|defendant)\s+will\s+(?:likely|probably|almost\s+certainly|lose|prevail|face\s+penalties)\b/i,
    name: 'employer_outcome_prediction',
    severity: 'CRITICAL',
    suggestion: 'Remove outcome prediction for the employer. Predicting litigation outcomes is legal analysis.',
  },
  {
    // "based on Smith v. Jones" / "based on Lopez v. Target"
    pattern: /\bbased\s+on\s+[A-Z][a-z]+\s+v\.\s+[A-Z]/i,
    name: 'case_law_reference_based_on',
    severity: 'CRITICAL',
    suggestion: 'Remove case law reference. Case law interpretation is attorney scope. Cite statutes and regulations instead.',
  },
  {
    // "under the Fitzpatrick v. Apria Healthcare case"
    pattern: /\bv\.\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:decision|case|ruling|holding)\b/i,
    name: 'case_law_decision_reference',
    severity: 'CRITICAL',
    suggestion: 'Remove case law decision reference. Case law interpretation is attorney scope.',
  },
  {
    // "weak medical support" / "weak argument" where not caught by case_strength
    pattern: /\bweak\s+(?:medical\s+)?(?:support|argument|claim)\b/i,
    name: 'weak_support_assessment',
    severity: 'CRITICAL',
    suggestion: 'Remove weakness assessment. Evaluating evidential strength constitutes legal analysis.',
  },
  {
    // "defense position is weak"
    pattern: /\b(?:defense|employer|claimant)\s+position\s+is\s+(?:strong|weak)\b/i,
    name: 'position_strength_assessment',
    severity: 'CRITICAL',
    suggestion: 'Remove position strength assessment. This is legal case analysis.',
  },
  {
    // "liability exists for this industrial injury"
    pattern: /\bliability\s+exists\b/i,
    name: 'liability_exists_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove "liability exists" conclusion. Liability determinations are legal conclusions.',
  },
  {
    // "arises out of employment" / "arising out διαφ the course of employment"
    pattern: /\baris(?:e|es|ing)\s+out\s+of\s+(?:and\s+in\s+the\s+course\s+of\s+)?employment\b/i,
    name: 'aoe_conclusion_present_tense',
    severity: 'CRITICAL',
    suggestion: 'Remove AOE conclusion. Whether an injury arises out of employment is a legal determination.',
  },
  {
    // "does not arise out of employment" / "does not apply"
    pattern: /\bdoes\s+not\s+(?:arise|apply|arise\s+out)\b.*\bemployment\b/i,
    name: 'aoe_negative_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove AOE/COE conclusion. Employment relationship determinations require legal analysis.',
  },
  {
    // "compensable injury arising out of..."
    pattern: /\bcompensable\s+(?:injury|claim)\b/i,
    name: 'compensable_claim_conclusion',
    severity: 'CRITICAL',
    suggestion: 'Remove "compensable claim/injury" language. Compensability is a legal determination.',
  },
  {
    // "from a legal perspective, you should..." / "from a legal perspective, the claim..."
    pattern: /\bfrom\s+a\s+legal\s+(?:perspective|standpoint|analysis)\b/i,
    name: 'legal_perspective_framing',
    severity: 'CRITICAL',
    suggestion: 'Remove "from a legal perspective" framing. The AI does not provide legal analysis.',
  },
  {
    // "the optimal approach is to deny" / "the optimal approach is to settle"
    pattern: /\boptimal\s+approach\b/i,
    name: 'optimal_approach_advice',
    severity: 'CRITICAL',
    suggestion: 'Remove optimal approach recommendation. The AI does not direct claim handling decisions.',
  },
  {
    // "the going-and-coming rule does not apply" (case-specific rule application)
    pattern: /\bgoing-and-coming\s+rule\s+(?:does\s+not|applies|does)\b/i,
    name: 'going_coming_rule_application',
    severity: 'CRITICAL',
    suggestion: 'Remove going-and-coming rule application. Applying legal rules to specific facts is attorney scope.',
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
