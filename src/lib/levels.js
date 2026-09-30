// Accessor layer for src/data/levels.json.
// Tab 3 (Current Level) and Tab 4 (Test timing) read everything through these
// helpers so the JSON stays the single source of truth.

import levelsData from '../data/levels.json';
import words from '../data/words.json';
import { getLevelCompletion } from './storage.js';
import { getB1Progress } from './srs.js';

export const LEVELS = levelsData.levels;
export const TEST_CONFIG = levelsData.test;

/** Find a level definition by id. */
export function getLevelById(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

/**
 * Words belonging to a level, in defined order.
 * Resolves `wordIds` against the word bank.
 */
export function getLevelWords(level) {
  if (!level || !Array.isArray(level.wordIds)) return [];
  const byId = new Map(words.map((w) => [w.id, w]));
  return level.wordIds.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Is this level playable? Content levels are; stretch levels are stubs.
 */
export function isLevelPlayable(level) {
  return Boolean(level) && !level.comingSoon;
}

/**
 * A level is unlocked when the previous playable level is 100% complete
 * (first-pass completion, from the level-completion store). The first playable
 * level is always unlocked. B1-gated levels also need the A1 familiarity gate.
 */
export function isLevelUnlocked(level, progress, completionMap = null) {
  if (!isLevelPlayable(level)) return false;
  const idx = LEVELS.findIndex((l) => l.id === level.id);
  if (idx <= 0) return true;
  const prevPlayable = [...LEVELS.slice(0, idx)].reverse().find((l) => isLevelPlayable(l));
  if (!prevPlayable) return true;
  const { allDone } = getLevelProgress(prevPlayable, completionMap);
  if (!allDone) return false;
  if (level.b1Gated) return getB1Progress(words, progress).unlocked;
  return true;
}

/**
 * Words from every unlocked level (completed or in-progress). Used to scope
 * the Test pool so it never draws from locked/future levels.
 */
export function getUnlockedLevelWords(progress, completionMap = null) {
  const unlockedLevels = LEVELS.filter((l) => isLevelUnlocked(l, progress, completionMap));
  const ids = new Set(unlockedLevels.flatMap((l) => l.wordIds || []));
  return words.filter((w) => ids.has(w.id));
}

/**
 * Completion for one level: how many of its items are done at least once.
 * Reads ONLY the dedicated level-completion store — never SRS boxes.
 * Returns { done, total, allDone }.
 */
export function getLevelProgress(level, completionMap = null) {
  const wordsInLevel = getLevelWords(level);
  const total = wordsInLevel.length;
  const map = completionMap || getLevelCompletion();
  const doneIds = map[level.id] || [];
  const done = wordsInLevel.filter((w) => doneIds.includes(w.id)).length;
  return { done, total, allDone: total > 0 && done >= total };
}

/**
 * Snapshot for Tab 3: every level with its word list, state and completion.
 * `currentLevelId` marks the level shown as "current" (persisted by the caller).
 */
export function getLevelOverview(progress, currentLevelId = null, completionMap = null) {
  return LEVELS.map((level) => {
    const completion = getLevelProgress(level, completionMap);
    return {
      level,
      words: getLevelWords(level),
      playable: isLevelPlayable(level),
      unlocked: isLevelUnlocked(level, progress, completionMap),
      isCurrent: level.id === currentLevelId,
      completion,
    };
  });
}

/**
 * The learner's current level: the first playable, unlocked level that is not
 * fully complete; the last level if everything is done. Stretch stubs are
 * skipped so they never become "current".
 */
export function getCurrentLevel(progress, completionMap = null) {
  for (const level of LEVELS) {
    if (level.comingSoon) continue;
    if (!isLevelUnlocked(level, progress, completionMap)) continue;
    const { allDone } = getLevelProgress(level, completionMap);
    if (!allDone) return level;
  }
  const last = [...LEVELS].reverse().find((l) => !l.comingSoon);
  return last || LEVELS[0];
}

/**
 * Test timing for Tab 4 from levels.json: seconds for the whole test at the
 * learner's level (more time at low levels, less at high). Falls back to
 * fallbackSeconds when the level has no entry. `mode` says whether the clock
 * is a single total countdown or per question.
 */
export function getTestTiming(levelNumber) {
  const cfg = TEST_CONFIG || {};
  const table = cfg.secondsByLevel || {};
  const seconds = table[String(levelNumber)] || cfg.fallbackSeconds || 180;
  return {
    mode: cfg.mode || 'total',
    questionCount: cfg.questionCount || 10,
    seconds,
  };
}
