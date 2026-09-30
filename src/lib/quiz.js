// Quiz builders for the shell's quiz-style tabs.
// Reuse the existing session engine (buildExercise / buildSingleExercise) —
// this module only decides WHICH words go in and HOW MANY.

import { buildSingleExercise } from './session.js';
import { isB1Unlocked } from './srs.js';
import { getUnlockedLevelWords } from './levels.js';
import { getLevelCompletion } from './storage.js';

/** Fisher-Yates shuffle (returns a new array). */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Words the learner may be quizzed on: everything except locked B1 words. */
function unlockedPool(words, progress) {
  return isB1Unlocked(words, progress) ? words : words.filter((w) => w.level !== 'B1');
}

/**
 * Words due for review right now (SRS due date reached), unlocked pool only.
 * Empty when nothing is due — callers fall back to the most recent session.
 */
export function getDueWords(words, progress) {
  const pool = unlockedPool(words, progress);
  return pool.filter((w) => {
    const p = progress[w.id];
    return p && p.due <= Date.now();
  });
}

/**
 * Build the Daily Challenge queue: 3-5 due words as one random exercise each,
 * reusing the existing exercise builders. If nothing is due, falls back to
 * words from the most recent practice session (lastSessionWordIds).
 */
export function buildDailyChallenge(words, progress, audioAvailable, lastSessionWordIds = []) {
  const pool = unlockedPool(words, progress);
  let due = shuffle(getDueWords(words, progress));
  if (due.length === 0 && lastSessionWordIds.length > 0) {
    const byId = new Map(words.map((w) => [w.id, w]));
    due = shuffle(lastSessionWordIds.map((id) => byId.get(id)).filter(Boolean));
  }
  const picked = due.slice(0, 5);
  if (picked.length === 0) return [];
  // Distractors draw from the full unlocked pool so options never leak locked words
  return picked.map((word) => buildSingleExercise(word, pool, audioAvailable));
}

/**
 * Stars for the daily challenge: 5/5 = 3, 3-4 = 2, 1-2 = 1, 0 = 0.
 * Ratio-based when the quiz is longer than 5 items.
 */
export function starsFor(correct, total) {
  if (total <= 0) return 0;
  if (total <= 5) {
    if (correct >= 5) return 3;
    if (correct >= 3) return 2;
    if (correct >= 1) return 1;
    return 0;
  }
  const ratio = correct / total;
  if (ratio >= 1) return 3;
  if (ratio >= 0.6) return 2;
  if (ratio > 0) return 1;
  return 0;
}

/**
 * Build the cumulative Test queue: `count` exercises from everything unlocked
 * and already touched (not level-scoped); untried words fill any remainder.
 * Uses the existing engine's random-type builder so renderers stay identical.
 */
export function buildTestSession(words, progress, audioAvailable, count = 10) {
  const completion = getLevelCompletion();
  const pool = getUnlockedLevelWords(progress, completion);
  const seen = shuffle(
    pool.filter((w) => {
      const p = progress[w.id];
      return p && p.seen > 0;
    })
  );
  const fresh = shuffle(pool.filter((w) => !progress[w.id]));
  const picked = [...seen, ...fresh].slice(0, Math.max(1, count));
  return picked.map((word) => buildSingleExercise(word, pool, audioAvailable));
}
