import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildExplanation,
  computeTypingDiff,
  computeSentenceDiff,
  evaluateAnswer,
  normalizeGerman,
} from '../src/lib/explain.js';

const words = JSON.parse(
  readFileSync(new URL('../src/data/words.json', import.meta.url), 'utf-8')
);

console.log('Testing buildExplanation across all 6 exercise types...\n');

// 1. Article test: "der" for "das Bein"
{
  const bein = words.find((w) => w.id === 'bein');
  const mistake = {
    exerciseType: 'article',
    german: bein.de,
    article: bein.article,
    english: bein.en,
    userAnswer: 'der',
    correctAnswer: bein.article,
    category: bein.theme,
    example: bein.example,
    exampleEn: bein.exampleEn,
  };
  const res = buildExplanation(mistake, words);
  console.log('1. Article:');
  console.log(res.lines);
  console.log('Hint fallback:', res.hint);

  assert.equal(res.lines.length, 3);
  assert.equal(res.lines[0], 'You chose: der');
  assert.equal(res.lines[1], 'Correct: das Bein (leg)');
  assert.ok(res.lines[2].includes("Every German noun has a fixed article"));
  assert.equal(res.hint, `Remember: ${bein.tip}`);
}

// 2. MCQ test: "fever" for "der Schmerz" (pain)
{
  const schmerz = words.find((w) => w.id === 'schmerz');
  const mistake = {
    exerciseType: 'mcq',
    german: schmerz.de,
    article: schmerz.article,
    english: schmerz.en,
    userAnswer: 'fever',
    correctAnswer: schmerz.en,
    category: schmerz.theme,
    example: schmerz.example,
    exampleEn: schmerz.exampleEn,
  };
  const res = buildExplanation(mistake, words);
  console.log('\n2. MCQ:');
  console.log(res.lines);
  console.log('Hint fallback:', res.hint);

  assert.equal(res.lines.length, 3);
  assert.equal(res.lines[0], 'You chose: fever = das Fieber');
  assert.equal(res.lines[1], 'Correct: der Schmerz = pain');
  assert.equal(res.lines[2], 'Fieber means fever. Schmerz means pain.');
  assert.equal(res.hint, `Remember: ${schmerz.tip}`);
}

// 3. Audio test: heard "das Medikament", chose "tablet"
{
  const med = words.find((w) => w.id === 'medikament');
  const mistake = {
    exerciseType: 'audio',
    german: med.de,
    article: med.article,
    english: med.en,
    userAnswer: 'tablet',
    correctAnswer: med.en,
    category: med.theme,
    example: med.example,
    exampleEn: med.exampleEn,
  };
  const res = buildExplanation(mistake, words);
  console.log('\n3. Audio:');
  console.log(res.lines);
  console.log('Hint fallback:', res.hint);

  assert.equal(res.lines.length, 3);
  assert.equal(res.lines[0], 'You heard: das Medikament');
  assert.equal(res.lines[1], 'You chose: tablet');
  assert.equal(res.lines[2], 'Correct: medication');
  assert.equal(res.hint, "Remember: Similar to English 'medication'. Only learn the article: das.");

  // Test identical cognate: patient
  const patient = words.find((w) => w.id === 'patient');
  const resPatient = buildExplanation(
    {
      exerciseType: 'mcq',
      german: patient.de,
      article: patient.article,
      english: patient.en,
      userAnswer: 'doctor',
      correctAnswer: patient.en,
      category: patient.theme,
    },
    words
  );
  assert.equal(resPatient.hint, "Remember: Same as English 'patient'. Only learn the article: der.");
}

// 4. Cloze test: userAnswer="Mund" for "Mein Kopf tut weh." ("My head hurts.")
{
  const kopf = words.find((w) => w.id === 'kopf');
  const mistake = {
    exerciseType: 'cloze',
    german: kopf.de,
    article: kopf.article,
    english: kopf.en,
    userAnswer: 'Mund',
    correctAnswer: kopf.de,
    category: kopf.theme,
    example: kopf.example,
    exampleEn: kopf.exampleEn,
  };
  const res = buildExplanation(mistake, words);
  console.log('\n4. Cloze:');
  console.log(res.lines);
  console.log('Hint fallback:', res.hint);

  assert.equal(res.lines.length, 3);
  assert.equal(res.lines[0], 'You chose: Mund (mouth)');
  assert.equal(res.lines[1], 'Sentence: "Mein Kopf tut weh." = "My head hurts."');
  assert.equal(res.lines[2], 'The English says head, so the missing word is Kopf.');
  assert.equal(res.hint, `Remember: ${kopf.tip}`);
}

// 5. Typing tests: lowercase noun, extra letter, missing umlaut
{
  const kopf = words.find((w) => w.id === 'kopf');
  const res1 = buildExplanation(
    {
      exerciseType: 'typing',
      german: kopf.de,
      article: kopf.article,
      english: kopf.en,
      userAnswer: 'kopf',
      correctAnswer: 'Kopf',
    },
    words
  );
  console.log('\n5a. Typing (lowercase):');
  console.log(res1.lines);
  assert.equal(res1.lines.length, 3);
  assert.equal(res1.lines[0], 'You typed: kopf');
  assert.equal(res1.lines[1], 'Correct: Kopf');
  assert.equal(res1.lines[2], 'All German nouns must start with a capital letter.');

  const res2 = buildExplanation(
    {
      exerciseType: 'typing',
      german: kopf.de,
      article: kopf.article,
      english: kopf.en,
      userAnswer: 'Kopff',
      correctAnswer: 'Kopf',
    },
    words
  );
  console.log('\n5b. Typing (extra letter):');
  console.log(res2.lines);
  assert.equal(res2.lines[2], "Extra letter: 'f'.");

  const ruecken = words.find((w) => w.id === 'ruecken');
  const res3 = buildExplanation(
    {
      exerciseType: 'typing',
      german: ruecken.de,
      article: ruecken.article,
      english: ruecken.en,
      userAnswer: 'Rucken',
      correctAnswer: 'Rücken',
    },
    words
  );
  console.log('\n5c. Typing (missing umlaut):');
  console.log(res3.lines);
  assert.equal(res3.lines[2], "Missing umlaut: 'ü' instead of 'u'.");
}

// 6. Sentence test: misplaced word and missing word
{
  const sent = words.find((w) => w.id === 'blutdruck_messen');
  // de: "Ich messe jetzt Ihren Blutdruck."
  const res1 = buildExplanation(
    {
      exerciseType: 'sentence',
      german: sent.de,
      article: null,
      english: sent.en,
      userAnswer: 'Ich messe Ihren jetzt Blutdruck.',
      correctAnswer: sent.de,
    },
    words
  );
  console.log('\n6a. Sentence (word order):');
  console.log(res1.lines);
  assert.equal(res1.lines.length, 3);
  assert.equal(res1.lines[0], 'You wrote: Ich messe Ihren jetzt Blutdruck.');
  assert.equal(res1.lines[1], 'Correct: Ich messe jetzt Ihren Blutdruck.');
  assert.equal(res1.lines[2], "Word order differs: 'Ihren' is misplaced.");
  assert.equal(res1.hint, `Remember: ${sent.tip}`);

  const res2 = buildExplanation(
    {
      exerciseType: 'sentence',
      german: sent.de,
      article: null,
      english: sent.en,
      userAnswer: 'Ich messe Ihren Blutdruck.',
      correctAnswer: sent.de,
    },
    words
  );
  console.log('\n6b. Sentence (missing word):');
  console.log(res2.lines);
  assert.equal(res2.lines[2], "Missing word: 'jetzt'.");
}

// 7. Lenient typing tests (accessibility for Indian keyboards)
{
  console.log('\n7. Lenient typing:');

  // "kopf" correct with note
  const resKopf = evaluateAnswer('kopf', 'Kopf', 'typing');
  assert.equal(resKopf.isCorrect, true);
  assert.equal(resKopf.note, 'Nouns start with a capital letter: Kopf');
  console.log('  - kopf for Kopf:', resKopf);

  // "Fuss" correct for "Fuß"
  const resFuss = evaluateAnswer('Fuss', 'Fuß', 'typing');
  assert.equal(resFuss.isCorrect, true);
  assert.equal(
    resFuss.note,
    'Correct spelling: Fuß (you can type ss on your keyboard, that is fine)'
  );
  console.log('  - Fuss for Fuß:', resFuss);

  // "Kopff" incorrect
  const resKopff = evaluateAnswer('Kopff', 'Kopf', 'typing');
  assert.equal(resKopff.isCorrect, false);
  assert.equal(resKopff.note, null);
  console.log('  - Kopff for Kopf:', resKopff);

  // "waehlen" style umlaut substitutions
  const resWaehlen = evaluateAnswer('waehlen', 'wählen', 'typing');
  assert.equal(resWaehlen.isCorrect, true);
  assert.equal(
    resWaehlen.note,
    'Correct spelling: wählen (you can type ae on your keyboard, that is fine)'
  );
  console.log('  - waehlen for wählen:', resWaehlen);

  // "wählen" for "waehlen" (both directions)
  const resWaehlenReverse = evaluateAnswer('wählen', 'waehlen', 'typing');
  assert.equal(resWaehlenReverse.isCorrect, true);

  // Sentences with trailing punctuation, extra spaces, and lowercase
  const resSentence = evaluateAnswer(
    '  ich messe  jetzt ihren blutdruck  ',
    'Ich messe jetzt Ihren Blutdruck.',
    'sentence'
  );
  assert.equal(resSentence.isCorrect, true);
  console.log('  - sentence with lowercase & spaces:', resSentence);
}

console.log('\n ALL 6 EXERCISE TYPE UNIT TESTS & LENIENT TYPING TESTS PASSED SUCCESSFULLY!');

import { fetchAIExplanation } from '../src/lib/explain.js';

async function runAITests() {
  console.log('\nTesting AI validation...');
  
  const originalFetch = global.fetch;
  
  // Test 1: Rejection of hallucinated German word (Kopfweh instead of Kopfschmerzen)
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      explanation: 'You answered Mund (mouth). Correct is Kopfschmerzen (headache). Kopfweh is another word for it.'
    })
  });
  
  let res = await fetchAIExplanation({
    exerciseType: 'cloze',
    german: 'Kopfschmerzen',
    userAnswer: 'Mund',
    english: 'headache',
    example: 'Mein Kopfschmerzen',
    exampleEn: 'My headache'
  }, [
    { id: 'mund', de: 'Mund', en: 'mouth' },
    { id: 'kopfschmerzen', de: 'Kopfschmerzen', en: 'headache' }
  ]);
  
  if (res !== null) {
    console.error('FAILED: Should have rejected Kopfweh');
    process.exit(1);
  } else {
    console.log('✓ Rejected hallucinated German word (Kopfweh)');
  }
  
  // Test 2: Rejection of cross-language hallucination (Hindi)
  // We'll test it by making it output a capitalized word "Hindi" that isn't in payload
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      explanation: 'Arm means arm. It is similar in Hindi.'
    })
  });
  
  res = await fetchAIExplanation({
    exerciseType: 'mcq',
    german: 'Arm',
    userAnswer: 'Bein',
    english: 'arm'
  }, [
    { id: 'arm', de: 'Arm', en: 'arm' },
    { id: 'bein', de: 'Bein', en: 'leg' }
  ]);
  
  if (res !== null) {
    console.error('FAILED: Should have rejected Hindi');
    process.exit(1);
  } else {
    console.log('✓ Rejected hallucination (Hindi)');
  }
  
  // Test 3: Acceptance of valid explanation
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      explanation: 'You answered Mund. The correct answer is Kopf. Think of a cap on your Kopf.'
    })
  });
  
  res = await fetchAIExplanation({
    exerciseType: 'typing',
    german: 'Kopf',
    userAnswer: 'Mund',
    english: 'head'
  }, [
    { id: 'mund', de: 'Mund', en: 'mouth' },
    { id: 'kopf', de: 'Kopf', en: 'head' }
  ]);
  
  if (res === null) {
    console.error('FAILED: Should have accepted valid explanation');
    process.exit(1);
  } else {
    console.log('✓ Accepted valid explanation');
  }
  
  global.fetch = originalFetch;
  console.log('\nALL AI VALIDATION TESTS PASSED!');
}

runAITests();
