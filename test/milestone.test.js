import assert from 'node:assert/strict';
import { computeMilestone } from '../src/lib/milestone.js';

// Mock localStorage and window for Node.js
global.localStorage = {
  _data: {},
  getItem(key) { return this._data[key] || null; },
  setItem(key, val) { this._data[key] = val; },
  removeItem(key) { delete this._data[key]; },
};
global.window = { location: { search: '' } };

const WORDS = [
  { id: 'w1', de: 'Kopf', en: 'head', theme: 'body', level: 'A1' },
  { id: 'w2', de: 'Arm', en: 'arm', theme: 'body', level: 'A1' },
  { id: 'w3', de: 'Bein', en: 'leg', theme: 'body', level: 'A1' },
  { id: 'w4', de: 'Fieber', en: 'fever', theme: 'symptoms', level: 'A1' },
  { id: 'w5', de: 'Schmerz', en: 'pain', theme: 'symptoms', level: 'A1' },
  { id: 'w6', de: 'Tablette', en: 'tablet', theme: 'patient_care', level: 'A1' },
  { id: 'w7', de: 'Bett', en: 'bed', theme: 'patient_care', level: 'A1' },
  { id: 'w8', de: 'Puls', en: 'pulse', theme: 'symptoms', level: 'A1' },
  { id: 'w9', de: 'Mund', en: 'mouth', theme: 'body', level: 'A1' },
  { id: 'w10', de: 'Nase', en: 'nose', theme: 'body', level: 'A1' },
];

console.log('Testing milestone computation...\n');

// --- Case 1: Theme nearing next mastery stage ---
{
  // w1 at box 1 (one correct → Familiar), w2 at box 1 (one correct → Familiar)
  // Only 2 words at box 1 in body theme → within 3, should trigger
  const progress = {
    w1: { box: 1, due: 0, seen: 2, wrong: 0 },
    w2: { box: 1, due: 0, seen: 2, wrong: 0 },
    w3: { box: 0, due: 0, seen: 1, wrong: 1 },
    w4: { box: 0, due: 0, seen: 1, wrong: 0 },
  };
  const result = computeMilestone(progress, WORDS);
  console.log('Case 1 (theme stage):', result);
  assert.ok(result.includes('Body & Anatomy'), `Expected theme name in: "${result}"`);
  assert.ok(result.includes('Familiar'), `Expected "Familiar" in: "${result}"`);
  assert.ok(result.includes('2 more correct'), `Expected "2 more correct" in: "${result}"`);
  console.log('✓ Case 1 passed: theme nearing Familiar\n');
}

// --- Case 2: Streak milestone ---
{
  // No theme near a stage, but streak is at 2 (next practise → 3-day streak)
  const progress = {
    w1: { box: 0, due: 0, seen: 1, wrong: 1 },
    w4: { box: 0, due: 0, seen: 1, wrong: 1 },
  };
  localStorage.setItem('medgerman-streak', JSON.stringify({ streak: 2, lastDate: 'some-past-date' }));
  const result = computeMilestone(progress, WORDS);
  console.log('Case 2 (streak):', result);
  assert.ok(result.includes('3-day streak'), `Expected "3-day streak" in: "${result}"`);
  console.log('✓ Case 2 passed: streak milestone\n');
  localStorage.removeItem('medgerman-streak');
}

// --- Case 3: Round mastery number ---
{
  // 3 words mastered (box>=4), next round = 5, gap = 2
  // No theme near a stage (all at box 4/5 or box 0 — no box 1 or box 3 clusters)
  // Streak at 0 (fresh, next=1 which is not a multiple of 3 or 7)
  const progress = {
    w1: { box: 5, due: 0, seen: 10, wrong: 0 },
    w2: { box: 4, due: 0, seen: 8, wrong: 1 },
    w3: { box: 4, due: 0, seen: 6, wrong: 0 },
    w4: { box: 0, due: 0, seen: 1, wrong: 1 },
    w5: { box: 0, due: 0, seen: 1, wrong: 1 },
  };
  localStorage.setItem('medgerman-streak', JSON.stringify({ streak: 0, lastDate: null }));
  const result = computeMilestone(progress, WORDS);
  console.log('Case 3 (round mastery):', result);
  assert.ok(result.includes('away from 5 mastered'), `Expected "away from 5 mastered" in: "${result}"`);
  assert.ok(result.includes('2 words'), `Expected "2 words" in: "${result}"`);
  console.log('✓ Case 3 passed: round mastery number\n');
  localStorage.removeItem('medgerman-streak');
}

// --- Case 4: Fallback (next review) ---
{
  // All 10 words mastered → masteredCount=10, nextRound=15, gap=5 which is >3 so Case 3 won't fire.
  // Streak at 1 → nextStreak=2, not a milestone. No box 1 or 3 words.
  const futureMs = Date.now() + 86400000 * 3;
  const progress = {};
  for (const w of WORDS) {
    progress[w.id] = { box: 5, due: futureMs, seen: 20, wrong: 0 };
  }
  localStorage.setItem('medgerman-streak', JSON.stringify({ streak: 1, lastDate: new Date().toDateString() }));
  const result = computeMilestone(progress, WORDS);
  console.log('Case 4 (fallback):', result);
  assert.ok(result.includes('Next review:'), `Expected "Next review:" in: "${result}"`);
  console.log('✓ Case 4 passed: fallback to next review\n');
  localStorage.removeItem('medgerman-streak');
}

// --- Ensure milestone is never blank ---
{
  const result = computeMilestone({}, WORDS);
  console.log('Empty progress:', result);
  assert.ok(result.length > 0, 'Milestone must never be blank');
  console.log('✓ Non-blank check passed\n');
}

console.log('ALL MILESTONE TESTS PASSED SUCCESSFULLY!');
