// Leitner spaced-repetition system
// Boxes 0-5, intervals in days: [0, 1, 2, 4, 8, 16]

export const INTERVALS = [0, 1, 2, 4, 8, 16];
export const DEV_INTERVALS = [0, 1, 2, 3, 5, 8]; // in minutes
export const MAX_BOX = 5;

/**
 * Returns true if ?dev=1 is present in the current URL query string.
 */
export function isDevMode() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('dev') === '1';
}

/**
 * Grade a word after an answer.
 * Correct: promote to next box (max 5), set due date.
 * Wrong: demote to box 0, due immediately, increment wrong count.
 * Always increments seen count.
 */
export function grade(progress, correct) {
  const now = Date.now();
  if (correct) {
    const newBox = Math.min(progress.box + 1, MAX_BOX);
    const intervalMs = isDevMode()
      ? DEV_INTERVALS[newBox] * 60 * 1000
      : INTERVALS[newBox] * 24 * 60 * 60 * 1000;
    return {
      box: newBox,
      due: now + intervalMs,
      seen: progress.seen + 1,
      wrong: progress.wrong,
    };
  } else {
    return {
      box: 0,
      due: now,
      seen: progress.seen + 1,
      wrong: progress.wrong + 1,
    };
  }
}

/**
 * Returns true if the word is due for review.
 */
export function isDue(p) {
  return Date.now() >= p.due;
}

/**
 * Returns true if the word is considered mastered (box >= 4).
 */
export function isMastered(p) {
  return p.box >= 4;
}

/**
 * Returns re-encounter phrasing for when a missed word will next be seen after this session,
 * based on the box 1 interval.
 */
export function getReencounterText() {
  if (isDevMode()) {
    const mins = DEV_INTERVALS[1];
    return mins === 1 ? 'in a minute' : `in ${mins} minutes`;
  }
  const days = INTERVALS[1];
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/**
 * Compute the four mastery stages from per-word progress data:
 * - New: words with no progress entry (never attempted)
 * - Learning: progress.box in [0, 1]
 * - Familiar: progress.box in [2, 3]
 * - Mastered: progress.box in [4, 5]
 */
export function computeStages(words, progress = {}) {
  let newCount = 0;
  let learningCount = 0;
  let familiarCount = 0;
  let masteredCount = 0;

  for (const word of words) {
    const p = progress[word.id];
    if (!p) {
      newCount++;
    } else if (p.box === 0 || p.box === 1) {
      learningCount++;
    } else if (p.box === 2 || p.box === 3) {
      familiarCount++;
    } else if (p.box >= 4) {
      masteredCount++;
    } else {
      newCount++;
    }
  }

  return {
    newCount,
    learningCount,
    familiarCount,
    masteredCount,
    total: words.length,
  };
}

/**
 * Returns B1 unlock status and statistics:
 * B1 unlocks after roughly 60% of A1 words reach Familiar (box >= 2) or above.
 */
export function getB1Progress(words, progress = {}) {
  const a1Words = words.filter((w) => w.level === 'A1');
  if (a1Words.length === 0) {
    return { unlocked: true, percentage: 100, familiarCount: 0, requiredCount: 0, totalA1: 0 };
  }

  const familiarCount = a1Words.filter((w) => {
    const p = progress[w.id];
    return p && p.box >= 2;
  }).length;

  const percentage = Math.round((familiarCount / a1Words.length) * 100);
  const requiredCount = Math.ceil(a1Words.length * 0.6);
  const unlocked = percentage >= 60;

  return {
    unlocked,
    percentage,
    familiarCount,
    requiredCount,
    totalA1: a1Words.length,
  };
}

export function isB1Unlocked(words, progress = {}) {
  return getB1Progress(words, progress).unlocked;
}


