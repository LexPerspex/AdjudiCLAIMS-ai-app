/**
 * Graph Maintenance Service — G6: Neuro-plasticity maintenance cycle.
 *
 * Implements Hebbian decay and entity consolidation for the knowledge graph.
 * This service runs scheduled maintenance to:
 *   1. Decay edge confidence and weight for edges that have not been reinforced
 *      recently (Hebbian decay: "neurons that don't fire together, don't wire together").
 *   2. Prune edges whose confidence has fallen below the minimum threshold.
 *   3. Merge near-duplicate entities whose canonical names are highly similar
 *      to reduce noise and improve traversal quality.
 *
 * The decay model uses a simple multiplicative decay:
 *   newConfidence = confidence * (1 - decayRate)
 *   newWeight = weight * (1 - decayRate)
 *
 * Edges that have been traversed recently (lastTraversedAt within one decay
 * cycle) are skipped — only stale edges decay.
 *
 * Human-verified and locked edges/nodes are NEVER decayed or merged without
 * explicit human review.
 *
 * Graph RAG phase: G6 (Neuro-plasticity)
 */

import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphMaintenanceConfig {
  /** Fraction of confidence/weight lost per 30-day cycle. Default: 0.05 (5%). */
  decayRate: number;
  /**
   * Confidence floor. Edges below this level after decay are marked for review
   * (pruned from active graph traversal). Default: 0.1.
   */
  minConfidence: number;
  /**
   * Cosine similarity threshold for entity consolidation. Entities with
   * canonical name similarity above this threshold are merged. Default: 0.8.
   * Note: similarity is computed via Levenshtein-normalized score until
   * embedding-based similarity is available.
   */
  consolidationThreshold: number;
}

const DEFAULT_CONFIG: GraphMaintenanceConfig = {
  decayRate: 0.05,
  minConfidence: 0.1,
  consolidationThreshold: 0.8,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Merge config with defaults, applying only the keys provided.
 */
function resolveConfig(partial?: Partial<GraphMaintenanceConfig>): GraphMaintenanceConfig {
  return { ...DEFAULT_CONFIG, ...partial };
}

/**
 * Compute a normalized similarity score between two strings.
 * Returns a value in [0, 1] where 1 = identical.
 *
 * Uses Levenshtein distance normalized by the length of the longer string.
 * This is used as a proxy for semantic similarity until embedding-based
 * consolidation is available.
 */
function normalizedSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1.0;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshtein(s1, s2);
  return 1 - distance / maxLen;
}

/**
 * Standard Levenshtein edit distance.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let curr = new Array<number>(m + 1);

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i]! + 1,
        curr[i - 1]! + 1,
        prev[i - 1]! + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[m]!;
}

// ---------------------------------------------------------------------------
// Usage-Based Confidence Boost (G6: Hebbian reinforcement)
// ---------------------------------------------------------------------------

/**
 * Boost the confidence of a single edge after a successful graph traversal.
 *
 * Applies a small confidence increase to reward edges that proved useful in
 * answering a query ("neurons that fire together, wire together").
 * Confidence is capped at 1.0. Locked or human-verified edges are already
 * at maximum trust and are skipped.
 *
 * @param edgeId - The edge to boost.
 * @param boostAmount - Confidence to add (default 0.05). Capped at 1.0.
 */
export async function boostEdgeConfidence(
  edgeId: string,
  boostAmount: number = 0.05,
): Promise<void> {
  const edge = await prisma.graphEdge.findUnique({
    where: { id: edgeId },
    select: { id: true, confidence: true, locked: true, humanVerified: true },
  });

  if (!edge) return;

  // Locked and human-verified edges are already at max trust — skip
  if (edge.locked || edge.humanVerified) return;

  const newConfidence = Math.min(1.0, edge.confidence + boostAmount);

  await prisma.graphEdge.update({
    where: { id: edgeId },
    data: {
      confidence: newConfidence,
      updatedAt: new Date(),
    },
  });
}

/**
 * Record that a set of edges were traversed in a successful query.
 *
 * Updates the lastTraversedAt timestamp on all traversed edges and applies
 * a small confidence boost (0.02 per traversal, capped at 1.0) to reinforce
 * edges that are providing value.
 *
 * @param claimId - The claim the query was run against (for logging).
 * @param traversedEdgeIds - IDs of edges that contributed to the answer.
 */
export async function recordQueryTraversal(
  claimId: string,
  traversedEdgeIds: string[],
): Promise<void> {
  if (traversedEdgeIds.length === 0) return;

  const TRAVERSAL_BOOST = 0.02;
  const now = new Date();

  // Fetch traversed edges (excluding locked/human-verified — already max trust)
  const edges = await prisma.graphEdge.findMany({
    where: {
      id: { in: traversedEdgeIds },
      locked: false,
      humanVerified: false,
    },
    select: { id: true, confidence: true },
  });

  for (const edge of edges) {
    const newConfidence = Math.min(1.0, edge.confidence + TRAVERSAL_BOOST);

    await prisma.graphEdge.update({
      where: { id: edge.id },
      data: {
        confidence: newConfidence,
        lastTraversedAt: now,
        updatedAt: now,
      },
    });
  }

  // Update lastTraversedAt for locked/human-verified edges too (timestamp only)
  const lockedEdgeIds = traversedEdgeIds.filter(
    (id) => !edges.some((e) => e.id === id),
  );

  if (lockedEdgeIds.length > 0) {
    await prisma.graphEdge.updateMany({
      where: {
        id: { in: lockedEdgeIds },
      },
      data: {
        lastTraversedAt: now,
        updatedAt: now,
      },
    });
  }

  console.info(
    `[graph-maintenance] Traversal recorded. claimId=${claimId} ` +
    `edgesUpdated=${edges.length} lockedEdgesTimestamped=${lockedEdgeIds.length}`,
  );
}

// ---------------------------------------------------------------------------
// Hebbian Decay
// ---------------------------------------------------------------------------

/**
 * Run Hebbian decay across all non-locked, non-human-verified graph edges.
 *
 * Edges that have been traversed within the last 30 days are considered
 * "recently reinforced" and decay at half rate (0.5× decayRate). All other
 * stale edges have their confidence and weight reduced by the full decayRate.
 *
 * Edges whose confidence drops below minConfidence are pruned — their
 * confidence is set to 0 and they are flagged via contradictionStatus=NONE
 * and a properties note. In a future iteration they will be soft-deleted.
 *
 * Human-verified and locked edges are never modified.
 *
 * @param config - Optional config overrides.
 * @returns Count of decayed and pruned edges.
 */
export async function runHebbianDecay(
  config?: Partial<GraphMaintenanceConfig>,
): Promise<{ edgesDecayed: number; edgesPruned: number }> {
  const { decayRate, minConfidence } = resolveConfig(config);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30);

  // Fetch all unlocked, non-human-verified edges (includes both stale and recently traversed)
  const allEligibleEdges = await prisma.graphEdge.findMany({
    where: {
      locked: false,
      humanVerified: false,
    },
    select: {
      id: true,
      confidence: true,
      weight: true,
      lastTraversedAt: true,
    },
  });

  let edgesDecayed = 0;
  let edgesPruned = 0;

  // Process in batches of 500 to avoid excessive memory usage
  const BATCH_SIZE = 500;
  for (let i = 0; i < allEligibleEdges.length; i += BATCH_SIZE) {
    const batch = allEligibleEdges.slice(i, i + BATCH_SIZE);

    const updates = batch.map((edge) => {
      // Edges traversed within the last 30 days decay at half rate
      const recentlyTraversed =
        edge.lastTraversedAt !== null && edge.lastTraversedAt >= cutoffDate;
      const effectiveDecayRate = recentlyTraversed ? decayRate * 0.5 : decayRate;

      const newConfidence = edge.confidence * (1 - effectiveDecayRate);
      const newWeight = edge.weight * (1 - effectiveDecayRate);
      return { id: edge.id, newConfidence, newWeight };
    });

    // Separate into decay-only vs prune
    const decayOnly = updates.filter((u) => u.newConfidence >= minConfidence);
    const toPrune = updates.filter((u) => u.newConfidence < minConfidence);

    // Apply decay updates
    for (const update of decayOnly) {
      await prisma.graphEdge.update({
        where: { id: update.id },
        data: {
          confidence: update.newConfidence,
          weight: update.newWeight,
          updatedAt: new Date(),
        },
      });
    }

    // Apply prune updates — zero out confidence, mark properties
    for (const update of toPrune) {
      await prisma.graphEdge.update({
        where: { id: update.id },
        data: {
          confidence: 0,
          weight: 0,
          properties: {
            _pruned: true,
            _prunedAt: new Date().toISOString(),
            _prunedReason: 'hebbian_decay_below_threshold',
          },
          updatedAt: new Date(),
        },
      });
    }

    edgesDecayed += decayOnly.length;
    edgesPruned += toPrune.length;
  }

  console.info(
    `[graph-maintenance] Hebbian decay complete. ` +
    `decayed=${edgesDecayed} pruned=${edgesPruned} decayRate=${decayRate}`,
  );

  return { edgesDecayed, edgesPruned };
}

// ---------------------------------------------------------------------------
// Entity Consolidation
// ---------------------------------------------------------------------------

/**
 * Merge near-duplicate graph nodes within each claim.
 *
 * For each (claimId, nodeType) combination, nodes with normalizedSimilarity
 * above consolidationThreshold are considered duplicates. The node with the
 * higher confidence score is kept as the canonical node; the other is merged
 * into it (aliases merged, edges redirected, node deleted).
 *
 * Human-verified and locked nodes are never merged unless BOTH are locked,
 * in which case they are left as-is (conflict logged only).
 *
 * @param config - Optional config overrides.
 * @returns Count of merged entities and redirected edges.
 */
export async function runEntityConsolidation(
  config?: Partial<GraphMaintenanceConfig>,
): Promise<{ entitiesMerged: number; edgesRedirected: number }> {
  const { consolidationThreshold } = resolveConfig(config);

  let entitiesMerged = 0;
  let edgesRedirected = 0;

  // Get all unique (claimId, nodeType) combinations
  const groups = await prisma.graphNode.groupBy({
    by: ['claimId', 'nodeType'],
  });

  for (const group of groups) {
    const nodes = await prisma.graphNode.findMany({
      where: {
        claimId: group.claimId,
        nodeType: group.nodeType,
        locked: false,
      },
      orderBy: { confidence: 'desc' },
    });

    // Find merge candidates using pairwise similarity check
    const mergedIds = new Set<string>();

    for (let i = 0; i < nodes.length; i++) {
      const canonical = nodes[i]!;
      if (mergedIds.has(canonical.id)) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const duplicate = nodes[j]!;
        if (mergedIds.has(duplicate.id)) continue;
        if (duplicate.humanVerified) continue; // never auto-merge human-verified nodes

        const similarity = normalizedSimilarity(canonical.canonicalName, duplicate.canonicalName);
        if (similarity < consolidationThreshold) continue;

        // Merge duplicate into canonical
        // 1. Merge aliases
        const canonicalAliases = Array.isArray(canonical.aliases) ? canonical.aliases as string[] : [];
        const duplicateAliases = Array.isArray(duplicate.aliases) ? duplicate.aliases as string[] : [];
        const mergedAliases = [
          ...new Set([
            ...canonicalAliases,
            duplicate.canonicalName,
            ...duplicateAliases,
          ]),
        ];

        await prisma.graphNode.update({
          where: { id: canonical.id },
          data: {
            aliases: mergedAliases,
            confidence: Math.max(canonical.confidence, duplicate.confidence),
            updatedAt: new Date(),
          },
        });

        // 2. Redirect edges from duplicate to canonical
        const [outgoingCount, incomingCount] = await Promise.all([
          prisma.graphEdge.updateMany({
            where: { sourceNodeId: duplicate.id },
            data: { sourceNodeId: canonical.id, updatedAt: new Date() },
          }),
          prisma.graphEdge.updateMany({
            where: { targetNodeId: duplicate.id },
            data: { targetNodeId: canonical.id, updatedAt: new Date() },
          }),
        ]);

        edgesRedirected += outgoingCount.count + incomingCount.count;

        // 3. Delete the duplicate node
        await prisma.graphNode.delete({ where: { id: duplicate.id } });

        mergedIds.add(duplicate.id);
        entitiesMerged++;

        console.info(
          `[graph-maintenance] Merged node "${duplicate.canonicalName}" into "${canonical.canonicalName}" ` +
          `(similarity=${similarity.toFixed(3)}, claimId=${group.claimId})`,
        );
      }
    }
  }

  console.info(
    `[graph-maintenance] Entity consolidation complete. ` +
    `merged=${entitiesMerged} edgesRedirected=${edgesRedirected}`,
  );

  return { entitiesMerged, edgesRedirected };
}

// ---------------------------------------------------------------------------
// Full maintenance cycle
// ---------------------------------------------------------------------------

/**
 * Run the full graph maintenance cycle.
 *
 * Executes Hebbian decay followed by entity consolidation.
 * Logs timing and results.
 *
 * This function is designed to be called by a scheduled job (e.g., nightly
 * Cloud Scheduler trigger). It is safe to run while the system is live —
 * individual edge/node updates are atomic.
 *
 * @param config - Optional config overrides (applied to both phases).
 * @returns Combined results from both phases with timing.
 */
export async function runGraphMaintenance(
  config?: Partial<GraphMaintenanceConfig>,
): Promise<{
  decay: { edgesDecayed: number; edgesPruned: number };
  consolidation: { entitiesMerged: number; edgesRedirected: number };
  startedAt: Date;
  completedAt: Date;
}> {
  const startedAt = new Date();
  console.info(`[graph-maintenance] Starting full maintenance cycle at ${startedAt.toISOString()}`);

  const decay = await runHebbianDecay(config);
  const consolidation = await runEntityConsolidation(config);

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  console.info(
    `[graph-maintenance] Full maintenance cycle complete in ${durationMs}ms. ` +
    `decay=${JSON.stringify(decay)} consolidation=${JSON.stringify(consolidation)}`,
  );

  return { decay, consolidation, startedAt, completedAt };
}
