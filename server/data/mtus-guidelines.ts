/**
 * @Developed & Documented by Glass Box Solutions, Inc. using human ingenuity and modern technology
 *
 * MTUS (Medical Treatment Utilization Schedule) — DWC guideline knowledge base.
 *
 * California's MTUS is codified at 8 CCR §9792.20 through §9792.27. The DWC
 * adopts ACOEM Practice Guidelines (and ODG for chronic pain & opioids) as
 * the presumptively correct evidence-based standard for treatment authorization
 * in workers' compensation claims (LC §4604.5, LC §5307.27).
 *
 * This file contains 41 distinct guideline entries spanning every major
 * topical chapter of the MTUS — body-part chapters (low back, neck, shoulder,
 * elbow, hand/wrist/forearm, knee, ankle/foot), cross-cutting chapters
 * (chronic pain, opioids, acupuncture, eating disorders, methodology), and
 * the MTUS drug formulary.
 *
 * UPL note: Every entry is FACTUAL — it states what a guideline criterion is,
 * cites the regulatory section, and describes objective frequency/duration
 * limits. No entry recommends a treatment to a particular patient. The UR
 * physician makes the clinical decision per LC §4610. AdjudiCLAIMS surfaces
 * the criteria; it never authorizes or denies treatment.
 *
 * Sources cited:
 *   - 8 CCR §9792.20 — Definitions
 *   - 8 CCR §9792.21 — Medical Treatment Utilization Schedule
 *   - 8 CCR §9792.22 — Strength of Evidence Ratings
 *   - 8 CCR §9792.23.x — Body-part clinical topics (ACOEM)
 *   - 8 CCR §9792.24.x — Cross-cutting topics (chronic pain, opioids, etc.)
 *   - 8 CCR §9792.27.x — MTUS drug formulary
 */

// ---------------------------------------------------------------------------
// Types — re-exported from the matcher service for data-file standalone use
// ---------------------------------------------------------------------------

/**
 * A single MTUS guideline entry suitable for matcher service consumption.
 *
 * `relevance` is a base score (0..1). The matcher may adjust per-query but
 * the value stored here represents intrinsic match strength when the query
 * targets the body part / topic area associated with the guideline.
 */
export interface MtusGuidelineEntry {
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
 * Topical category — used by the matcher service for body-part / topic
 * routing. Multiple body-part aliases may map to the same category.
 */
export type MtusCategory =
  | 'low-back'
  | 'neck'
  | 'shoulder'
  | 'elbow'
  | 'hand-wrist'
  | 'knee'
  | 'ankle-foot'
  | 'chronic-pain'
  | 'opioids'
  | 'acupuncture'
  | 'formulary'
  | 'methodology';

// ---------------------------------------------------------------------------
// Knowledge base — 41 guideline entries grouped by category
// ---------------------------------------------------------------------------

/**
 * MTUS guideline entries organized by topical category.
 *
 * Total: 41 entries spanning all major MTUS chapters.
 * Source: California DWC MTUS (8 CCR §9792.20 et seq.) — adopting ACOEM and
 * ODG evidence-based guidelines.
 */
export const MTUS_GUIDELINES: Record<MtusCategory, MtusGuidelineEntry[]> = {
  // -------------------------------------------------------------------------
  // Low Back Disorders — 8 CCR §9792.23.5 (ACOEM Low Back Disorders)
  // 6 entries — most common WC injury site
  // -------------------------------------------------------------------------
  'low-back': [
    {
      guidelineId: 'mtus-lowback-001',
      title: 'MTUS Low Back — Initial Conservative Care',
      relevance: 0.94,
      guidelineText:
        'Per the MTUS Low Back Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.5): ' +
        'For acute low back pain without red flags, the recommended initial care includes ' +
        'activity modification (avoiding strict bed rest beyond 2 days), NSAIDs, and ' +
        'patient education emphasizing return to activity. Passive modalities such as ' +
        'continuous bed rest or prolonged immobilization are not supported by the evidence.',
      sourceSection: '8 CCR 9792.23.5 — Low Back Disorders, Initial Care',
      recommendedFrequency: 'Activity restoration as tolerated',
      recommendedDuration: 'Reassess at 2-4 weeks',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-lowback-002',
      title: 'MTUS Low Back — Imaging Indications',
      relevance: 0.88,
      guidelineText:
        'Per the MTUS Low Back Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.5): ' +
        'Lumbar imaging (MRI, CT, or radiography) is not indicated within the first 6 weeks ' +
        'of acute low back pain in the absence of red flags. Red flags warranting earlier ' +
        'imaging include progressive neurologic deficit, suspected cauda equina syndrome, ' +
        'suspected fracture, suspected infection, or suspected malignancy. MRI is the modality ' +
        'of choice when radiculopathy persists beyond 4-6 weeks of conservative care.',
      sourceSection: '8 CCR 9792.23.5 — Low Back Disorders, Diagnostic Studies',
      recommendedFrequency: 'Single study unless clinical change',
      recommendedDuration: 'After 4-6 weeks of failed conservative care',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-lowback-003',
      title: 'MTUS Low Back — Physical Therapy',
      relevance: 0.91,
      guidelineText:
        'Per the MTUS Low Back Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.5): ' +
        'Physical therapy emphasizing active exercise is recommended for subacute and chronic ' +
        'low back pain when symptoms persist beyond 4 weeks of initial conservative care. ' +
        'Passive modalities (ultrasound, TENS, hot/cold packs) as standalone treatment are ' +
        'not supported. The MTUS Postsurgical Treatment Guidelines (8 CCR §9792.24.3) govern ' +
        'PT after spinal surgery.',
      sourceSection: '8 CCR 9792.23.5 — Low Back Disorders, Therapy',
      recommendedFrequency: 'PT 2-3 sessions/week',
      recommendedDuration: '4-6 weeks initial, reassess',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-lowback-004',
      title: 'MTUS Low Back — Lumbar Epidural Steroid Injections',
      relevance: 0.84,
      guidelineText:
        'Per the MTUS Low Back Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.5): ' +
        'Lumbar epidural steroid injections may be considered for radicular pain confirmed by ' +
        'imaging that has not responded to at least 4-6 weeks of conservative treatment. ' +
        'The criteria specify a maximum of 2 diagnostic injections; if therapeutic response ' +
        'is documented, additional injections are limited to 4 per year per region. ' +
        'Fluoroscopic guidance is required.',
      sourceSection: '8 CCR 9792.23.5 — Low Back Disorders, Injection Therapy',
      recommendedFrequency: 'Up to 4 per region per year if documented benefit',
      recommendedDuration: 'Discontinue if no functional benefit after 2 injections',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
    {
      guidelineId: 'mtus-lowback-005',
      title: 'MTUS Low Back — Lumbar Fusion Surgery',
      relevance: 0.80,
      guidelineText:
        'Per the MTUS Low Back Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.5): ' +
        'Lumbar fusion surgery for degenerative disc disease without instability is generally ' +
        'not supported by the evidence. Fusion may be considered for documented spondylolisthesis ' +
        'with radiculopathy or for spinal instability after failed conservative care of at ' +
        'least 6 months. Pre-surgical psychological screening is required when surgery is ' +
        'considered for chronic pain indications.',
      sourceSection: '8 CCR 9792.23.5 — Low Back Disorders, Surgical Considerations',
      recommendedFrequency: 'N/A — surgical procedure',
      recommendedDuration: 'After ≥6 months conservative failure',
      evidenceLevel: 'Strength of Evidence — C (Limited)',
    },
    {
      guidelineId: 'mtus-lowback-006',
      title: 'MTUS Low Back — Lumbar Discectomy',
      relevance: 0.83,
      guidelineText:
        'Per the MTUS Low Back Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.5): ' +
        'Lumbar discectomy is supported for radiculopathy with imaging-confirmed disc herniation ' +
        'corresponding to the clinical level when symptoms persist beyond 4-6 weeks of ' +
        'conservative treatment, or earlier when there is progressive neurologic deficit or ' +
        'cauda equina syndrome. Microdiscectomy and standard open discectomy have equivalent ' +
        'long-term outcomes.',
      sourceSection: '8 CCR 9792.23.5 — Low Back Disorders, Surgical Considerations',
      recommendedFrequency: 'N/A — surgical procedure',
      recommendedDuration: 'After 4-6 weeks conservative failure (or earlier with red flags)',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
  ],

  // -------------------------------------------------------------------------
  // Neck & Upper Back Disorders — 8 CCR §9792.23.6
  // 3 entries
  // -------------------------------------------------------------------------
  neck: [
    {
      guidelineId: 'mtus-neck-001',
      title: 'MTUS Neck — Initial Conservative Care',
      relevance: 0.92,
      guidelineText:
        'Per the MTUS Neck and Upper Back Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.6): ' +
        'Initial care for acute cervical pain without red flags consists of activity modification, ' +
        'NSAIDs, gentle range-of-motion exercises, and patient education. Cervical collars are ' +
        'limited to a maximum of 1-3 days for acute injuries; prolonged collar use is not ' +
        'supported. Manipulation is supported for acute pain when applied by a qualified provider.',
      sourceSection: '8 CCR 9792.23.6 — Neck and Upper Back, Initial Care',
      recommendedFrequency: 'Active care daily',
      recommendedDuration: 'Reassess at 2-4 weeks',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-neck-002',
      title: 'MTUS Neck — Cervical Epidural Steroid Injections',
      relevance: 0.83,
      guidelineText:
        'Per the MTUS Neck and Upper Back Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.6): ' +
        'Cervical epidural steroid injections may be considered for radicular pain corresponding ' +
        'to imaging-confirmed pathology when symptoms persist after 4-6 weeks of conservative care. ' +
        'The criteria require fluoroscopic guidance. Maximum of 2 diagnostic injections; if ' +
        'therapeutic response is documented, repeat injections are limited to 3 per region per year.',
      sourceSection: '8 CCR 9792.23.6 — Neck and Upper Back, Injection Therapy',
      recommendedFrequency: 'Up to 3 per region per year if documented benefit',
      recommendedDuration: 'Discontinue if no functional benefit after 2',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
    {
      guidelineId: 'mtus-neck-003',
      title: 'MTUS Neck — Anterior Cervical Discectomy and Fusion (ACDF)',
      relevance: 0.81,
      guidelineText:
        'Per the MTUS Neck and Upper Back Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.6): ' +
        'ACDF is supported for cervical radiculopathy or myelopathy with imaging-confirmed ' +
        'pathology corresponding to clinical findings, after failure of 6-12 weeks of conservative ' +
        'treatment, or earlier for progressive neurologic deficit. Pre-surgical psychological ' +
        'screening is required for elective procedures performed for pain indications.',
      sourceSection: '8 CCR 9792.23.6 — Neck and Upper Back, Surgical Considerations',
      recommendedFrequency: 'N/A — surgical procedure',
      recommendedDuration: 'After 6-12 weeks conservative failure',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
  ],

  // -------------------------------------------------------------------------
  // Shoulder Disorders — 8 CCR §9792.23.4
  // 4 entries
  // -------------------------------------------------------------------------
  shoulder: [
    {
      guidelineId: 'mtus-shoulder-001',
      title: 'MTUS Shoulder — Rotator Cuff Tendinopathy',
      relevance: 0.93,
      guidelineText:
        'Per the MTUS Shoulder Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.4): ' +
        'Initial care for rotator cuff tendinopathy or impingement consists of activity ' +
        'modification, NSAIDs, ice, and a structured exercise program emphasizing rotator cuff ' +
        'and scapular stabilization. Subacromial corticosteroid injection may be considered when ' +
        'symptoms persist beyond 2-3 weeks. Surgical referral is not supported until 6-12 weeks ' +
        'of conservative care has been completed.',
      sourceSection: '8 CCR 9792.23.4 — Shoulder Disorders, Tendinopathy',
      recommendedFrequency: 'PT 2-3 sessions/week; injections max 3 per year',
      recommendedDuration: '6-12 weeks conservative before surgical evaluation',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-shoulder-002',
      title: 'MTUS Shoulder — Subacromial Decompression',
      relevance: 0.81,
      guidelineText:
        'Per the MTUS Shoulder Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.4): ' +
        'Arthroscopic subacromial decompression is supported for impingement syndrome that has ' +
        'not responded to 3-6 months of structured conservative treatment, including ' +
        'documented physical therapy and at least one subacromial injection. Recent evidence ' +
        'has narrowed the indications; isolated bursectomy without confirmed structural ' +
        'pathology is generally not supported.',
      sourceSection: '8 CCR 9792.23.4 — Shoulder Disorders, Surgical Considerations',
      recommendedFrequency: 'N/A — surgical procedure',
      recommendedDuration: 'After 3-6 months conservative failure',
      evidenceLevel: 'Strength of Evidence — C (Limited)',
    },
    {
      guidelineId: 'mtus-shoulder-003',
      title: 'MTUS Shoulder — Rotator Cuff Repair',
      relevance: 0.86,
      guidelineText:
        'Per the MTUS Shoulder Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.4): ' +
        'Surgical repair of full-thickness rotator cuff tears is supported in appropriate ' +
        'surgical candidates, particularly when MRI confirms a complete tear with retraction. ' +
        'For partial-thickness tears, conservative management is supported as the initial approach. ' +
        'Postoperative rehabilitation per the MTUS Postsurgical Treatment Guidelines ' +
        '(8 CCR §9792.24.3) is required.',
      sourceSection: '8 CCR 9792.23.4 — Shoulder Disorders, Surgical Considerations',
      recommendedFrequency: 'N/A — surgical procedure',
      recommendedDuration: 'Postop PT: 12-16 weeks',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
    {
      guidelineId: 'mtus-shoulder-004',
      title: 'MTUS Shoulder — Adhesive Capsulitis',
      relevance: 0.79,
      guidelineText:
        'Per the MTUS Shoulder Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.4): ' +
        'Adhesive capsulitis (frozen shoulder) is a self-limited condition. Initial management ' +
        'consists of NSAIDs, range-of-motion exercises, and patient education that resolution ' +
        'typically occurs over 12-18 months. Intra-articular corticosteroid injection is supported ' +
        'for the acute painful phase. Manipulation under anesthesia is reserved for cases ' +
        'persisting beyond 3-6 months despite conservative care.',
      sourceSection: '8 CCR 9792.23.4 — Shoulder Disorders, Adhesive Capsulitis',
      recommendedFrequency: 'PT daily home exercise; injections max 3 per year',
      recommendedDuration: 'Conservative care 3-6 months before MUA consideration',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
  ],

  // -------------------------------------------------------------------------
  // Elbow Disorders — 8 CCR §9792.23.2
  // 2 entries
  // -------------------------------------------------------------------------
  elbow: [
    {
      guidelineId: 'mtus-elbow-001',
      title: 'MTUS Elbow — Lateral Epicondylitis (Tennis Elbow)',
      relevance: 0.90,
      guidelineText:
        'Per the MTUS Elbow Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.2): ' +
        'Initial management of lateral epicondylitis consists of activity modification, NSAIDs, ' +
        'ice, and counterforce bracing. Eccentric strengthening exercises are supported as ' +
        'first-line therapy. Corticosteroid injections provide short-term relief but may worsen ' +
        'long-term outcomes; their use is supported only for severe acute pain. Surgical referral ' +
        'is not supported until at least 6-12 months of conservative care.',
      sourceSection: '8 CCR 9792.23.2 — Elbow Disorders, Epicondylitis',
      recommendedFrequency: 'PT 2-3 sessions/week; injections max 1-2 per year',
      recommendedDuration: '6-12 months conservative before surgical consideration',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-elbow-002',
      title: 'MTUS Elbow — Cubital Tunnel Syndrome',
      relevance: 0.82,
      guidelineText:
        'Per the MTUS Elbow Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.2): ' +
        'Initial management of cubital tunnel syndrome (ulnar neuropathy at the elbow) ' +
        'consists of activity modification (avoiding prolonged elbow flexion), nighttime ' +
        'extension splinting, and patient education. Electrodiagnostic studies (NCV/EMG) are ' +
        'supported to confirm diagnosis and assess severity prior to surgical consideration. ' +
        'Surgical decompression is supported when conservative care fails after 3-6 months or ' +
        'when there is documented motor weakness.',
      sourceSection: '8 CCR 9792.23.2 — Elbow Disorders, Cubital Tunnel',
      recommendedFrequency: 'Splinting nightly for 4-8 weeks',
      recommendedDuration: '3-6 months conservative before surgical evaluation',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
  ],

  // -------------------------------------------------------------------------
  // Hand, Wrist, & Forearm Disorders — 8 CCR §9792.23.3
  // 4 entries
  // -------------------------------------------------------------------------
  'hand-wrist': [
    {
      guidelineId: 'mtus-handwrist-001',
      title: 'MTUS Hand/Wrist — Carpal Tunnel Syndrome (Conservative Care)',
      relevance: 0.93,
      guidelineText:
        'Per the MTUS Hand, Wrist, and Forearm Disorders guideline (ACOEM, adopted at ' +
        '8 CCR §9792.23.3): Initial management of carpal tunnel syndrome consists of nighttime ' +
        'wrist splinting in neutral position, activity modification, and NSAIDs. Carpal tunnel ' +
        'corticosteroid injection is supported when splinting alone is insufficient. Electrodiagnostic ' +
        'studies (NCV/EMG) are required to confirm diagnosis prior to surgical referral.',
      sourceSection: '8 CCR 9792.23.3 — Hand/Wrist/Forearm, CTS Conservative',
      recommendedFrequency: 'Splinting continuous 4-6 weeks; injection max 2 per year',
      recommendedDuration: '6-8 weeks before surgical evaluation',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-handwrist-002',
      title: 'MTUS Hand/Wrist — Carpal Tunnel Release',
      relevance: 0.86,
      guidelineText:
        'Per the MTUS Hand, Wrist, and Forearm Disorders guideline (ACOEM, adopted at ' +
        '8 CCR §9792.23.3): Carpal tunnel release surgery is supported when electrodiagnostic ' +
        'studies confirm CTS and conservative treatment of 2-7 weeks has failed; immediately ' +
        'for severe cases with thenar atrophy or constant numbness. Open and endoscopic ' +
        'techniques have equivalent long-term outcomes; endoscopic release allows earlier ' +
        'return to work.',
      sourceSection: '8 CCR 9792.23.3 — Hand/Wrist/Forearm, CTS Surgical',
      recommendedFrequency: 'N/A — surgical procedure',
      recommendedDuration: 'Postop light duty 4-6 weeks',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-handwrist-003',
      title: 'MTUS Hand/Wrist — De Quervain Tenosynovitis',
      relevance: 0.85,
      guidelineText:
        'Per the MTUS Hand, Wrist, and Forearm Disorders guideline (ACOEM, adopted at ' +
        '8 CCR §9792.23.3): Initial management of De Quervain tenosynovitis consists of ' +
        'activity modification, thumb spica splinting, NSAIDs, and ice. Corticosteroid injection ' +
        'into the first dorsal compartment is supported for cases not responding to splinting ' +
        'alone. Surgical release is reserved for cases failing 6 months of conservative care ' +
        'including at least one injection.',
      sourceSection: '8 CCR 9792.23.3 — Hand/Wrist/Forearm, De Quervain',
      recommendedFrequency: 'Splinting continuous 4-6 weeks; injection max 2-3 per year',
      recommendedDuration: '6 months conservative before surgical evaluation',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
    {
      guidelineId: 'mtus-handwrist-004',
      title: 'MTUS Hand/Wrist — Wrist Sprain Initial Care',
      relevance: 0.84,
      guidelineText:
        'Per the MTUS Hand, Wrist, and Forearm Disorders guideline (ACOEM, adopted at ' +
        '8 CCR §9792.23.3): Initial care for acute wrist sprains without fracture consists of ' +
        'protective splinting for 1-2 weeks, ice, NSAIDs, and progressive return to activity. ' +
        'Imaging (radiographs) is supported when fracture is suspected based on tenderness in ' +
        'the anatomic snuffbox or specific clinical criteria. MRI or CT is reserved for cases ' +
        'with persistent pain after initial radiographs are negative.',
      sourceSection: '8 CCR 9792.23.3 — Hand/Wrist/Forearm, Sprains',
      recommendedFrequency: 'Splinting 1-2 weeks; reassess weekly',
      recommendedDuration: 'Reassess at 2-4 weeks',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
  ],

  // -------------------------------------------------------------------------
  // Knee Disorders — 8 CCR §9792.23.7
  // 4 entries
  // -------------------------------------------------------------------------
  knee: [
    {
      guidelineId: 'mtus-knee-001',
      title: 'MTUS Knee — Acute Meniscal Injury',
      relevance: 0.91,
      guidelineText:
        'Per the MTUS Knee Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.7): ' +
        'Initial care for suspected meniscal injury consists of RICE protocol (rest, ice, ' +
        'compression, elevation), NSAIDs, and progressive weight-bearing as tolerated. MRI is ' +
        'supported when mechanical symptoms (locking, catching, giving way) persist beyond ' +
        '2-4 weeks of conservative care. Physical therapy emphasizing quadriceps strengthening ' +
        'is the supported first-line treatment for stable tears.',
      sourceSection: '8 CCR 9792.23.7 — Knee Disorders, Meniscal Injury',
      recommendedFrequency: 'PT 2-3 sessions/week',
      recommendedDuration: '6-8 weeks before surgical evaluation',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-knee-002',
      title: 'MTUS Knee — Arthroscopic Partial Meniscectomy',
      relevance: 0.84,
      guidelineText:
        'Per the MTUS Knee Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.7): ' +
        'Arthroscopic partial meniscectomy is supported for symptomatic meniscal tears with ' +
        'mechanical symptoms (locking, catching) that have not responded to conservative ' +
        'treatment. Arthroscopic debridement alone for osteoarthritis without mechanical symptoms ' +
        'is not supported by the evidence. Postoperative PT per the MTUS Postsurgical ' +
        'Treatment Guidelines (8 CCR §9792.24.3) is required.',
      sourceSection: '8 CCR 9792.23.7 — Knee Disorders, Surgical Considerations',
      recommendedFrequency: 'N/A — surgical procedure',
      recommendedDuration: 'Postop PT: 8-12 weeks',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-knee-003',
      title: 'MTUS Knee — Anterior Cruciate Ligament (ACL) Reconstruction',
      relevance: 0.85,
      guidelineText:
        'Per the MTUS Knee Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.7): ' +
        'ACL reconstruction is supported for active patients with documented ACL deficiency ' +
        'and functional instability or for athletic occupational demands. Bracing and structured ' +
        'rehabilitation is the supported initial approach for older sedentary patients. ' +
        'Pre-surgical conditioning improves postoperative outcomes. Return-to-work timing ' +
        'depends on occupation: 4-8 weeks for sedentary, 4-6 months for heavy labor.',
      sourceSection: '8 CCR 9792.23.7 — Knee Disorders, ACL',
      recommendedFrequency: 'N/A — surgical procedure',
      recommendedDuration: 'Postop PT: 6-9 months full recovery',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-knee-004',
      title: 'MTUS Knee — Total Knee Arthroplasty for Osteoarthritis',
      relevance: 0.80,
      guidelineText:
        'Per the MTUS Knee Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.7): ' +
        'Total knee arthroplasty is supported for advanced osteoarthritis with imaging-confirmed ' +
        'joint space narrowing and functional impairment that has failed at least 6 months of ' +
        'conservative treatment including NSAIDs, weight management counseling, and physical ' +
        'therapy. Pre-surgical psychological screening is required. Postoperative rehabilitation ' +
        'per 8 CCR §9792.24.3 is required.',
      sourceSection: '8 CCR 9792.23.7 — Knee Disorders, Arthroplasty',
      recommendedFrequency: 'N/A — surgical procedure',
      recommendedDuration: 'Postop PT: 6-12 weeks',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
  ],

  // -------------------------------------------------------------------------
  // Ankle & Foot Disorders — 8 CCR §9792.23.8
  // 2 entries
  // -------------------------------------------------------------------------
  'ankle-foot': [
    {
      guidelineId: 'mtus-anklefoot-001',
      title: 'MTUS Ankle/Foot — Acute Ankle Sprain',
      relevance: 0.91,
      guidelineText:
        'Per the MTUS Ankle and Foot Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.8): ' +
        'Initial care for acute ankle sprain consists of RICE protocol, functional bracing ' +
        '(air-cast or lace-up brace) rather than rigid immobilization, NSAIDs, and early ' +
        'progressive weight-bearing as tolerated. Radiographs are indicated per the Ottawa ' +
        'Ankle Rules. Physical therapy emphasizing proprioception and strengthening reduces ' +
        'recurrence.',
      sourceSection: '8 CCR 9792.23.8 — Ankle/Foot, Sprains',
      recommendedFrequency: 'Functional brace 1-2 weeks; PT 2 sessions/week',
      recommendedDuration: '4-6 weeks rehabilitation',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-anklefoot-002',
      title: 'MTUS Ankle/Foot — Plantar Fasciitis',
      relevance: 0.86,
      guidelineText:
        'Per the MTUS Ankle and Foot Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.8): ' +
        'Initial management of plantar fasciitis consists of plantar/calf stretching, supportive ' +
        'footwear, prefabricated arch supports, NSAIDs, and activity modification. Night splints ' +
        'are supported for symptoms persisting beyond 4-6 weeks. Corticosteroid injection ' +
        'provides short-term relief but increases plantar fascia rupture risk; use is limited. ' +
        'Surgical release is reserved for cases failing 6-12 months of conservative care.',
      sourceSection: '8 CCR 9792.23.8 — Ankle/Foot, Plantar Fasciitis',
      recommendedFrequency: 'Stretching daily; injection max 1-2 per year',
      recommendedDuration: '6-12 months conservative before surgical consideration',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
  ],

  // -------------------------------------------------------------------------
  // Chronic Pain Medical Treatment Guideline — 8 CCR §9792.24.2
  // 5 entries — cross-cutting
  // -------------------------------------------------------------------------
  'chronic-pain': [
    {
      guidelineId: 'mtus-chronicpain-001',
      title: 'MTUS Chronic Pain — Functional Restoration Approach',
      relevance: 0.92,
      guidelineText:
        'Per the MTUS Chronic Pain Medical Treatment Guideline (8 CCR §9792.24.2, adopting ODG ' +
        'Chronic Pain): Chronic pain (pain persisting beyond expected tissue healing time, ' +
        'typically 3 months) is best managed with a functional restoration approach focused on ' +
        'restoring activity rather than eliminating pain. The approach combines patient education, ' +
        'active exercise, behavioral therapy, and activity pacing. Passive modalities and ' +
        'long-term opioid therapy are not the supported standard.',
      sourceSection: '8 CCR 9792.24.2 — Chronic Pain MTG, Functional Restoration',
      recommendedFrequency: 'Multimodal program weekly',
      recommendedDuration: 'Reassess functional gains every 4-6 weeks',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-chronicpain-002',
      title: 'MTUS Chronic Pain — Cognitive Behavioral Therapy',
      relevance: 0.85,
      guidelineText:
        'Per the MTUS Chronic Pain Medical Treatment Guideline (8 CCR §9792.24.2, adopting ODG ' +
        'Chronic Pain): Cognitive Behavioral Therapy (CBT) for chronic pain is supported when ' +
        'pain persists beyond 3 months and is associated with functional impairment, mood ' +
        'symptoms, or fear-avoidance behavior. The supported course is typically 6-10 sessions; ' +
        'continuation beyond 10 sessions requires documented functional improvement.',
      sourceSection: '8 CCR 9792.24.2 — Chronic Pain MTG, Behavioral Therapy',
      recommendedFrequency: '1 session per week',
      recommendedDuration: '6-10 sessions initial; reassess for additional',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-chronicpain-003',
      title: 'MTUS Chronic Pain — Functional Restoration Programs (FRP)',
      relevance: 0.83,
      guidelineText:
        'Per the MTUS Chronic Pain Medical Treatment Guideline (8 CCR §9792.24.2, adopting ODG ' +
        'Chronic Pain): Multidisciplinary Functional Restoration Programs (FRP) are supported ' +
        'for chronic pain (>3 months) with significant functional impairment when single-modality ' +
        'treatment has failed. Entry criteria include documented motivation for return to work, ' +
        'absence of major untreated psychiatric comorbidity, and a treatment plan with specific ' +
        'measurable functional goals. Program duration is typically 80-160 hours.',
      sourceSection: '8 CCR 9792.24.2 — Chronic Pain MTG, FRP',
      recommendedFrequency: '4-8 hours/day, 4-5 days/week',
      recommendedDuration: '4-8 weeks (80-160 hours total)',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-chronicpain-004',
      title: 'MTUS Chronic Pain — Spinal Cord Stimulator (SCS)',
      relevance: 0.78,
      guidelineText:
        'Per the MTUS Chronic Pain Medical Treatment Guideline (8 CCR §9792.24.2, adopting ODG ' +
        'Chronic Pain): Spinal cord stimulation is supported for failed back surgery syndrome ' +
        'with predominant radicular pain and for complex regional pain syndrome (CRPS) when ' +
        'other treatments have failed. Pre-implant requirements include a successful trial ' +
        '(≥50% pain reduction with functional improvement) and pre-implant psychological ' +
        'evaluation. Long-term outcomes data are mixed.',
      sourceSection: '8 CCR 9792.24.2 — Chronic Pain MTG, Implanted Devices',
      recommendedFrequency: 'N/A — implanted device',
      recommendedDuration: 'Trial 5-7 days; permanent if criteria met',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
    {
      guidelineId: 'mtus-chronicpain-005',
      title: 'MTUS Chronic Pain — Topical Analgesics',
      relevance: 0.79,
      guidelineText:
        'Per the MTUS Chronic Pain Medical Treatment Guideline (8 CCR §9792.24.2, adopting ODG ' +
        'Chronic Pain): Topical analgesics for chronic localized musculoskeletal pain are ' +
        'supported as an adjunct when oral medications are contraindicated or insufficient. ' +
        'Topical NSAIDs (diclofenac gel) are supported for localized arthritis pain. Topical ' +
        'lidocaine is supported for localized neuropathic pain. Compounded topical formulations ' +
        'with multiple ingredients are not supported absent FDA approval for the specific indication.',
      sourceSection: '8 CCR 9792.24.2 — Chronic Pain MTG, Topical Agents',
      recommendedFrequency: 'Per product labeling',
      recommendedDuration: 'Reassess at 4 weeks',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
  ],

  // -------------------------------------------------------------------------
  // Opioids Treatment Guidelines — 8 CCR §9792.24.4
  // 3 entries
  // -------------------------------------------------------------------------
  opioids: [
    {
      guidelineId: 'mtus-opioids-001',
      title: 'MTUS Opioids — Acute Pain (≤4 Weeks)',
      relevance: 0.93,
      guidelineText:
        'Per the MTUS Opioids Treatment Guidelines (8 CCR §9792.24.4): For acute pain following ' +
        'injury or surgery, opioid therapy is supported for the shortest duration consistent with ' +
        'expected tissue healing, typically not exceeding 1-2 weeks. Initial prescribing should be ' +
        'limited to immediate-release formulations at the lowest effective dose. Total morphine ' +
        'milligram equivalents (MME) per day should not exceed 50 MME without documented ' +
        'justification.',
      sourceSection: '8 CCR 9792.24.4 — Opioids, Acute Pain',
      recommendedFrequency: 'PRN — short-acting only',
      recommendedDuration: 'Maximum 1-2 weeks initial',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-opioids-002',
      title: 'MTUS Opioids — Chronic Pain (>3 Months)',
      relevance: 0.91,
      guidelineText:
        'Per the MTUS Opioids Treatment Guidelines (8 CCR §9792.24.4): Chronic opioid therapy ' +
        'beyond 3 months is generally not supported as the standard of care for chronic ' +
        'non-cancer pain. When opioid continuation is being considered, requirements include: ' +
        'a written opioid treatment agreement, baseline and periodic urine drug testing, CURES ' +
        'database query, documentation of functional improvement, and a maximum daily dose of ' +
        '50 MME (with justification required for higher doses; doses >90 MME warrant taper or ' +
        'pain management consultation).',
      sourceSection: '8 CCR 9792.24.4 — Opioids, Chronic Pain',
      recommendedFrequency: 'Lowest effective dose, scheduled not PRN',
      recommendedDuration: 'Reassess every 90 days minimum',
      evidenceLevel: 'Strength of Evidence — A (Strong)',
    },
    {
      guidelineId: 'mtus-opioids-003',
      title: 'MTUS Opioids — Tapering and Discontinuation',
      relevance: 0.85,
      guidelineText:
        'Per the MTUS Opioids Treatment Guidelines (8 CCR §9792.24.4): Opioid tapering is ' +
        'supported when daily MME exceeds the recommended threshold, when documented functional ' +
        'improvement is not occurring, when adverse effects outweigh benefits, or when aberrant ' +
        'behavior is identified. Recommended taper rate is a 10% reduction per week (faster for ' +
        'short-term users, slower for long-term high-dose users). Adjunct treatments (CBT, ' +
        'non-opioid analgesics) should be in place during taper.',
      sourceSection: '8 CCR 9792.24.4 — Opioids, Tapering',
      recommendedFrequency: 'Weekly dose reduction during taper',
      recommendedDuration: 'Typically 8-12 weeks for chronic users',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
  ],

  // -------------------------------------------------------------------------
  // Acupuncture Medical Treatment Guidelines — 8 CCR §9792.24.1
  // 2 entries
  // -------------------------------------------------------------------------
  acupuncture: [
    {
      guidelineId: 'mtus-acupuncture-001',
      title: 'MTUS Acupuncture — Initial Trial',
      relevance: 0.88,
      guidelineText:
        'Per the MTUS Acupuncture Medical Treatment Guidelines (8 CCR §9792.24.1): Acupuncture ' +
        'is supported as a treatment option for chronic neck pain, low back pain, headache, and ' +
        'osteoarthritis. The initial trial consists of 3-6 sessions over 1-2 weeks. Continuation ' +
        'beyond the initial trial requires documented functional improvement; without such ' +
        'documentation, acupuncture should be discontinued.',
      sourceSection: '8 CCR 9792.24.1 — Acupuncture, Initial Trial',
      recommendedFrequency: '1-3 sessions per week',
      recommendedDuration: '3-6 sessions initial trial; reassess',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
    {
      guidelineId: 'mtus-acupuncture-002',
      title: 'MTUS Acupuncture — Extended Course',
      relevance: 0.81,
      guidelineText:
        'Per the MTUS Acupuncture Medical Treatment Guidelines (8 CCR §9792.24.1): When the ' +
        'initial acupuncture trial demonstrates documented functional improvement, an extended ' +
        'course of treatment may be supported. The extended course typically does not exceed ' +
        '24 sessions over 6 months. Continuing care beyond this requires documented sustained ' +
        'functional improvement and a clear maintenance plan.',
      sourceSection: '8 CCR 9792.24.1 — Acupuncture, Extended Course',
      recommendedFrequency: '1-2 sessions per week tapering',
      recommendedDuration: 'Up to 24 sessions over 6 months with documented benefit',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
  ],

  // -------------------------------------------------------------------------
  // MTUS Drug Formulary — 8 CCR §9792.27.x
  // 3 entries
  // -------------------------------------------------------------------------
  formulary: [
    {
      guidelineId: 'mtus-formulary-001',
      title: 'MTUS Drug Formulary — Exempt Drugs (Authorization Not Required)',
      relevance: 0.86,
      guidelineText:
        'Per the MTUS Drug Formulary (8 CCR §9792.27.1 et seq.): Drugs designated as "Exempt" ' +
        'on the MTUS Drug List may be dispensed for an FDA-approved indication without ' +
        'prospective utilization review during the first fill, when prescribed within 7 days ' +
        'of the date of injury or within 30 days of the date of surgery. Subsequent fills ' +
        'follow standard utilization review processes. The formulary list is maintained by ' +
        'the Administrative Director and updated quarterly.',
      sourceSection: '8 CCR 9792.27.3 — Drug Formulary, Exempt Drugs',
      recommendedFrequency: 'Per FDA labeling',
      recommendedDuration: '7-day post-injury / 30-day post-surgery exemption window',
      evidenceLevel: 'Regulatory designation (not evidence-rated)',
    },
    {
      guidelineId: 'mtus-formulary-002',
      title: 'MTUS Drug Formulary — Non-Exempt Drugs (Prospective Review)',
      relevance: 0.83,
      guidelineText:
        'Per the MTUS Drug Formulary (8 CCR §9792.27.1 et seq.): Drugs designated as ' +
        '"Non-Exempt" on the MTUS Drug List require prospective utilization review prior to ' +
        'dispensing. Examples include all opioids beyond the initial 7-day post-injury window, ' +
        'most muscle relaxants, gabapentinoids, and compounded medications. UR decisions must ' +
        'cite specific MTUS guideline criteria; the absence of a guideline does not justify ' +
        'denial absent independent evidence-based reasoning.',
      sourceSection: '8 CCR 9792.27.4 — Drug Formulary, Non-Exempt Drugs',
      recommendedFrequency: 'Per UR-approved regimen',
      recommendedDuration: 'Per UR-approved authorization period',
      evidenceLevel: 'Regulatory designation (not evidence-rated)',
    },
    {
      guidelineId: 'mtus-formulary-003',
      title: 'MTUS Drug Formulary — Compounded and Brand-Over-Generic',
      relevance: 0.79,
      guidelineText:
        'Per the MTUS Drug Formulary (8 CCR §9792.27.1 et seq.): Compounded medications are ' +
        'generally not supported absent documented medical necessity (e.g., documented allergy ' +
        'to commercial preparation, FDA-approved indication unavailable in commercial form). ' +
        'Brand-name dispensing when an A-rated generic is available requires "Dispense as ' +
        'Written" justification by the prescribing physician. Brand-over-generic substitution ' +
        'is generally not reimbursable above the generic OMFS rate.',
      sourceSection: '8 CCR 9792.27.21 — Drug Formulary, Compounded & Brand',
      recommendedFrequency: 'Per UR determination',
      recommendedDuration: 'Per UR determination',
      evidenceLevel: 'Regulatory designation (not evidence-rated)',
    },
  ],

  // -------------------------------------------------------------------------
  // Methodology, Strength of Evidence, & Special Topics — §9792.21–§9792.23.9
  // 3 entries
  // -------------------------------------------------------------------------
  methodology: [
    {
      guidelineId: 'mtus-methodology-001',
      title: 'MTUS Methodology — Hierarchy of Evidence',
      relevance: 0.85,
      guidelineText:
        'Per the MTUS regulation (8 CCR §9792.21): The MTUS adopts the ACOEM Practice Guidelines ' +
        'as the presumptively correct evidence-based standard for body-part topics, and ODG for ' +
        'chronic pain and opioids. When the MTUS does not address a particular condition or ' +
        'treatment, the treating physician and UR reviewer may rely on other evidence-based ' +
        'guidelines or peer-reviewed scientific literature, applying the strength-of-evidence ' +
        'hierarchy in 8 CCR §9792.22.',
      sourceSection: '8 CCR 9792.21 — Medical Treatment Utilization Schedule',
      recommendedFrequency: 'N/A — methodology',
      recommendedDuration: 'N/A — methodology',
      evidenceLevel: 'Methodology (not evidence-rated)',
    },
    {
      guidelineId: 'mtus-methodology-002',
      title: 'MTUS Strength of Evidence Ratings',
      relevance: 0.82,
      guidelineText:
        'Per the MTUS regulation (8 CCR §9792.22): MTUS guideline recommendations are rated ' +
        'by strength of evidence. Strong (A) ratings indicate consistent high-quality evidence; ' +
        'Moderate (B) ratings indicate evidence with some inconsistency or methodologic limitations; ' +
        'Limited (C) ratings indicate sparse, conflicting, or low-quality evidence; Insufficient ' +
        '(I) indicates the evidence is too sparse to draw conclusions. UR decisions citing the ' +
        'MTUS must reference the applicable evidence rating and the specific guideline criterion.',
      sourceSection: '8 CCR 9792.22 — Strength of Evidence Ratings',
      recommendedFrequency: 'N/A — methodology',
      recommendedDuration: 'N/A — methodology',
      evidenceLevel: 'Methodology (not evidence-rated)',
    },
    {
      guidelineId: 'mtus-methodology-003',
      title: 'MTUS Eating Disorders Guideline',
      relevance: 0.72,
      guidelineText:
        'Per the MTUS Eating Disorders guideline (ACOEM, adopted at 8 CCR §9792.23.9): ' +
        'Eating disorders arising as a compensable consequence of an industrial injury (e.g., ' +
        'secondary to chronic pain, medication side effects, or psychiatric injury) are addressed ' +
        'with multidisciplinary treatment including medical monitoring, nutritional counseling, ' +
        'and psychotherapy. Specialized eating disorder treatment programs are supported when ' +
        'the diagnosis meets DSM-5 criteria and is causally linked to the industrial injury.',
      sourceSection: '8 CCR 9792.23.9 — Eating Disorders',
      recommendedFrequency: 'Multidisciplinary team weekly',
      recommendedDuration: 'Reassess at 12 weeks',
      evidenceLevel: 'Strength of Evidence — B (Moderate)',
    },
  ],
};

// ---------------------------------------------------------------------------
// Body-part / topic alias map
// ---------------------------------------------------------------------------

/**
 * Map of body-part / topic input strings (lowercased) to MTUS categories.
 * Allows users to query with common phrasings ("back", "lower back", "lumbar")
 * and route them to the correct guideline category.
 */
export const BODY_PART_TO_CATEGORY: Record<string, MtusCategory> = {
  // Low back
  'low back': 'low-back',
  'low back pain': 'low-back',
  'lower back': 'low-back',
  'lumbar': 'low-back',
  'lumbar spine': 'low-back',
  'back': 'low-back',
  'lumbosacral': 'low-back',

  // Neck
  'neck': 'neck',
  'cervical': 'neck',
  'cervical spine': 'neck',
  'upper back': 'neck',
  'thoracic': 'neck',
  'thoracic spine': 'neck',

  // Shoulder
  'shoulder': 'shoulder',
  'rotator cuff': 'shoulder',

  // Elbow
  'elbow': 'elbow',
  'tennis elbow': 'elbow',
  'lateral epicondylitis': 'elbow',
  'cubital tunnel': 'elbow',

  // Hand / Wrist
  'hand': 'hand-wrist',
  'wrist': 'hand-wrist',
  'forearm': 'hand-wrist',
  'carpal tunnel': 'hand-wrist',
  'cts': 'hand-wrist',
  'de quervain': 'hand-wrist',

  // Knee
  'knee': 'knee',
  'meniscus': 'knee',
  'meniscal': 'knee',
  'acl': 'knee',

  // Ankle / Foot
  'ankle': 'ankle-foot',
  'foot': 'ankle-foot',
  'plantar fasciitis': 'ankle-foot',
  'plantar fascia': 'ankle-foot',

  // Cross-cutting topics
  'chronic pain': 'chronic-pain',
  'pain': 'chronic-pain',
  'crps': 'chronic-pain',

  'opioid': 'opioids',
  'opioids': 'opioids',
  'narcotic': 'opioids',

  'acupuncture': 'acupuncture',

  'formulary': 'formulary',
  'drug formulary': 'formulary',
  'medication': 'formulary',

  'methodology': 'methodology',
  'eating disorder': 'methodology',
};

// ---------------------------------------------------------------------------
// CPT code -> category map (used to narrow body-part inference)
// ---------------------------------------------------------------------------

/**
 * Map of common CPT codes to MTUS categories.
 * Used when the user provides a CPT code that more specifically identifies
 * the topic than the body-part text.
 */
export const CPT_TO_CATEGORY: Record<string, MtusCategory> = {
  // Lumbar spine
  '72148': 'low-back', // MRI lumbar
  '72100': 'low-back', // Radiographs lumbar
  '62322': 'low-back', // Lumbar epidural
  '63030': 'low-back', // Lumbar discectomy
  '22612': 'low-back', // Lumbar fusion
  // Cervical spine
  '72141': 'neck', // MRI cervical
  '72040': 'neck', // Radiographs cervical
  '62321': 'neck', // Cervical epidural
  '22551': 'neck', // ACDF
  // Shoulder
  '29826': 'shoulder', // Arthroscopic decompression
  '29827': 'shoulder', // Arthroscopic rotator cuff repair
  '23412': 'shoulder', // Open rotator cuff repair
  '20610': 'shoulder', // Joint injection (large)
  // Elbow
  '24357': 'elbow', // Tenotomy lateral elbow
  '64718': 'elbow', // Cubital tunnel release
  // Hand / Wrist
  '64721': 'hand-wrist', // Carpal tunnel release (open)
  '29848': 'hand-wrist', // Endoscopic carpal tunnel release
  '20526': 'hand-wrist', // Carpal tunnel injection
  '25000': 'hand-wrist', // De Quervain release
  // Knee
  '29881': 'knee', // Arthroscopic meniscectomy
  '29888': 'knee', // ACL reconstruction
  '27447': 'knee', // Total knee arthroplasty
  '20611': 'knee', // Knee injection
  // Ankle / Foot
  '28285': 'ankle-foot', // Hammertoe correction
  '27786': 'ankle-foot', // Ankle fracture closed
  '28190': 'ankle-foot', // Foreign body removal foot
  // Acupuncture
  '97810': 'acupuncture', // Acupuncture initial
  '97811': 'acupuncture', // Acupuncture each additional
  '97813': 'acupuncture', // Acupuncture electrical initial
  '97814': 'acupuncture', // Acupuncture electrical additional
  // Therapy / pain
  '97110': 'chronic-pain', // Therapeutic exercises (general)
  '97140': 'chronic-pain', // Manual therapy
  '90834': 'chronic-pain', // Psychotherapy 45 min (CBT)
  '90837': 'chronic-pain', // Psychotherapy 60 min (CBT)
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return all MTUS guideline entries as a flat array.
 * Order is by category as declared in `MTUS_GUIDELINES`.
 */
export function getAllMtusGuidelines(): MtusGuidelineEntry[] {
  return Object.values(MTUS_GUIDELINES).flat();
}

/**
 * Total number of distinct guideline entries in the knowledge base.
 * Asserted at module load via the data-integrity test suite.
 */
export const MTUS_GUIDELINE_COUNT: number = getAllMtusGuidelines().length;
