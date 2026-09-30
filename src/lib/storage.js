// localStorage helpers for progress and streak tracking

const PROGRESS_KEY = 'medgerman-progress';
const STREAK_KEY = 'medgerman-streak';
const XP_KEY = 'medgerman-xp';
const DAILY_XP_KEY = 'medgerman-daily-xp';
const PROFILE_KEY = 'medgerman-profile';
const LEVEL_COMPLETION_KEY = 'medgerman-level-completion';
const DAILY_STARS_KEY = 'medgerman-daily-stars';
const TEST_SCORES_KEY = 'medgerman-test-scores';
const SESSIONS_KEY = 'medgerman-sessions';

/** Target XP per day — roughly one short practice session. */
export const DAILY_XP_GOAL = 30;

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
 * Load today's XP total (resets when the calendar day changes).
 * Returns { date: string, xp: number }
 */
export function loadDailyXP() {
  const today = new Date().toDateString();
  try {
    const raw = localStorage.getItem(DAILY_XP_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && data.date === today) {
      return { date: today, xp: Math.max(0, data.xp || 0) };
    }
  } catch {}
  return { date: today, xp: 0 };
}

/**
 * Add XP to today's total and return the updated daily stats.
 */
export function addDailyXP(amount) {
  const today = new Date().toDateString();
  const current = loadDailyXP();
  const xp = Math.max(0, current.xp + Math.max(0, amount));
  try {
    localStorage.setItem(DAILY_XP_KEY, JSON.stringify({ date: today, xp }));
  } catch {}
  return { date: today, xp };
}

/**
 * Export all progress as a portable JSON string (for backup / device transfer).
 */
export function exportProgress() {
  return JSON.stringify({
    app: 'medgerman',
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: loadProgress(),
    streak: loadStreak(),
    xp: loadXP(),
    dailyXP: loadDailyXP(),
    profile: loadProfile(),
    levelCompletion: getLevelCompletion(),
    dailyStars: loadDailyStars(),
    testScores: loadTestScores(),
    sessionsCompleted: loadSessionsCompleted(),
  });
}

/**
 * Import progress from an exportProgress() JSON string.
 * Overwrites current data. Returns { ok, error? }.
 */
export function importProgress(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }
  if (!data || data.app !== 'medgerman') {
    return { ok: false, error: 'Not a MedGerman backup file' };
  }
  if (typeof data.progress !== 'object' || data.progress === null) {
    return { ok: false, error: 'Missing progress data' };
  }
  saveProgress(data.progress);
  if (data.streak && typeof data.streak.streak === 'number') {
    saveStreak(data.streak);
  }
  if (typeof data.xp === 'number') {
    saveXP(data.xp);
  }
  if (data.dailyXP && typeof data.dailyXP.xp === 'number') {
    try {
      localStorage.setItem(DAILY_XP_KEY, JSON.stringify(data.dailyXP));
    } catch {}
  }
  if (data.profile && typeof data.profile === 'object') {
    saveProfile({ ...loadProfile(), ...data.profile });
  }
  if (data.levelCompletion && typeof data.levelCompletion === 'object') {
    try {
      localStorage.setItem(LEVEL_COMPLETION_KEY, JSON.stringify(data.levelCompletion));
    } catch {}
  }
  if (Array.isArray(data.dailyStars)) {
    try {
      localStorage.setItem(DAILY_STARS_KEY, JSON.stringify(data.dailyStars));
    } catch {}
  }
  if (Array.isArray(data.testScores)) {
    try {
      localStorage.setItem(TEST_SCORES_KEY, JSON.stringify(data.testScores));
    } catch {}
  }
  if (typeof data.sessionsCompleted === 'number') {
    try {
      localStorage.setItem(SESSIONS_KEY, String(Math.max(0, Math.floor(data.sessionsCompleted))));
    } catch {}
  }
  return { ok: true };
}

/**
 * Reset all progress, streak, and XP data in localStorage.
 */
export function resetProgress() {
  localStorage.removeItem(PROGRESS_KEY);
  localStorage.removeItem(STREAK_KEY);
  localStorage.removeItem(XP_KEY);
  localStorage.removeItem(DAILY_XP_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(LEVEL_COMPLETION_KEY);
  localStorage.removeItem(DAILY_STARS_KEY);
  localStorage.removeItem(TEST_SCORES_KEY);
  localStorage.removeItem(SESSIONS_KEY);
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

/* ===== Profile (display name + preferences) ===== */

const DEFAULT_RATE = 0.85;

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Load the user profile: display name for the header + audio preferences.
 * Returns { displayName: string | null, defaultRate: number }
 */
export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && typeof data === 'object') {
      return {
        displayName: typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName : null,
        defaultRate: typeof data.defaultRate === 'number' && data.defaultRate >= 0.5 && data.defaultRate <= 1.5
          ? data.defaultRate
          : DEFAULT_RATE,
      };
    }
  } catch {}
  return { displayName: null, defaultRate: DEFAULT_RATE };
}

/**
 * Save the profile object. Returns the stored value.
 */
export function saveProfile(profile) {
  const merged = { ...loadProfile(), ...profile };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
  } catch {}
  return merged;
}

/**
 * Set the display name shown in the header (trimmed; empty clears it).
 * Returns the stored name or null.
 */
export function setDisplayName(name) {
  const clean = typeof name === 'string' ? name.trim().slice(0, 30) : '';
  const next = saveProfile({ displayName: clean || null });
  return next.displayName;
}

/**
 * Set the default audio playback rate (0.5 = slow, 0.85 = normal, 1 = fast).
 */
export function setDefaultRate(rate) {
  const safe = typeof rate === 'number' ? Math.min(1.5, Math.max(0.5, rate)) : DEFAULT_RATE;
  saveProfile({ defaultRate: safe });
  return safe;
}

/* ===== Per-level completion counts (independent of SRS boxes) ===== */

/**
 * Load level completion: which exercise items have been done at least once.
 * Returns { [levelId]: string[] } — completed word ids per level.
 * This is deliberately SEPARATE from SRS progress (box/due/seen/wrong):
 * completion answers "have I done this exercise at least once", while the
 * Leitner box answers "how well do I know it".
 */
export function getLevelCompletion() {
  try {
    const raw = localStorage.getItem(LEVEL_COMPLETION_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const clean = {};
      for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val)) {
          const ids = val.filter((id) => typeof id === 'string');
          if (ids.length > 0) clean[key] = ids;
        }
      }
      return clean;
    }
  } catch {}
  return {};
}

/**
 * Mark one exercise item inside `levelId` as completed (done at least once).
 * Idempotent: marking the same word twice does not double-count.
 * Returns the updated completion map.
 */
export function markWordCompleted(levelId, wordId) {
  if (!levelId || !wordId) return getLevelCompletion();
  const map = getLevelCompletion();
  const list = map[levelId] || [];
  if (!list.includes(wordId)) {
    list.push(wordId);
    map[levelId] = list;
    try {
      localStorage.setItem(LEVEL_COMPLETION_KEY, JSON.stringify(map));
    } catch {}
  }
  return map;
}

/**
 * Derived per-level completion counts: { [levelId]: number }.
 */
export function getLevelCompletionCounts() {
  const map = getLevelCompletion();
  const counts = {};
  for (const [key, list] of Object.entries(map)) {
    counts[key] = list.length;
  }
  return counts;
}

/* ===== Daily challenge star history ===== */

/**
 * Load daily-challenge star history. Returns [{ date: 'YYYY-MM-DD', stars: 0-3 }], newest first.
 */
export function loadDailyStars() {
  try {
    const raw = localStorage.getItem(DAILY_STARS_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (Array.isArray(data)) {
      return data.filter(
        (e) => e && typeof e.date === 'string' && Number.isInteger(e.stars)
      );
    }
  } catch {}
  return [];
}

/**
 * Log today's daily-challenge result (0-3 stars), one entry per calendar day.
 * Returns the updated history, newest first.
 */
export function logDailyStars(stars) {
  const clamped = Math.max(0, Math.min(3, Math.round(stars)));
  const today = todayKey();
  const history = loadDailyStars().filter((e) => e.date !== today);
  history.unshift({ date: today, stars: clamped });
  try {
    localStorage.setItem(DAILY_STARS_KEY, JSON.stringify(history));
  } catch {}
  return history;
}

/* ===== Test score history ===== */

/**
 * Load test-score history. Returns [{ date: 'YYYY-MM-DD', score, total }], newest first.
 */
export function loadTestScores() {
  try {
    const raw = localStorage.getItem(TEST_SCORES_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (Array.isArray(data)) {
      return data.filter(
        (e) => e && typeof e.date === 'string' && typeof e.score === 'number' && typeof e.total === 'number'
      );
    }
  } catch {}
  return [];
}

/**
 * Log a completed test. Returns the updated history, newest first.
 */
export function logTestScore(score, total) {
  const history = loadTestScores();
  history.unshift({ date: todayKey(), score: Math.max(0, score), total: Math.max(1, total) });
  try {
    localStorage.setItem(TEST_SCORES_KEY, JSON.stringify(history));
  } catch {}
  return history;
}

/* ===== Sessions completed counter ===== */

/**
 * Load the number of completed practice/daily/test sessions.
 */
export function loadSessionsCompleted() {
  try {
    const val = localStorage.getItem(SESSIONS_KEY);
    return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

/**
 * Increment the completed-sessions counter. Returns the new count.
 */
export function incrementSessionsCompleted() {
  const next = loadSessionsCompleted() + 1;
  try {
    localStorage.setItem(SESSIONS_KEY, String(next));
  } catch {}
  return next;
}
