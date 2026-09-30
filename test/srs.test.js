import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  grade,
  isDue,
  isMastered,
  getReencounterText,
  computeStages,
  recordTypeResult,
  INTERVALS,
  DEV_INTERVALS,
  MAX_BOX,
} from '../src/lib/srs.js';

console.log('Testing SRS logic (srs.test.js)...\n');

// 1. Promotion and Demotion tests in production mode
{
  const p0 = { box: 0, due: 0, seen: 0, wrong: 0 };
  const before = Date.now();
  const p1 = grade(p0, true);

  assert.equal(p1.box, 1, 'Correct answer promotes box 0 -> 1');
  assert.equal(p1.seen, 1, 'Seen count increments');
  assert.equal(p1.wrong, 0, 'Wrong count stays 0 on correct answer');
  // In production, box 1 interval is 1 day (86400000 ms)
  const expectedDue1 = before + INTERVALS[1] * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(p1.due - expectedDue1) < 2000, 'Due date is approximately 1 day ahead');

  // Promote all the way to MAX_BOX (5)
  let pCurrent = p1;
  for (let b = 2; b <= MAX_BOX; b++) {
    pCurrent = grade(pCurrent, true);
    assert.equal(pCurrent.box, b, `Promoted to box ${b}`);
  }
  assert.equal(pCurrent.box, MAX_BOX);

  // Promoting past MAX_BOX caps at MAX_BOX
  const pMax = grade(pCurrent, true);
  assert.equal(pMax.box, MAX_BOX, 'Box does not exceed MAX_BOX');

  // Demotion from high box on incorrect answer
  const pWrong = grade(pMax, false);
  assert.equal(pWrong.box, 0, 'Wrong answer demotes back to box 0');
  assert.equal(pWrong.wrong, 1, 'Wrong count increments');
  assert.equal(pWrong.seen, pMax.seen + 1, 'Seen count increments on wrong answer');
  assert.ok(pWrong.due <= Date.now(), 'Wrong answer is due immediately');
}

// 2. isDue and isMastered tests
{
  assert.equal(isDue({ due: Date.now() - 5000 }), true, 'Past due time is due');
  assert.equal(isDue({ due: Date.now() + 60000 }), false, 'Future due time is not due');
  assert.equal(isDue({ due: Date.now() }), true, 'Exact current time is due');

  assert.equal(isMastered({ box: 0 }), false);
  assert.equal(isMastered({ box: 3 }), false);
  assert.equal(isMastered({ box: 4 }), true, 'Box 4 is mastered');
  assert.equal(isMastered({ box: 5 }), true, 'Box 5 is mastered');
}

// 3. Dev vs Production intervals & getReencounterText
{
  // In production (no window)
  assert.equal(getReencounterText(), 'tomorrow', 'Production re-encounter text is "tomorrow"');

  // Simulate Dev Mode (?dev=1)
  globalThis.window = {
    location: {
      search: '?dev=1',
    },
  };

  const devP0 = { box: 0, due: 0, seen: 0, wrong: 0 };
  const beforeDev = Date.now();
  const devP1 = grade(devP0, true);

  assert.equal(devP1.box, 1);
  // In dev mode, box 1 interval is 1 minute (60000 ms)
  const expectedDevDue1 = beforeDev + DEV_INTERVALS[1] * 60 * 1000;
  assert.ok(
    Math.abs(devP1.due - expectedDevDue1) < 2000,
    'Dev mode interval for box 1 is 1 minute'
  );

  assert.equal(getReencounterText(), 'in a minute', 'Dev mode re-encounter text is "in a minute"');

  // Clean up globalThis.window
  delete globalThis.window;
}

// 4. Mastery stage calculation tests (computeStages)
{
  const words = JSON.parse(
    readFileSync(new URL('../src/data/words.json', import.meta.url), 'utf-8')
  );
  assert.ok(words.length >= 40, 'words.json must contain at least 40 words');

  // 4a. Initial / Empty progress state (all words are New)
  const emptyStages = computeStages(words, {});
  assert.equal(emptyStages.newCount, words.length, 'All words are initially New');
  assert.equal(emptyStages.learningCount, 0, '0 Learning words initially');
  assert.equal(emptyStages.familiarCount, 0, '0 Familiar words initially');
  assert.equal(emptyStages.masteredCount, 0, '0 Mastered words initially');
  assert.equal(
    emptyStages.newCount + emptyStages.learningCount + emptyStages.familiarCount + emptyStages.masteredCount,
    words.length,
    'Stages sum to words.length in empty progress state'
  );
  assert.equal(emptyStages.total, words.length, 'Total matches words.length');

  // 4b. All words Learning (Boxes 0 and 1)
  const allLearning = {};
  words.forEach((w, i) => {
    allLearning[w.id] = { box: i % 2, due: Date.now(), seen: 1, wrong: 0 };
  });
  const learningStages = computeStages(words, allLearning);
  assert.equal(learningStages.learningCount, words.length);
  assert.equal(learningStages.newCount, 0);
  assert.equal(learningStages.familiarCount, 0);
  assert.equal(learningStages.masteredCount, 0);
  assert.equal(
    learningStages.newCount + learningStages.learningCount + learningStages.familiarCount + learningStages.masteredCount,
    words.length,
    'Stages sum to words.length when all words are in learning stage'
  );

  // 4c. All words Familiar (Boxes 2 and 3)
  const allFamiliar = {};
  words.forEach((w, i) => {
    allFamiliar[w.id] = { box: 2 + (i % 2), due: Date.now(), seen: 3, wrong: 0 };
  });
  const familiarStages = computeStages(words, allFamiliar);
  assert.equal(familiarStages.familiarCount, words.length);
  assert.equal(
    familiarStages.newCount + familiarStages.learningCount + familiarStages.familiarCount + familiarStages.masteredCount,
    words.length,
    'Stages sum to words.length when all words are familiar'
  );

  // 4d. All words Mastered (Boxes 4 and 5)
  const allMastered = {};
  words.forEach((w, i) => {
    allMastered[w.id] = { box: 4 + (i % 2), due: Date.now(), seen: 5, wrong: 0 };
  });
  const masteredStages = computeStages(words, allMastered);
  assert.equal(masteredStages.masteredCount, words.length);
  assert.equal(
    masteredStages.newCount + masteredStages.learningCount + masteredStages.familiarCount + masteredStages.masteredCount,
    words.length,
    'Stages sum to words.length when all words are mastered'
  );

  // 4e. Mixed progress distribution
  // e.g. 2 Mastered, 1 Familiar, 12 Learning, rest New
  const mixedProgress = {};
  // 2 Mastered (words 0..1 in Box 4/5)
  mixedProgress[words[0].id] = { box: 4, due: Date.now(), seen: 4, wrong: 0 };
  mixedProgress[words[1].id] = { box: 5, due: Date.now(), seen: 6, wrong: 0 };
  // 1 Familiar (word 2 in Box 3)
  mixedProgress[words[2].id] = { box: 3, due: Date.now(), seen: 3, wrong: 0 };
  // 12 Learning (words 3..14 in Box 0/1)
  for (let i = 3; i <= 14; i++) {
    mixedProgress[words[i].id] = { box: i % 2, due: Date.now(), seen: 1, wrong: 0 };
  }
  // Remaining words have no entry (New)
  const expectedNew = words.length - 15;
  const mixedStages = computeStages(words, mixedProgress);
  assert.equal(mixedStages.masteredCount, 2, '2 Mastered');
  assert.equal(mixedStages.familiarCount, 1, '1 Familiar');
  assert.equal(mixedStages.learningCount, 12, '12 Learning');
  assert.equal(mixedStages.newCount, expectedNew, `${expectedNew} New`);
  assert.equal(
    mixedStages.newCount + mixedStages.learningCount + mixedStages.familiarCount + mixedStages.masteredCount,
    words.length,
    'Mixed stages sum to words.length'
  );

  // 4f. Fuzz test: 50 random states always sum to words.length
  for (let run = 0; run < 50; run++) {
    const randomProg = {};
    for (const w of words) {
      if (Math.random() < 0.3) continue; // New
      randomProg[w.id] = {
        box: Math.floor(Math.random() * 6),
        due: Date.now(),
        seen: 1 + Math.floor(Math.random() * 10),
        wrong: Math.floor(Math.random() * 3),
      };
    }
    const randStages = computeStages(words, randomProg);
    const sum = randStages.newCount + randStages.learningCount + randStages.familiarCount + randStages.masteredCount;
    assert.equal(sum, words.length, `Random run ${run} stages must sum to words.length`);
    assert.equal(randStages.total, words.length, `Random run ${run} total matches word count`);
  }
}

// Per-exercise-type stats (adaptive selection data)
{
  // recordTypeResult returns the wrongByType map; only wrong answers increment
  const base = { box: 1, due: 0, seen: 1, wrong: 0 };
  const afterCorrect = recordTypeResult(base, 'mcq', true);
  assert.deepEqual(afterCorrect, {}, 'Correct answers do not add type wrongs');
  const afterWrong = recordTypeResult(base, 'article', false);
  assert.deepEqual(afterWrong, { article: 1 }, 'Wrong answers increment the type counter');
  const afterTwoWrong = recordTypeResult({ ...base, wrongByType: afterWrong }, 'article', false);
  assert.deepEqual(afterTwoWrong, { article: 2 }, 'Same-type wrongs accumulate');

  // grade() preserves and extends wrongByType across promotions and demotions
  const withStats = { ...base, wrongByType: { article: 2 } };
  const gradedCorrect = grade(withStats, true, 'mcq');
  assert.deepEqual(
    gradedCorrect.wrongByType,
    { article: 2 },
    'Correct grade preserves existing type stats'
  );
  assert.equal(gradedCorrect.box, 2, 'Promotion still applies from box 1');

  const gradedWrong = grade(gradedCorrect, false, 'mcq');
  assert.deepEqual(
    gradedWrong.wrongByType,
    { article: 2, mcq: 1 },
    'Wrong grade adds the new type wrong and keeps old ones'
  );
  assert.equal(gradedWrong.box, 0, 'Demotion still applies');

  // grade() without an exerciseType still preserves prior stats
  const gradedNoType = grade(gradedWrong, true);
  assert.deepEqual(gradedNoType.wrongByType, { article: 2, mcq: 1 }, 'Stats survive type-less grades');
}

console.log('✓ ALL SRS UNIT TESTS PASSED SUCCESSFULLY!\n');

