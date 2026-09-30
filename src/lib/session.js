import { isDue, isB1Unlocked } from './srs.js';
import { hasGermanVoice } from './speech.js';

/**
 * Fisher-Yates shuffle (returns a new array).
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Maximum number of graded exercises in one session.
 * Keeps practice short enough to fit between clinical shifts;
 * leftover due words simply remain due for the next session.
 */
export const MAX_SESSION_EXERCISES = 15;

/**
 * Pick `count` distractor words, preferring the same theme.
 * Excludes the target word itself.
 *
 * Candidates are drawn from `pool` — the same unlocked word set the session
 * was built from — so locked (e.g. B1) items never leak into answer options.
 * Single-word targets only get single-word distractors and sentence targets
 * only get sentence distractors, so options stay length-matched and the
 * correct answer is never trivially identifiable by its length.
 */
function getDistractors(word, pool, count = 3) {
  const targetIsSentence = !word.article; // single words have articles, sentences don't
  let candidates = pool.filter((w) => w.id !== word.id);

  candidates = targetIsSentence
    ? candidates.filter((w) => !w.article)
    : candidates.filter((w) => Boolean(w.article));

  const sameTheme = shuffle(candidates.filter((w) => w.theme === word.theme));
  const otherTheme = shuffle(candidates.filter((w) => w.theme !== word.theme));
  return [...sameTheme, ...otherTheme].slice(0, count);
}

/**
 * Decide exercise type based on word properties, its current Leitner box, and audio availability.
 *
 * Box 0-1: "mcq" (DE→EN) or "article" (pick der/die/das, only if word has an article)
 * Box 2-3: "listening" (hear audio, pick EN meaning) or "cloze" (fill the blank)
 *          Sentence items get "listening" (or "sentence" typing if no audio).
 *          If audio is unavailable, listening is skipped in favor of cloze / article / mcq / typing.
 * Box 4-5: "typing" (type the German word) or "sentence" (for A2 sentence items)
 *
 * @param {object} progress - SRS progress map, may include per-word `wrongByType` stats
 */
function pickExerciseType(word, box, audioAvailable = hasGermanVoice(), progress = {}) {
  const stats = progress[word.id];
  const wrongByType = stats && stats.wrongByType ? stats.wrongByType : null;

  if (box <= 1) {
    if (word.article) {
      // Adaptive: bias toward the exercise type the learner gets wrong most,
      // falling back to a coin flip when there's no signal yet.
      if (wrongByType) {
        const wMcq = wrongByType.mcq || 0;
        const wArticle = wrongByType.article || 0;
        if (wMcq !== wArticle) {
          return wMcq > wArticle ? 'mcq' : 'article';
        }
      }
      return Math.random() < 0.5 ? 'mcq' : 'article';
    }
    return 'mcq';
  } else if (box <= 3) {
    if (!audioAvailable) {
      if (word.theme === 'sentences') {
        return 'sentence';
      }
      return 'cloze';
    }
    if (word.theme === 'sentences') {
      return 'listening';
    }
    if (wrongByType) {
      const wListen = wrongByType.listening || 0;
      const wCloze = wrongByType.cloze || 0;
      if (wListen !== wCloze) {
        return wListen > wCloze ? 'listening' : 'cloze';
      }
    }
    return Math.random() < 0.5 ? 'listening' : 'cloze';
  } else {
    if (word.theme === 'sentences') {
      return 'sentence';
    }
    return 'typing';
  }
}

/**
 * Build a single exercise object for a word.
 */
function buildExercise(word, type, pool) {
  const exercise = { word, type };

  switch (type) {
    case 'mcq': {
      // Show German word/sentence, pick the correct English meaning
      const distractors = getDistractors(word, pool);
      exercise.options = shuffle([word.en, ...distractors.map((d) => d.en)]);
      exercise.correct = word.en;
      break;
    }
    case 'article': {
      // Pick the correct article for the word
      exercise.options = ['der', 'die', 'das'];
      exercise.correct = word.article;
      break;
    }
    case 'listening': {
      // Hear the German word, pick the correct English meaning
      const distractors = getDistractors(word, pool);
      exercise.options = shuffle([word.en, ...distractors.map((d) => d.en)]);
      exercise.correct = word.en;
      break;
    }
    case 'cloze': {
      // Blank the German word in its example sentence, pick the correct fill
      exercise.sentence = word.example.replace(word.de, '______');
      exercise.correct = word.de;
      const distractors = getDistractors(word, pool);
      exercise.options = shuffle([word.de, ...distractors.map((d) => d.de)]);
      break;
    }
    case 'typing': {
      // Given the English meaning, type the German word
      exercise.correct = word.de;
      break;
    }
    case 'sentence': {
      // Given the English sentence, type the German sentence
      exercise.correct = word.de;
      break;
    }
  }

  return exercise;
}

/**
 * Build a session queue of exercises.
 *
 * mode "practice": due words (oldest due first) + up to 5 new words.
 * mode "review":   due words only (no new words).
 *
 * Wrong answers should be re-queued at runtime by the Practice component.
 */
export function buildSession(words, progress, mode, audioAvailable = hasGermanVoice()) {
  // Soft-gate B1: exclude B1 words from the pool when B1 is locked
  const pool = isB1Unlocked(words, progress)
    ? words
    : words.filter((w) => w.level !== 'B1');

  const dueWords = [];
  const newWords = [];

  for (const word of pool) {
    const p = progress[word.id];
    if (!p) {
      newWords.push(word);
    } else if (isDue(p)) {
      dueWords.push({ word, due: p.due });
    }
  }

  // Sort due words oldest-first
  dueWords.sort((a, b) => a.due - b.due);

  let sessionWords;

  if (mode === 'review') {
    sessionWords = dueWords.map((d) => d.word);
  } else {
    // practice: due words + up to 5 new
    sessionWords = [
      ...dueWords.map((d) => d.word),
      ...newWords.slice(0, 5),
    ];
  }  // Build an exercise queue (inserting an intro step before each word with no progress entry)
  const exercises = [];
  for (const word of sessionWords) {
    if (exercises.filter((item) => item.type !== 'intro').length >= MAX_SESSION_EXERCISES) {
      break; // session cap reached; remaining due words stay due for next time
    }
    const p = progress[word.id];
    if (!p) {
      exercises.push({
        word,
        type: 'intro',
        isIntro: true,
      });
    }
    const box = p ? p.box : 0;
    const type = pickExerciseType(word, box, audioAvailable, progress);
    exercises.push(buildExercise(word, type, pool));
  }

  return exercises;
}

/**
 * Build one random exercise for a single word (used by Daily Challenges, Test
 * and level fallback sessions). Picks the exercise type uniformly from the
 * types that word supports (article only for words with articles, sentence
 * typing only for sentences); "listening" is excluded when audio is
 * unavailable so every generated question stays answerable.
 */
export function buildSingleExercise(word, pool, audioAvailable = hasGermanVoice()) {
  const isSentence = !word.article;
  const types = isSentence
    ? audioAvailable
      ? ['mcq', 'listening', 'sentence']
      : ['mcq', 'sentence']
    : audioAvailable
      ? ['mcq', 'article', 'listening', 'cloze', 'typing']
      : ['mcq', 'article', 'cloze', 'typing'];
  const type = types[Math.floor(Math.random() * types.length)];
  return buildExercise(word, type, pool);
}
