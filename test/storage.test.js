import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Storage helpers touch localStorage; stub a minimal implementation for Node.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const {
  defaultProgress,
  loadProgress,
  saveProgress,
  loadXP,
  saveXP,
  addXP,
  loadDailyXP,
  addDailyXP,
  DAILY_XP_GOAL,
  exportProgress,
  importProgress,
  resetProgress,
  updateStreak,
  loadStreak,
  loadProfile,
  setDisplayName,
  setDefaultRate,
  getLevelCompletion,
  markWordCompleted,
  getLevelCompletionCounts,
  loadDailyStars,
  logDailyStars,
  loadTestScores,
  logTestScore,
  loadSessionsCompleted,
  incrementSessionsCompleted,
} = await import('../src/lib/storage.js');

console.log('Testing storage logic (storage.test.js)...\n');

// 1. Default progress and round-trip
{
  assert.deepEqual(defaultProgress(), { box: 0, due: 0, seen: 0, wrong: 0 });
  assert.deepEqual(loadProgress(), {});
  const p = { w1: { box: 2, due: 123, seen: 3, wrong: 1 } };
  saveProgress(p);
  assert.deepEqual(loadProgress(), p, 'Progress round-trips through localStorage');
}

// 2. XP handling
{
  saveXP(50);
  assert.equal(loadXP(), 50);
  const res = addXP(10);
  assert.equal(res.totalXP, 60, 'addXP accumulates');
  assert.equal(res.added, 10);
  addXP(-5); // negative amounts are ignored
  assert.equal(loadXP(), 60, 'Negative XP amounts are ignored');
  assert.ok(res.level >= 1 && typeof res.title === 'string');
}

// 3. Daily XP: accumulation and day rollover
{
  assert.equal(loadDailyXP().xp, 0, 'Daily XP starts at 0');
  addDailyXP(10);
  addDailyXP(15);
  assert.equal(loadDailyXP().xp, 25, 'Daily XP accumulates within the day');
  addDailyXP(-100);
  assert.equal(loadDailyXP().xp, 25, 'Negative daily amounts are ignored');

  // Simulate yesterday's stored data rolling over
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  store.set('medgerman-daily-xp', JSON.stringify({ date: yesterday, xp: 999 }));
  assert.equal(loadDailyXP().xp, 0, 'Daily XP resets on a new calendar day');
}

// 4. Export / Import round-trip
{
  saveProgress({ w1: { box: 4, due: 999, seen: 10, wrong: 2 } });
  saveXP(320);
  addDailyXP(30);
  updateStreak();

  const exported = exportProgress();
  const parsed = JSON.parse(exported);
  assert.equal(parsed.app, 'medgerman', 'Export identifies the app');
  assert.ok(parsed.exportedAt, 'Export has a timestamp');

  // Wipe and re-import
  resetProgress();
  assert.deepEqual(loadProgress(), {}, 'Progress cleared after reset');
  assert.equal(loadXP(), 0);

  const res = importProgress(exported);
  assert.equal(res.ok, true, 'Import succeeds');
  assert.equal(loadProgress().w1.box, 4, 'Progress restored');
  assert.equal(loadXP(), 320, 'XP restored');
  assert.equal(loadDailyXP().xp, 30, 'Daily XP restored');
  assert.ok(loadStreak().streak >= 1, 'Streak restored');
}

// 5. Import validation rejects bad payloads
{
  assert.equal(importProgress('not json').ok, false, 'Invalid JSON rejected');
  assert.equal(
    importProgress(JSON.stringify({ app: 'other-app', progress: {} })).ok,
    false,
    'Foreign app backups rejected'
  );
  assert.equal(
    importProgress(JSON.stringify({ app: 'medgerman' })).ok,
    false,
    'Missing progress rejected'
  );
}

// 6. resetProgress clears daily XP too
{
  addDailyXP(20);
  resetProgress();
  assert.equal(loadDailyXP().xp, 0, 'resetProgress clears daily XP');
}

// 7. Profile: display name + default rate
{
  assert.deepEqual(loadProfile(), { displayName: null, defaultRate: 0.85 }, 'Profile defaults');
  assert.equal(setDisplayName('  Priya '), 'Priya', 'Display name is trimmed');
  assert.equal(loadProfile().displayName, 'Priya');
  assert.equal(setDisplayName('   '), null, 'Empty name clears it');
  assert.equal(loadProfile().displayName, null);
  setDisplayName('Priya');
  assert.equal(setDefaultRate(0.5), 0.5, 'Rate set to slow');
  assert.equal(setDefaultRate(9), 1.5, 'Rate is clamped high');
  assert.equal(setDefaultRate(0.1), 0.5, 'Rate is clamped low');
  assert.equal(loadProfile().displayName, 'Priya', 'Name survives rate changes');
}

// 8. Level completion is a separate counter from SRS progress
{
  assert.deepEqual(getLevelCompletion(), {}, 'Level completion starts empty');
  markWordCompleted('L1', 'kopf');
  markWordCompleted('L1', 'arm');
  markWordCompleted('L1', 'kopf'); // idempotent: no double count
  markWordCompleted('L2', 'fieber');
  const completion = getLevelCompletion();
  assert.deepEqual(completion.L1.sort(), ['arm', 'kopf'], 'Completed word ids stored per level');
  assert.deepEqual(completion.L2, ['fieber']);
  assert.deepEqual(getLevelCompletionCounts(), { L1: 2, L2: 1 }, 'Counts derive from id sets');
  assert.deepEqual(loadProgress(), {}, 'Level completion never touches SRS progress');
}

// 9. Daily stars: clamped, one entry per day, newest first
{
  assert.deepEqual(loadDailyStars(), [], 'Stars start empty');
  logDailyStars(3);
  logDailyStars(2); // same day: overwrites
  logDailyStars(99); // clamped to 3
  logDailyStars(-1); // clamped to 0
  const stars = loadDailyStars();
  assert.equal(stars.length, 1, 'One entry per calendar day');
  assert.equal(stars[0].stars, 0, 'Last log of the day wins, clamped to 0-3');
  assert.ok(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(stars[0].date), 'Date is YYYY-MM-DD');
}

// 10. Test scores: newest first, ordered log
{
  assert.deepEqual(loadTestScores(), [], 'Test scores start empty');
  logTestScore(7, 10);
  logTestScore(9, 10);
  const scores = loadTestScores();
  assert.equal(scores.length, 2);
  assert.equal(scores[0].score, 9, 'Newest test first');
  assert.equal(scores[1].score, 7);
  assert.equal(scores[0].total, 10);
}

// 11. Sessions-completed counter
{
  assert.equal(loadSessionsCompleted(), 0, 'Sessions start at 0');
  assert.equal(incrementSessionsCompleted(), 1);
  assert.equal(incrementSessionsCompleted(), 2);
  assert.equal(loadSessionsCompleted(), 2);
}

// 12. Export / import covers the new fields; reset clears them
{
  setDisplayName('Priya');
  setDefaultRate(0.5);
  logDailyStars(3);
  logTestScore(8, 10);
  markWordCompleted('L3', 'atemnot');
  incrementSessionsCompleted();
  const sessionsBefore = loadSessionsCompleted();
  const exported = exportProgress();
  const parsed = JSON.parse(exported);
  assert.deepEqual(parsed.profile, loadProfile(), 'Export includes profile');
  assert.deepEqual(parsed.levelCompletion, getLevelCompletion(), 'Export includes level completion');
  assert.deepEqual(parsed.dailyStars, loadDailyStars(), 'Export includes daily stars');
  assert.deepEqual(parsed.testScores, loadTestScores(), 'Export includes test scores');
  assert.equal(parsed.sessionsCompleted, sessionsBefore, 'Export includes sessions count');

  resetProgress();
  assert.equal(loadProfile().displayName, null, 'resetProgress clears profile');
  assert.deepEqual(getLevelCompletion(), {}, 'resetProgress clears level completion');
  assert.deepEqual(loadDailyStars(), [], 'resetProgress clears daily stars');
  assert.deepEqual(loadTestScores(), [], 'resetProgress clears test scores');
  assert.equal(loadSessionsCompleted(), 0, 'resetProgress clears sessions count');

  assert.equal(importProgress(exported).ok, true, 'Import restores new fields');
  assert.equal(loadProfile().displayName, 'Priya');
  assert.equal(loadProfile().defaultRate, 0.5);
  assert.deepEqual(getLevelCompletion().L3, ['atemnot']);
  assert.equal(loadDailyStars()[0].stars, 3);
  assert.equal(loadTestScores()[0].score, 8);
  assert.equal(loadSessionsCompleted(), sessionsBefore);
}

console.log('✓ ALL STORAGE UNIT TESTS PASSED SUCCESSFULLY!\n');
