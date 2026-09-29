// localStorage helpers for progress and streak tracking

const PROGRESS_KEY = 'medgerman-progress';
const STREAK_KEY = 'medgerman-streak';
const XP_KEY = 'medgerman-xp';

/**
 * Returns the default progress object for a new word.
 */
export function defaultProgress() {
  return { box: 0, due: 0, seen: 0, wrong: 0 };
}

/**
 * Load all word progress from localStorage.
 * Returns { [wordId]: { box, due, seen, wrong } }
 */
export function loadProgress() {
  try {
    const data = localStorage.getItem(PROGRESS_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

/**
 * Save all word progress to localStorage.
 */
export function saveProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/**
 * Load total XP from localStorage.
 */
export function loadXP() {
  try {
    const val = localStorage.getItem(XP_KEY);
    return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * Save total XP to localStorage.
 */
export function saveXP(xp) {
  try {
    localStorage.setItem(XP_KEY, String(Math.max(0, xp)));
  } catch {}
}

/**
 * Add XP and return updated stats.
 */
export function addXP(amount) {
  const current = loadXP();
  const next = current + Math.max(0, amount);
  saveXP(next);
  return {
    totalXP: next,
    added: amount,
    ...calculateLevel(next),
  };
}

/**
 * Calculates user level from XP thresholds (200 XP per level).
 */
export function calculateLevel(xp = 0) {
  const safeXP = Math.max(0, xp);
  const level = Math.floor(safeXP / 200) + 1;
  const currentXPInLevel = safeXP % 200;
  const levelThreshold = 200;
  const progressPct = Math.min(100, Math.round((currentXPInLevel / levelThreshold) * 100));

  const TITLES = [
    'A1 Einsteiger',
    'Pflege-Assistent',
    'Stations-Praktikant',
    'Pflegefachkraft',
    'MedGerman Meister',
  ];
  const title = TITLES[Math.min(level - 1, TITLES.length - 1)];

  return {
    level,
    currentXPInLevel,
    levelThreshold,
    progressPct,
    title,
  };
}

/**
 * Reset all progress, streak, and XP data in localStorage.
 */
export function resetProgress() {
  localStorage.removeItem(PROGRESS_KEY);
  localStorage.removeItem(STREAK_KEY);
  localStorage.removeItem(XP_KEY);
}

/**
 * Load streak data from localStorage.
 * Returns { streak: number, lastDate: string | null }
 */
export function loadStreak() {
  try {
    const data = localStorage.getItem(STREAK_KEY);
    return data ? JSON.parse(data) : { streak: 0, lastDate: null };
  } catch {
    return { streak: 0, lastDate: null };
  }
}

/**
 * Save streak data to localStorage.
 */
export function saveStreak(streakData) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(streakData));
}

/**
 * Update and return the current day streak.
 * If already practised today, returns current streak.
 * If last practice was yesterday, increments streak.
 * Otherwise resets streak to 1.
 */
export function updateStreak() {
  const { streak, lastDate } = loadStreak();
  const today = new Date().toDateString();

  if (lastDate === today) {
    return streak;
  }

  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let newStreak;

  if (lastDate === yesterday) {
    newStreak = streak + 1;
  } else {
    newStreak = 1;
  }

  saveStreak({ streak: newStreak, lastDate: today });
  return newStreak;
}
