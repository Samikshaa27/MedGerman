/**
 * Factual mistake explanation builder.
 * Deterministic, offline, zero hallucination.
 * Uses only data from the mistake object and words.json.
 */

/**
 * Normalises German text for comparison:
 * - Trims and collapses multiple spaces
 * - Removes trailing punctuation (. ? !)
 * - Converts to lowercase
 * - Replaces umlauts and ß with digraph equivalents (ä->ae, ö->oe, ü->ue, ß->ss)
 */
export function normalizeGerman(str) {
  if (!str) return '';
  return str
    .trim()
    .replace(/[.,?!]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Evaluates a typed answer leniently (accessibility for Indian keyboards).
 * - Accepts ae/oe/ue/ss as equal to ä/ö/ü/ß in both directions
 * - Case-insensitive
 * - Ignores leading/trailing spaces, repeated spaces, final punctuation
 * - Returns { isCorrect: boolean, note: string | null }
 */
export function evaluateAnswer(userAnswer, correctAnswer, exerciseType) {
  const normUser = normalizeGerman(userAnswer);
  const normCorrect = normalizeGerman(correctAnswer);

  const isMatch = normUser.length > 0 && normUser === normCorrect;
  if (!isMatch) {
    return { isCorrect: false, note: null };
  }

  // Exact match (including case, spaces, and special characters)
  const trimmedUser = (userAnswer || '').trim().replace(/[.,?!]+$/g, '').replace(/\s+/g, ' ');
  const trimmedCorrect = (correctAnswer || '').trim().replace(/[.,?!]+$/g, '').replace(/\s+/g, ' ');

  if (trimmedUser === trimmedCorrect) {
    return { isCorrect: true, note: null };
  }

  // Check if ß was substituted with ss
  if (trimmedCorrect.includes('ß') && !trimmedUser.includes('ß')) {
    return {
      isCorrect: true,
      note: `Correct spelling: ${correctAnswer} (you can type ss on your keyboard, that is fine)`,
    };
  }

  // Check if ä/ö/ü was substituted with ae/oe/ue
  const umlauts = [
    { char: 'ä', sub: 'ae' },
    { char: 'ö', sub: 'oe' },
    { char: 'ü', sub: 'ue' },
  ];

  for (const { char, sub } of umlauts) {
    if (trimmedCorrect.toLowerCase().includes(char) && !trimmedUser.toLowerCase().includes(char)) {
      return {
        isCorrect: true,
        note: `Correct spelling: ${correctAnswer} (you can type ${sub} on your keyboard, that is fine)`,
      };
    }
  }

  // Check if capitalization differed
  if (trimmedUser.toLowerCase() === trimmedCorrect.toLowerCase()) {
    if (
      exerciseType === 'typing' &&
      trimmedCorrect[0] === trimmedCorrect[0].toUpperCase() &&
      trimmedUser[0] !== trimmedUser[0].toUpperCase()
    ) {
      return {
        isCorrect: true,
        note: `Nouns start with a capital letter: ${correctAnswer}`,
      };
    }
    return {
      isCorrect: true,
      note: `Check capitalization: ${correctAnswer}`,
    };
  }

  return { isCorrect: true, note: `Correct spelling: ${correctAnswer}` };
}

/**
 * Computes a specific diff note between the user's typed input and the correct word.
 * Always under 12 words.
 */
export function computeTypingDiff(userAnswer, correctAnswer) {
  const u = (userAnswer || '').trim();
  const c = (correctAnswer || '').trim();

  if (!u) return 'No word was entered.';

  // 1. Lowercase vs uppercase noun check
  if (u.toLowerCase() === c.toLowerCase()) {
    if (u[0] !== c[0] && c[0] === c[0].toUpperCase()) {
      return 'All German nouns must start with a capital letter.';
    }
    return 'Check capitalization: start with a capital letter.';
  }

  // 2. Missing umlaut check
  const umlauts = [
    { uml: 'ä', base: 'a' },
    { uml: 'ö', base: 'o' },
    { uml: 'ü', base: 'u' },
    { uml: 'Ä', base: 'A' },
    { uml: 'Ö', base: 'O' },
    { uml: 'Ü', base: 'U' },
    { uml: 'ß', base: 'ss' },
  ];
  for (const { uml, base } of umlauts) {
    if (c.includes(uml) && !u.includes(uml)) {
      return `Missing umlaut: '${uml}' instead of '${base}'.`;
    }
  }

  // 3. Swapped adjacent letters (e.g. ei vs ie)
  if (u.length === c.length) {
    for (let i = 0; i < c.length - 1; i++) {
      if (u[i] === c[i + 1] && u[i + 1] === c[i]) {
        return `Letters swapped: '${u.slice(i, i + 2)}' instead of '${c.slice(i, i + 2)}'.`;
      }
    }
  }

  // 4. Extra letter
  if (u.length === c.length + 1) {
    let diffIdx = -1;
    for (let i = 0; i < c.length; i++) {
      if (u[i] !== c[i]) {
        diffIdx = i;
        break;
      }
    }
    const extraChar = diffIdx !== -1 ? u[diffIdx] : u[u.length - 1];
    return `Extra letter: '${extraChar}'.`;
  }

  // 5. Missing letter
  if (u.length === c.length - 1) {
    let diffIdx = -1;
    for (let i = 0; i < u.length; i++) {
      if (u[i] !== c[i]) {
        diffIdx = i;
        break;
      }
    }
    const missingChar = diffIdx !== -1 ? c[diffIdx] : c[c.length - 1];
    return `Missing letter: '${missingChar}'.`;
  }

  // 6. General letter mismatch
  return `Spelling differs: '${u}' instead of '${c}'.`;
}

/**
 * Computes diff note for sentence exercise.
 * Always under 12 words.
 */
export function computeSentenceDiff(userAnswer, correctAnswer) {
  const clean = (s) => (s || '').replace(/[.,?!]/g, '').trim().split(/\s+/).filter(Boolean);
  const uWords = clean(userAnswer);
  const cWords = clean(correctAnswer);

  if (uWords.length === 0) return 'No sentence was entered.';

  // Check if same words but misplaced order
  const uSorted = [...uWords].map((w) => w.toLowerCase()).sort().join(' ');
  const cSorted = [...cWords].map((w) => w.toLowerCase()).sort().join(' ');
  if (uSorted === cSorted && uWords.length === cWords.length) {
    for (let i = 0; i < uWords.length; i++) {
      if (uWords[i].toLowerCase() !== cWords[i].toLowerCase()) {
        return `Word order differs: '${uWords[i]}' is misplaced.`;
      }
    }
  }

  // Missing word in user's sentence
  const uLower = uWords.map((w) => w.toLowerCase());
  const missing = cWords.filter((w) => !uLower.includes(w.toLowerCase()));
  if (missing.length > 0) {
    return `Missing word: '${missing[0]}'.`;
  }

  // Extra word in user's sentence
  const cLower = cWords.map((w) => w.toLowerCase());
  const extra = uWords.filter((w) => !cLower.includes(w.toLowerCase()));
  if (extra.length > 0) {
    return `Extra word: '${extra[0]}'.`;
  }

  return 'Word order or phrasing differs.';
}

/**
 * Build deterministic explanation lines and hint.
 *
 * @param {object} mistake
 * @param {Array} words - words.json list
 * @returns {{ lines: string[], hint: string, diffNote?: string }}
 */
export function buildExplanation(mistake, words = []) {
  const {
    exerciseType,
    german = '',
    article = null,
    english = '',
    userAnswer = '',
    correctAnswer = '',
    example = '',
    exampleEn = '',
  } = mistake || {};

  const normType = exerciseType === 'listening' ? 'audio' : exerciseType;
  const germanWithArt = article ? `${article} ${german}` : german;

  // Helper: look up word in words.json by German word
  const findByDe = (deWord) => {
    if (!deWord) return null;
    const clean = deWord.trim().toLowerCase();
    return words.find((w) => w.de.toLowerCase() === clean);
  };

  // Helper: look up word in words.json by English meaning
  const findByEn = (enWord) => {
    if (!enWord) return null;
    const clean = enWord.trim().toLowerCase();
    return words.find((w) => w.en.toLowerCase() === clean);
  };

  // Find target word entry from words.json
  const targetWord = findByDe(german) || {};

  // Deterministic memory hint rule:
  // 1. if word.tip exists: "Remember: <tip>"
  // 2. else if word.identical: "Remember: Same as English '<english>'. Only learn the article: <article>."
  // 3. else if word.cognate: "Remember: Similar to English '<english>'. Only learn the article: <article>."
  // 4. else for sentence: "Remember: read it aloud slowly, word by word."
  // 5. else: "Remember: <article> <german> = <english>."
  let hint = '';
  if (targetWord.tip && typeof targetWord.tip === 'string' && targetWord.tip.trim()) {
    hint = `Remember: ${targetWord.tip.trim()}`;
  } else if (targetWord.identical) {
    const art = targetWord.article || article || '';
    const en = targetWord.en || english || '';
    hint = `Remember: Same as English '${en}'. Only learn the article: ${art}.`;
  } else if (targetWord.cognate) {
    const art = targetWord.article || article || '';
    const en = targetWord.en || english || '';
    hint = `Remember: Similar to English '${en}'. Only learn the article: ${art}.`;
  } else if (normType === 'sentence') {
    hint = 'Remember: read it aloud slowly, word by word.';
  } else {
    hint = `Remember: ${germanWithArt} = ${english}.`;
  }

  let lines = [];
  let diffNote = '';

  switch (normType) {
    case 'article': {
      lines = [
        `You chose: ${userAnswer}`,
        `Correct: ${germanWithArt} (${english})`,
        `Every German noun has a fixed article. You can't guess it, so learn '${germanWithArt}' as one unit.`,
      ];
      break;
    }

    case 'mcq': {
      const uVocab = findByEn(userAnswer);
      const uGermanWithArt = uVocab ? (uVocab.article ? `${uVocab.article} ${uVocab.de}` : uVocab.de) : userAnswer;
      const uGermanWord = uVocab ? uVocab.de : userAnswer;
      const uMeaning = uVocab ? uVocab.en : userAnswer;

      lines = [
        `You chose: ${userAnswer} = ${uGermanWithArt}`,
        `Correct: ${germanWithArt} = ${english}`,
        `${uGermanWord} means ${uMeaning}. ${german} means ${english}.`,
      ];
      break;
    }

    case 'audio': {
      lines = [
        `You heard: ${germanWithArt}`,
        `You chose: ${userAnswer}`,
        `Correct: ${english}`,
      ];
      break;
    }

    case 'cloze': {
      const uVocab = findByDe(userAnswer);
      const uMeaning = uVocab ? uVocab.en : '';

      lines = [
        `You chose: ${userAnswer}${uMeaning ? ` (${uMeaning})` : ''}`,
        `Sentence: "${example}" = "${exampleEn}"`,
        `The English says ${english}, so the missing word is ${correctAnswer}.`,
      ];
      break;
    }

    case 'typing': {
      diffNote = computeTypingDiff(userAnswer, correctAnswer);
      lines = [
        `You typed: ${userAnswer}`,
        `Correct: ${correctAnswer}`,
        diffNote,
      ];
      break;
    }

    case 'sentence': {
      diffNote = computeSentenceDiff(userAnswer, correctAnswer);
      lines = [
        `You wrote: ${userAnswer}`,
        `Correct: ${correctAnswer}`,
        diffNote,
      ];
      break;
    }

    default: {
      lines = [
        `You answered: ${userAnswer}`,
        `Correct: ${correctAnswer}`,
        `${germanWithArt} means ${english}.`,
      ];
      break;
    }
  }

  return { lines, hint, diffNote };
}

let aiCallCount = 0;
const MAX_AI_CALLS = 20;

const COMMON_EN_CAPS = new Set([
  'I', 'You', 'He', 'She', 'It', 'We', 'They', 'The', 'A', 'An', 'This', 'That',
  'Here', 'There', 'In', 'On', 'At', 'To', 'For', 'With', 'By', 'From', 'Of',
  'And', 'But', 'Or', 'So', 'Because', 'If', 'When', 'Then', 'As', 'Remember',
  'Your', 'My', 'His', 'Her', 'Our', 'Their', 'Is', 'Are', 'Was', 'Were', 'Be',
  'Have', 'Has', 'Had', 'Do', 'Does', 'Did', 'Can', 'Could', 'Will', 'Would',
  'Should', 'May', 'Might', 'Must', 'Every', 'All', 'Some', 'Any', 'No', 'Not',
  'What', 'Who', 'Where', 'When', 'Why', 'How', 'Which', 'Both', 'Neither',
  'Either', 'Think', 'Use', 'Notice', 'Note', 'Compare', 'Means', 'Word', 'Answer',
  'Correct', 'Incorrect', 'English', 'German'
]);

/**
 * Fetch an AI-generated explanation, falling back to null if it hallucinates
 * German words or exceeds the session quota.
 */
export async function fetchAIExplanation(mistake, words = []) {
  if (aiCallCount >= MAX_AI_CALLS) {
    return null;
  }

  const {
    exerciseType,
    german = '',
    article = null,
    english = '',
    userAnswer = '',
    correctAnswer = '',
    example = '',
    exampleEn = '',
  } = mistake || {};

  const normType = exerciseType === 'listening' ? 'audio' : exerciseType;
  const germanWithArt = article ? `${article} ${german}` : german;

  const findByDe = (deWord) => {
    if (!deWord) return null;
    const clean = deWord.trim().toLowerCase();
    return words.find((w) => w.de.toLowerCase() === clean);
  };
  const findByEn = (enWord) => {
    if (!enWord) return null;
    const clean = enWord.trim().toLowerCase();
    return words.find((w) => w.en.toLowerCase() === clean);
  };

  const targetWord = findByDe(german) || {};

  let payload = {
    exerciseType: normType,
    userAnswer: userAnswer,
    userMeaning: '',
    correctAnswer: correctAnswer || germanWithArt,
    correctMeaning: english,
    example: example,
    exampleEn: exampleEn,
    tip: targetWord.tip || '',
  };

  if (normType === 'mcq') {
    const uVocab = findByEn(userAnswer);
    payload.userMeaning = uVocab ? (uVocab.article ? `${uVocab.article} ${uVocab.de}` : uVocab.de) : '';
  } else if (normType === 'cloze' || normType === 'audio') {
    const uVocab = findByDe(userAnswer);
    payload.userMeaning = uVocab ? uVocab.en : '';
  }

  // Create allowed tokens set from input payload
  const allowedTokens = new Set();
  const addTokens = (str) => {
    if (!str) return;
    str.replace(/[.,?!()"':;]/g, ' ').split(/\s+/).forEach(t => {
      if (t) allowedTokens.add(t);
    });
  };
  addTokens(payload.userAnswer);
  addTokens(payload.userMeaning);
  addTokens(payload.correctAnswer);
  addTokens(payload.correctMeaning);
  addTokens(payload.example);
  addTokens(payload.exampleEn);
  addTokens(payload.tip);
  addTokens(germanWithArt);

  try {
    aiCallCount++;
    const res = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.explanation || data.explanation === 'FALLBACK') return null;

    const explanation = data.explanation;
    const responseTokens = explanation.replace(/[.,?!()"']/g, ' ').split(/\s+/).filter(Boolean);
    
    // Strict validation: check all German-looking tokens
    for (const token of responseTokens) {
      const hasUmlaut = /[äöüßÄÖÜ]/.test(token);
      const isCapitalized = /^[A-ZÄÖÜ]/.test(token);
      
      let isGermanic = hasUmlaut || (isCapitalized && !COMMON_EN_CAPS.has(token));
      
      // If it looks like a German noun or has umlauts, it MUST be in the allowed tokens list
      // We check case-insensitively just in case, but prefer exact match
      if (isGermanic) {
        let found = false;
        for (const allowed of allowedTokens) {
          if (allowed.toLowerCase() === token.toLowerCase()) {
            found = true;
            break;
          }
        }
        if (!found) {
          console.warn(`AI Hallucination detected: rejected token "${token}"`);
          return null; // Reject the whole response
        }
      }
    }

    // Split into 3 lines (or just return as is if the UI handles lines)
    // The prompt asked for exactly 3 short sentences. 
    // We can just split by '.' or '\n' if we need to format it into lines.
    // The deterministic builder returns `{ lines, hint }`.
    // Let's format the AI output into a similar structure: { isAi: true, lines: [...] }
    
    // Simple sentence split:
    const aiLines = explanation.match(/[^.!?]+[.!?]+/g) || [explanation];
    
    return { isAi: true, lines: aiLines.map(l => l.trim()), hint: '' };
  } catch (e) {
    return null;
  }
}
