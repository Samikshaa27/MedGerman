import { loadStreak } from './storage.js';
import { isDevMode } from './srs.js';

const THEME_LABELS = {
  body: 'Body & Anatomy',
  symptoms: 'Symptoms & Vitals',
  patient_care: 'Patient Care',
  sentences: 'Clinical Sentences',
  hospital_places: 'Hospital Places',
};

/**
 * Compute a personal next-milestone line. Priority order:
 * 1. Theme nearing next mastery stage (within 3 correct answers)
 * 2. Streak milestone (within 1 day of multiple of 3 or 7)
 * 3. Round mastery number (within 5 words of 5, 10, 15…)
 * 4. Fallback: next review text
 */
export function computeMilestone(progress, wordsList) {
  // --- Case 1: Theme nearing next mastery stage ---
  const themes = [...new Set(wordsList.map((w) => w.theme))];
  let bestTheme = null;
  let bestThemeGap = Infinity;
  let bestThemeStage = '';

  for (const theme of themes) {
    const themeWords = wordsList.filter((w) => w.theme === theme);
    if (themeWords.length === 0) continue;

    // Count words per stage for this theme
    let learning = 0; // box 0-1
    let familiar = 0; // box 2-3
    let mastered = 0; // box 4-5

    for (const w of themeWords) {
      const p = progress[w.id];
      if (!p) continue;
      if (p.box >= 4) mastered++;
      else if (p.box >= 2) familiar++;
      else learning++;
    }

    const totalSeen = learning + familiar + mastered;
    if (totalSeen === 0) continue; // No progress in this theme yet

    // How many more correct answers to reach next stage?
    // Learning→Familiar: need box>=2, currently box 0-1
    // Count words at box 1 (one correct answer away from box 2 = Familiar)
    const atBox1 = themeWords.filter((w) => {
      const p = progress[w.id];
      return p && p.box === 1;
    }).length;

    // Familiar→Mastered: count words at box 3 (one correct from box 4 = Mastered)
    const atBox3 = themeWords.filter((w) => {
      const p = progress[w.id];
      return p && p.box === 3;
    }).length;

    // Check Familiar→Mastered first (more advanced milestone)
    if (atBox3 > 0 && atBox3 <= 3 && atBox3 < bestThemeGap) {
      bestThemeGap = atBox3;
      bestTheme = theme;
      bestThemeStage = 'Mastered';
    }

    // Check Learning→Familiar
    if (atBox1 > 0 && atBox1 <= 3 && atBox1 < bestThemeGap) {
      bestThemeGap = atBox1;
      bestTheme = theme;
      bestThemeStage = 'Familiar';
    }
  }

  if (bestTheme !== null) {
    const label = THEME_LABELS[bestTheme] || bestTheme;
    return `${bestThemeGap} more correct and ${label} words reach ${bestThemeStage}!`;
  }

  // --- Case 2: Streak milestone ---
  let streak = 0;
  try {
    const streakData = loadStreak();
    streak = streakData.streak || 0;
  } catch {
    streak = 0;
  }

  // Check if practising today would bring streak to a milestone
  const nextStreak = streak + 1;
  if (nextStreak % 7 === 0) {
    return `1 more day for a ${nextStreak}-day streak! 🔥`;
  }
  if (nextStreak % 3 === 0 && nextStreak > streak) {
    return `1 more day for a ${nextStreak}-day streak!`;
  }

  // --- Case 3: Round mastery number ---
  let masteredCount = 0;
  for (const w of wordsList) {
    const p = progress[w.id];
    if (p && p.box >= 4) masteredCount++;
  }

  // Next round number: ceiling to next multiple of 5
  const nextRound = Math.ceil((masteredCount + 1) / 5) * 5;
  const gap = nextRound - masteredCount;
  if (gap > 0 && gap <= 3) {
    return `${gap} word${gap !== 1 ? 's' : ''} away from ${nextRound} mastered! ⭐`;
  }

  // --- Case 4: Fallback — next review info ---
  return getSummaryNextReview(progress, wordsList);
}

/**
 * Calculates the next review string from stored progress and due timestamps.
 */
export function getSummaryNextReview(progress, words) {
  const now = Date.now();
  let dueNowCount = 0;
  let minFutureDue = null;

  for (const word of words) {
    const p = progress[word.id];
    if (!p || !p.due) continue;
    if (now >= p.due) {
      dueNowCount++;
    } else {
      if (minFutureDue === null || p.due < minFutureDue) {
        minFutureDue = p.due;
      }
    }
  }

  if (dueNowCount > 0) {
    return `Next review: ${dueNowCount} word${dueNowCount !== 1 ? 's' : ''} due now`;
  }

  if (minFutureDue === null) {
    return 'Practise again to keep the words fresh.';
  }

  const nextBatchCount =
    words.filter((w) => {
      const p = progress[w.id];
      return p && p.due && Math.abs(p.due - minFutureDue) <= 60000;
    }).length || 1;

  const diffMs = minFutureDue - now;
  const diffMins = Math.max(1, Math.round(diffMs / 60000));
  const diffHours = Math.round(diffMs / 3600000);
  const diffDays = Math.round(diffMs / 86400000);

  let whenStr = '';
  if (isDevMode()) {
    whenStr = diffMins === 1 ? 'in 1 minute (dev)' : `in ${diffMins} minutes (dev)`;
  } else {
    if (diffMs < 3600000) {
      whenStr = `in ${diffMins} min`;
    } else if (diffMs < 86400000) {
      whenStr = diffHours === 1 ? 'in 1 hour' : `in ${diffHours} hours`;
    } else if (diffDays <= 1) {
      whenStr = 'tomorrow';
    } else {
      whenStr = `in ${diffDays} days`;
    }
  }

  return `Next review: ${nextBatchCount} word${nextBatchCount !== 1 ? 's' : ''} ${whenStr}`;
}
