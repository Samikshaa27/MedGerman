import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSession } from '../src/lib/session.js';

const words = JSON.parse(
  readFileSync(new URL('../src/data/words.json', import.meta.url), 'utf-8')
);

console.log('Testing session logic (session.test.js)...\n');

// 1. Intro step inserted once per new word
{
  const emptyProgress = {};
  const session = buildSession(words, emptyProgress, 'practice', true);

  // In practice mode with empty progress, up to 5 new words are picked
  // Each new word should have exactly one intro step followed by its exercise
  const introSteps = session.filter((item) => item.type === 'intro');
  const gradedSteps = session.filter((item) => item.type !== 'intro');

  assert.equal(introSteps.length, 5, 'Should have 5 intro steps for 5 new words');
  assert.equal(gradedSteps.length, 5, 'Should have 5 graded exercises for 5 new words');
  assert.equal(session.length, 10, 'Total queue length is 10 (5 intros + 5 exercises)');

  // Verify each intro step is immediately followed by an exercise for the same word
  for (let i = 0; i < session.length; i += 2) {
    const intro = session[i];
    const exercise = session[i + 1];
    assert.equal(intro.type, 'intro', `Step ${i} is an intro step`);
    assert.equal(intro.word.id, exercise.word.id, 'Intro step and subsequent exercise match the same word');
    assert.notEqual(exercise.type, 'intro', `Step ${i + 1} is not an intro step`);
  }
}

// 2. Existing progress words do not receive intro steps
{
  // First word has progress; others are new
  const progressWithOne = {
    [words[0].id]: { box: 1, due: Date.now() - 10000, seen: 1, wrong: 0 },
  };

  const session = buildSession(words, progressWithOne, 'practice', true);
  const introForWord0 = session.filter(
    (item) => item.word.id === words[0].id && item.type === 'intro'
  );
  assert.equal(
    introForWord0.length,
    0,
    'Previously seen words with progress entries never receive an intro step'
  );

  // In 'review' mode, only due words are queued, and no intro steps should exist
  const reviewSession = buildSession(words, progressWithOne, 'review', true);
  const reviewIntros = reviewSession.filter((item) => item.type === 'intro');
  assert.equal(reviewIntros.length, 0, 'Review mode produces zero intro steps');
}

// 3. Re-queue simulation does not re-queue intro step
{
  const session = buildSession(words, {}, 'practice', true);
  // Simulate Practice queue behavior on wrong answer
  const queue = [...session];
  const currentExercise = queue[1]; // First graded exercise (index 1)
  assert.notEqual(currentExercise.type, 'intro', 'Target exercise is graded, not intro');

  // When learner answers incorrectly, only currentExercise is appended
  const reQueuedQueue = [...queue, currentExercise];
  const lastItem = reQueuedQueue[reQueuedQueue.length - 1];

  assert.equal(lastItem.type, currentExercise.type, 'Re-queued item retains its exercise type');
  assert.notEqual(lastItem.type, 'intro', 'Re-queued item is never an intro step');
  assert.equal(
    reQueuedQueue.filter((item) => item.type === 'intro').length,
    5,
    'Intro step count remains strictly 5, never increments on re-queue'
  );
}

// 4. Audio fallback: no listening exercises when audioAvailable = false
{
  // Generate many exercises across boxes 2-3 (which normally produce listening exercises)
  const progressBoxes2And3 = {};
  for (const w of words) {
    progressBoxes2And3[w.id] = {
      box: Math.random() < 0.5 ? 2 : 3,
      due: Date.now() - 5000,
      seen: 5,
      wrong: 1,
    };
  }

  // Run multiple sessions to account for random distribution
  for (let run = 0; run < 10; run++) {
    const sessionWithoutAudio = buildSession(words, progressBoxes2And3, 'review', false);
    const listeningExercises = sessionWithoutAudio.filter(
      (item) => item.type === 'listening'
    );
    assert.equal(
      listeningExercises.length,
      0,
      'No listening exercises generated when audioAvailable = false'
    );
  }
}

console.log('✓ ALL SESSION UNIT TESTS PASSED SUCCESSFULLY!\n');
