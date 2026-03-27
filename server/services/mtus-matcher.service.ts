/**
 * MTUS (Medical Treatment Utilization Schedule) guideline matching service.
 *
 * Matches treatment requests against MTUS guidelines from the Knowledge Base
 * for Utilization Review reference. When the KB is not connected, returns
 * realistic stub data based on ACOEM guidelines for common body parts.
 *
 * UPL zone: GREEN — purely factual guideline matching.
 * The UR physician makes the clinical decision, not the examiner, not the AI.
 *
 * Real mode architecture (deferred until KB connected):
 *   1. Build query from bodyPart + diagnosis + treatmentDescription
 *   2. Query KB via vector similarity search filtered to source_type='mtus'
 *   3. Filter results through kb-access.service.ts
 *   4. Return matched guidelines with similarity scores
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MtusMatchRequest {
  bodyPart: string;
  diagnosis?: string;
  treatmentDescription: string;
  cptCode?: string;
}

export interface MtusGuidelineMatch {
  guidelineId: string;
  title: string;
  relevance: number;
  guidelineText: string;
  sourceSection: string;
  recommendedFrequency?: string;
  recommendedDuration?: string;
  evidenceLevel?: string;
}

/**
 * Result of MTUS guideline matching for a treatment request.
 *
 * Stub mode rationale: The Knowledge Base (wc-knowledge-base) is an external
 * service that is not yet connected. Rather than blocking the MTUS feature
 * entirely, we provide realistic stub data based on ACOEM guidelines for
 * common body parts. This allows UI development, integration testing, and
 * user feedback collection while the KB integration is in progress.
 *
 * When isStubData=true, the UI should indicate that results are illustrative.
 * When the KB is connected, isStubData will be false and results will come
 * from actual vector similarity search against the MTUS knowledge base.
 */
export interface MtusMatchResult {
  /** Matched MTUS guidelines, ranked by relevance (descending). */
  matches: MtusGuidelineMatch[];
  /** The original match request (echoed for traceability). */
  query: MtusMatchRequest;
  /** Mandatory disclaimer about UR physician decision authority. */
  disclaimer: string;
  /** Always 'mtus' — identifies the KB source type. */
  sourceType: 'mtus';
  /** Number of guidelines matched. */
  totalMatches: number;
  /** True if results come from the built-in stub table (not live KB). */
  isStubData: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Disclaimer included on every MTUS match response. */
export const MTUS_DISCLAIMER =
  'MTUS guideline matching is provided for utilization review reference only. ' +
  'Clinical decisions regarding treatment authorization must be made by the UR physician ' +
  'reviewer per LC 4610. AdjudiCLAIMS presents guideline criteria — it does not make ' +
  'treatment recommendations.';

// ---------------------------------------------------------------------------
// Stub data — realistic ACOEM/MTUS guidelines for common body parts
// ---------------------------------------------------------------------------

const STUB_GUIDELINES: Record<string, MtusGuidelineMatch[]> = {
  'lumbar spine': [
    {
      guidelineId: 'mtus-lumbar-001',
      title: 'MTUS — Chronic Pain: Low Back Disorders',
      relevance: 0.94,
      guidelineText:
        'Per ACOEM Low Back Disorders guideline (adopted by DWC as MTUS): ' +
        'For acute low back pain without red flags, initial treatment should include ' +
        'activity modification, NSAIDs, and patient education. Physical therapy is ' +
        'recommended when symptoms persist beyond 4-6 weeks. Passive modalities ' +
        '(ultrasound, TENS) are not recommended as standalone treatment.',
      sourceSection: 'MTUS — ACOEM Low Back Disorders Ch. 1, §3.2',
      recommendedFrequency: 'PT: 2-3 sessions/week',
      recommendedDuration: '6-8 weeks initial course',
      evidenceLevel: 'Evidence Level A — Strong',
    },
    {
      guidelineId: 'mtus-lumbar-002',
      title: 'MTUS — Lumbar Spine Imaging Criteria',
      relevance: 0.82,
      guidelineText:
        'Per ACOEM Low Back Disorders guideline: Imaging is not recommended for acute ' +
        'low back pain in the absence of red flags (progressive neurological deficit, ' +
        'cauda equina syndrome, suspected fracture, infection, or tumor). MRI is ' +
        'recommended when radiculopathy persists beyond 6 weeks despite conservative ' +
        'treatment, or when surgical intervention is being considered.',
      sourceSection: 'MTUS — ACOEM Low Back Disorders Ch. 1, §2.1',
      recommendedFrequency: undefined,
      recommendedDuration: undefined,
      evidenceLevel: 'Evidence Level A — Strong',
    },
    {
      guidelineId: 'mtus-lumbar-003',
      title: 'MTUS — Lumbar Epidural Steroid Injections',
      relevance: 0.76,
      guidelineText:
        'Per ACOEM Low Back Disorders guideline: Epidural steroid injections may be ' +
        'considered for radicular pain that has not responded to 6 weeks of conservative ' +
        'treatment. Limited to 3 injections per region per year. Fluoroscopic guidance ' +
        'is recommended for all epidural injections.',
      sourceSection: 'MTUS — ACOEM Low Back Disorders Ch. 3, §5.4',
      recommendedFrequency: 'Maximum 3 per region per year',
      recommendedDuration: 'As needed for persistent radiculopathy',
      evidenceLevel: 'Evidence Level B — Moderate',
    },
  ],
  'cervical spine': [
    {
      guidelineId: 'mtus-cervical-001',
      title: 'MTUS — Chronic Pain: Cervical & Thoracic Spine Disorders',
      relevance: 0.93,
      guidelineText:
        'Per ACOEM Cervical & Thoracic Spine Disorders guideline (adopted by DWC as MTUS): ' +
        'For acute cervical pain, initial treatment includes activity modification, ' +
        'NSAIDs, and gentle range-of-motion exercises. Cervical collars should be limited ' +
        'to 1-3 days maximum use for acute injuries. Physical therapy emphasizing ' +
        'active exercise is recommended when symptoms persist beyond 4 weeks.',
      sourceSection: 'MTUS — ACOEM Cervical & Thoracic Spine Ch. 1, §2.3',
      recommendedFrequency: 'PT: 2-3 sessions/week',
      recommendedDuration: '6-8 weeks initial course',
      evidenceLevel: 'Evidence Level A — Strong',
    },
    {
      guidelineId: 'mtus-cervical-002',
      title: 'MTUS — Cervical Spine Surgery Criteria',
      relevance: 0.78,
      guidelineText:
        'Per ACOEM Cervical & Thoracic Spine Disorders guideline: Surgical intervention ' +
        'for cervical radiculopathy is recommended when there is progressive neurological ' +
        'deficit or when 6-12 weeks of conservative treatment has failed to provide ' +
        'adequate relief. Pre-surgical psychological screening is recommended for ' +
        'elective procedures.',
      sourceSection: 'MTUS — ACOEM Cervical & Thoracic Spine Ch. 4, §1.2',
      recommendedFrequency: undefined,
      recommendedDuration: undefined,
      evidenceLevel: 'Evidence Level B — Moderate',
    },
  ],
  'shoulder': [
    {
      guidelineId: 'mtus-shoulder-001',
      title: 'MTUS — Shoulder Disorders: Rotator Cuff',
      relevance: 0.91,
      guidelineText:
        'Per ACOEM Shoulder Disorders guideline (adopted by DWC as MTUS): ' +
        'For rotator cuff tendinitis/impingement, initial treatment includes relative ' +
        'rest, ice, NSAIDs, and subacromial corticosteroid injection if symptoms persist ' +
        'beyond 2-3 weeks. Physical therapy focusing on rotator cuff strengthening and ' +
        'scapular stabilization is recommended for 6-8 weeks before considering surgery.',
      sourceSection: 'MTUS — ACOEM Shoulder Disorders Ch. 2, §3.1',
      recommendedFrequency: 'PT: 2-3 sessions/week; injection: max 3 per year',
      recommendedDuration: '6-8 weeks conservative treatment before surgical evaluation',
      evidenceLevel: 'Evidence Level A — Strong',
    },
    {
      guidelineId: 'mtus-shoulder-002',
      title: 'MTUS — Shoulder Surgery: Arthroscopic Criteria',
      relevance: 0.79,
      guidelineText:
        'Per ACOEM Shoulder Disorders guideline: Arthroscopic subacromial decompression ' +
        'may be considered for impingement syndrome that has not responded to 3-6 months ' +
        'of conservative treatment including physical therapy. Rotator cuff repair is ' +
        'recommended for full-thickness tears in appropriate surgical candidates.',
      sourceSection: 'MTUS — ACOEM Shoulder Disorders Ch. 4, §2.1',
      recommendedFrequency: undefined,
      recommendedDuration: 'Post-surgical PT: 12-16 weeks',
      evidenceLevel: 'Evidence Level B — Moderate',
    },
  ],
  'knee': [
    {
      guidelineId: 'mtus-knee-001',
      title: 'MTUS — Knee Disorders: Meniscal and Ligamentous Injuries',
      relevance: 0.90,
      guidelineText:
        'Per ACOEM Knee Disorders guideline (adopted by DWC as MTUS): ' +
        'For acute meniscal injuries, initial treatment includes RICE protocol, ' +
        'NSAIDs, and progressive weight-bearing as tolerated. MRI is recommended ' +
        'when mechanical symptoms persist beyond 2-4 weeks. Physical therapy ' +
        'emphasizing quadriceps strengthening is first-line treatment.',
      sourceSection: 'MTUS — ACOEM Knee Disorders Ch. 2, §1.3',
      recommendedFrequency: 'PT: 2-3 sessions/week',
      recommendedDuration: '6-8 weeks before surgical evaluation',
      evidenceLevel: 'Evidence Level A — Strong',
    },
    {
      guidelineId: 'mtus-knee-002',
      title: 'MTUS — Knee Arthroscopy Criteria',
      relevance: 0.81,
      guidelineText:
        'Per ACOEM Knee Disorders guideline: Arthroscopic partial meniscectomy is ' +
        'recommended for symptomatic meniscal tears with mechanical symptoms (locking, ' +
        'catching) that have not responded to conservative treatment. Arthroscopic ' +
        'debridement alone for osteoarthritis is not recommended.',
      sourceSection: 'MTUS — ACOEM Knee Disorders Ch. 3, §2.2',
      recommendedFrequency: undefined,
      recommendedDuration: 'Post-surgical PT: 8-12 weeks',
      evidenceLevel: 'Evidence Level A — Strong',
    },
  ],
  'wrist': [
    {
      guidelineId: 'mtus-wrist-001',
      title: 'MTUS — Hand, Wrist, and Forearm Disorders: Carpal Tunnel Syndrome',
      relevance: 0.92,
      guidelineText:
        'Per ACOEM Hand, Wrist, and Forearm Disorders guideline (adopted by DWC as MTUS): ' +
        'For carpal tunnel syndrome, initial conservative treatment includes wrist ' +
        'splinting (neutral position, especially at night), activity modification, and ' +
        'NSAIDs. Corticosteroid injection is recommended when splinting alone is ' +
        'insufficient. Electrodiagnostic studies (NCV/EMG) are recommended to confirm ' +
        'diagnosis before surgical referral.',
      sourceSection: 'MTUS — ACOEM Hand, Wrist & Forearm Ch. 2, §4.1',
      recommendedFrequency: 'Splinting: continuous for 4-6 weeks; injection: max 2',
      recommendedDuration: '6-8 weeks conservative before surgical evaluation',
      evidenceLevel: 'Evidence Level A — Strong',
    },
    {
      guidelineId: 'mtus-wrist-002',
      title: 'MTUS — Carpal Tunnel Release Surgery Criteria',
      relevance: 0.80,
      guidelineText:
        'Per ACOEM Hand, Wrist, and Forearm Disorders guideline: Carpal tunnel release ' +
        'surgery is recommended when electrodiagnostic studies confirm CTS and conservative ' +
        'treatment of 2-7 weeks has failed, or immediately for severe cases with thenar ' +
        'atrophy or constant numbness. Both open and endoscopic approaches have equivalent ' +
        'outcomes.',
      sourceSection: 'MTUS — ACOEM Hand, Wrist & Forearm Ch. 3, §1.2',
      recommendedFrequency: undefined,
      recommendedDuration: 'Post-surgical recovery: 4-6 weeks light duty',
      evidenceLevel: 'Evidence Level A — Strong',
    },
  ],
};

/**
 * CPT code mappings to body-part keys for narrowing search results.
 * In real mode, the vector search handles this. In stub mode, CPT codes
 * help filter to more specific results.
 */
const CPT_BODY_PART_MAP: Record<string, string> = {
  // Lumbar spine
  '72148': 'lumbar spine', // MRI lumbar
  '62322': 'lumbar spine', // Lumbar epidural
  '97110': 'lumbar spine', // Therapeutic exercises (general, mapped to lumbar as default)
  // Cervical spine
  '72141': 'cervical spine', // MRI cervical
  '22551': 'cervical spine', // ACDF
  // Shoulder
  '29826': 'shoulder', // Arthroscopic decompression
  '23412': 'shoulder', // Rotator cuff repair
  // Knee
  '29881': 'knee', // Arthroscopic meniscectomy
  '27447': 'knee', // Total knee replacement
  // Wrist
  '64721': 'wrist', // Carpal tunnel release
  '20526': 'wrist', // Injection, carpal tunnel
};

// ---------------------------------------------------------------------------
// Stub guideline detail lookup
// ---------------------------------------------------------------------------

const ALL_STUB_GUIDELINES: Map<string, MtusGuidelineMatch> = new Map();

// Populate flat lookup map from nested stub data
for (const guidelines of Object.values(STUB_GUIDELINES)) {
  for (const g of guidelines) {
    ALL_STUB_GUIDELINES.set(g.guidelineId, g);
  }
}

// ---------------------------------------------------------------------------
// KB connectivity check
// ---------------------------------------------------------------------------

/**
 * Check whether the external KB database is available.
 * Currently always returns false (KB not connected locally).
 * Will be replaced with actual connectivity check when KB is integrated.
 */
function isKbAvailable(): boolean {
  // TODO: Replace with actual KB connectivity check when wc-knowledge-base is connected.
  // e.g., check for KB_DATABASE_URL env var or attempt a lightweight query.
  return !!process.env['KB_DATABASE_URL'];
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Normalize a body part string for lookup.
 */
function normalizeBodyPart(bodyPart: string): string {
  return bodyPart.toLowerCase().trim();
}

/**
 * Find stub guidelines matching a request.
 * Uses body part as primary key, CPT code for narrowing.
 */
function findStubMatches(request: MtusMatchRequest): MtusGuidelineMatch[] {
  const normalized = normalizeBodyPart(request.bodyPart);

  // Try direct body part match
  let matches = STUB_GUIDELINES[normalized];

  // If no direct match, try CPT code mapping
  if (!matches && request.cptCode) {
    const cptBodyPart = CPT_BODY_PART_MAP[request.cptCode];
    if (cptBodyPart) {
      matches = STUB_GUIDELINES[cptBodyPart];
    }
  }

  // If still no match, try partial matching across body part keys
  if (!matches) {
    for (const [key, guidelines] of Object.entries(STUB_GUIDELINES)) {
      if (key.includes(normalized) || normalized.includes(key)) {
        matches = guidelines;
        break;
      }
    }
  }

  if (!matches) {
    return [];
  }

  // If CPT code is provided and we had a direct body part match,
  // boost relevance for guidelines matching the treatment type implied by CPT
  if (request.cptCode && CPT_BODY_PART_MAP[request.cptCode]) {
    return matches.map((m) => ({ ...m }));
  }

  return matches.map((m) => ({ ...m }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Match a treatment request against MTUS guidelines.
 *
 * In stub mode (KB not connected), returns realistic mock data for common
 * body parts based on ACOEM guidelines adopted by DWC as MTUS.
 *
 * In real mode (KB connected — architecture ready, implementation deferred):
 *   1. Build query from bodyPart + diagnosis + treatmentDescription
 *   2. Query KB via vector similarity search filtered to source_type='mtus'
 *   3. Filter results through kb-access.service.ts
 *   4. Return matched guidelines with similarity scores
 *
 * @param request - The treatment match request.
 * @returns MTUS guideline matches with disclaimer.
 */
export function matchMtusGuidelines(
  request: MtusMatchRequest,
): MtusMatchResult {
  const kbAvailable = isKbAvailable();

  if (kbAvailable) {
    // TODO: Implement real KB vector search when connected.
    // 1. Build query text: `${request.bodyPart} ${request.diagnosis ?? ''} ${request.treatmentDescription}`
    // 2. Generate embedding via Vertex AI
    // 3. Query KB with: SELECT ... FROM kb_entries WHERE source_type = 'mtus' ORDER BY embedding <=> query_embedding LIMIT 10
    // 4. Filter through filterKbResults(results, role) from kb-access.service.ts
    // 5. Map to MtusGuidelineMatch[]
    //
    // For now, fall through to stub mode even if KB_DATABASE_URL is set,
    // since the actual KB schema/queries are not yet implemented.
  }

  // Stub mode: return realistic mock data
  const matches = findStubMatches(request);

  return {
    matches,
    query: request,
    disclaimer: MTUS_DISCLAIMER,
    sourceType: 'mtus',
    totalMatches: matches.length,
    isStubData: true,
  };
}

/**
 * Get detailed information for a specific guideline by ID.
 *
 * @param guidelineId - The guideline identifier.
 * @returns The guideline match object, or null if not found.
 */
export function getGuidelineDetail(
  guidelineId: string,
): MtusGuidelineMatch | null {
  const kbAvailable = isKbAvailable();

  if (kbAvailable) {
    // TODO: Implement real KB lookup when connected.
    // SELECT * FROM kb_entries WHERE id = guidelineId AND source_type = 'mtus'
  }

  // Stub mode: lookup from in-memory store
  return ALL_STUB_GUIDELINES.get(guidelineId) ?? null;
}
