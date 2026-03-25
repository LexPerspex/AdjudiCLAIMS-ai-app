/**
 * Training module service — access and assessment grading.
 *
 * Manages the mandatory 4-module training gate for new claims examiners.
 * All examiners must pass all 4 modules before accessing full product features.
 *
 * Security contract: correctOptionId is NEVER included in any return value.
 * It is stripped from question objects before any response leaves this service.
 *
 * Regulatory authority: 10 CCR 2695.6 — every insurer shall adopt and communicate
 * minimum training standards to all claims agents and adjusters.
 *
 * Uses EducationProfile Prisma model:
 *   - trainingModulesCompleted: JSON { [moduleId]: { completedAt, score, passed } }
 *   - isTrainingComplete: boolean — true when all 4 modules passed
 */

import type { InputJsonValue } from '@prisma/client/runtime/library';
import { prisma } from '../db.js';
import {
  TRAINING_MODULES,
  TRAINING_MODULES_BY_ID,
  type TrainingModule,
  type AssessmentQuestion,
} from '../data/training-modules.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A question safe to send to the client — correctOptionId stripped. */
export type SafeQuestion = Omit<AssessmentQuestion, 'correctOptionId'>;

/** A training module safe to send to the client — questions have correctOptionId stripped. */
export type SafeTrainingModule = Omit<TrainingModule, 'questions'> & {
  questions: SafeQuestion[];
};

export interface ModuleCompletionRecord {
  completedAt: string;
  score: number;
  passed: boolean;
}

export type TrainingModulesCompleted = Record<string, ModuleCompletionRecord>;

export interface TrainingStatusModule {
  moduleId: string;
  title: string;
  isComplete: boolean;
  score: number | null;
  completedAt: string | null;
}

export interface TrainingStatus {
  /** True when all 4 modules have been passed. */
  isComplete: boolean;
  modules: TrainingStatusModule[];
}

export interface AssessmentAnswerResult {
  questionId: string;
  correct: boolean;
  explanation: string;
}

export interface AssessmentResult {
  score: number;
  passed: boolean;
  totalQuestions: number;
  correctCount: number;
  results: AssessmentAnswerResult[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip correctOptionId from a single question. */
function sanitizeQuestion(q: AssessmentQuestion): SafeQuestion {
  const { correctOptionId: _stripped, ...safe } = q;
  return safe;
}

/** Strip correctOptionId from all questions on a module. */
function sanitizeModule(mod: TrainingModule): SafeTrainingModule {
  return {
    ...mod,
    questions: mod.questions.map(sanitizeQuestion),
  };
}

/** All module IDs that must be passed to complete training. */
const ALL_MODULE_IDS = TRAINING_MODULES.map((m) => m.id);

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Look up a single training module by ID.
 *
 * Returns the module data including questions, but with correctOptionId
 * stripped from every question for security. Returns null if not found.
 */
export function getModule(moduleId: string): SafeTrainingModule | null {
  const mod = TRAINING_MODULES_BY_ID.get(moduleId);
  if (!mod) return null;
  return sanitizeModule(mod);
}

/**
 * Return all 4 training modules with questions stripped of correctOptionId.
 */
export function getAllModules(): SafeTrainingModule[] {
  return TRAINING_MODULES.map(sanitizeModule);
}

/**
 * Read an examiner's training completion status.
 *
 * Returns per-module completion state derived from EducationProfile
 * and the top-level isTrainingComplete flag.
 */
export async function getTrainingStatus(userId: string): Promise<TrainingStatus> {
  const profile = await prisma.educationProfile.findUnique({
    where: { userId },
    select: {
      isTrainingComplete: true,
      trainingModulesCompleted: true,
    },
  });

  const completed = (profile?.trainingModulesCompleted ?? {}) as unknown as TrainingModulesCompleted;

  const modules: TrainingStatusModule[] = TRAINING_MODULES.map((mod) => {
    const record = completed[mod.id];
    return {
      moduleId: mod.id,
      title: mod.title,
      isComplete: record?.passed === true,
      score: record?.score ?? null,
      completedAt: record?.completedAt ?? null,
    };
  });

  return {
    isComplete: profile?.isTrainingComplete ?? false,
    modules,
  };
}

/**
 * Grade a submitted assessment and persist results if passing.
 *
 * Validates that all questions in the module were answered, grades each
 * answer against the stored correctOptionId, calculates a score, and
 * checks against the module's passingScore threshold.
 *
 * If passed, updates EducationProfile.trainingModulesCompleted. If all
 * 4 modules are now passed, also sets isTrainingComplete = true.
 *
 * Throws if the module is not found or if not all questions are answered.
 */
export async function submitAssessment(
  userId: string,
  moduleId: string,
  answers: { questionId: string; selectedOptionId: string }[],
): Promise<AssessmentResult> {
  const mod = TRAINING_MODULES_BY_ID.get(moduleId);
  if (!mod) {
    throw new Error(`Training module not found: ${moduleId}`);
  }

  // Validate all questions are answered
  const answeredIds = new Set(answers.map((a) => a.questionId));
  const missingIds = mod.questions.filter((q) => !answeredIds.has(q.id)).map((q) => q.id);
  if (missingIds.length > 0) {
    throw new Error(
      `Assessment incomplete — missing answers for questions: ${missingIds.join(', ')}`,
    );
  }

  // Build a lookup of submitted answers
  const answerMap = new Map(answers.map((a) => [a.questionId, a.selectedOptionId]));

  // Grade each question
  const results: AssessmentAnswerResult[] = mod.questions.map((q) => {
    const selected = answerMap.get(q.id);
    const correct = selected === q.correctOptionId;
    return {
      questionId: q.id,
      correct,
      explanation: q.explanation,
    };
  });

  const correctCount = results.filter((r) => r.correct).length;
  const totalQuestions = mod.questions.length;
  const score = totalQuestions > 0 ? correctCount / totalQuestions : 0;
  const passed = score >= mod.passingScore;

  // Persist if passed
  if (passed) {
    const completedAt = new Date().toISOString();

    // Read existing profile to merge JSON
    const existing = await prisma.educationProfile.findUnique({
      where: { userId },
      select: { trainingModulesCompleted: true },
    });

    const current = (existing?.trainingModulesCompleted ?? {}) as unknown as TrainingModulesCompleted;
    const updated: TrainingModulesCompleted = {
      ...current,
      [moduleId]: { completedAt, score, passed: true },
    };

    // Check if all modules are now complete
    const allPassed = ALL_MODULE_IDS.every((id) => updated[id]?.passed === true);

    await prisma.educationProfile.upsert({
      where: { userId },
      create: {
        userId,
        trainingModulesCompleted: updated as unknown as InputJsonValue,
        isTrainingComplete: allPassed,
      },
      update: {
        trainingModulesCompleted: updated as unknown as InputJsonValue,
        isTrainingComplete: allPassed,
      },
    });
  }

  return {
    score,
    passed,
    totalQuestions,
    correctCount,
    results,
  };
}

/**
 * Training gate check — returns true if the user has completed all 4 modules.
 *
 * This is the hard gate used by middleware and route guards. Reads directly
 * from isTrainingComplete on the EducationProfile record.
 */
export async function checkTrainingGate(userId: string): Promise<boolean> {
  const profile = await prisma.educationProfile.findUnique({
    where: { userId },
    select: { isTrainingComplete: true },
  });
  return profile?.isTrainingComplete ?? false;
}
