// Text-to-speech helper for German pronunciation

let isInitialized = false;
let germanVoiceAvailable = false;
const listeners = new Set();

function checkGermanVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    germanVoiceAvailable = false;
    return false;
  }
  try {
    const voices = window.speechSynthesis.getVoices() || [];
    germanVoiceAvailable = voices.some(
      (v) =>
        v.lang &&
        (v.lang.toLowerCase().startsWith('de') ||
          v.lang.replace('_', '-').toLowerCase().startsWith('de-'))
    );
  } catch {
    germanVoiceAvailable = false;
  }
  return germanVoiceAvailable;
}

export function initSpeech() {
  if (typeof window === 'undefined') return;
  if (isInitialized) return;
  isInitialized = true;

  checkGermanVoices();

  if (window.speechSynthesis) {
    // Listen for voiceschanged event because voices load asynchronously on mobile and some browsers
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      const prev = germanVoiceAvailable;
      checkGermanVoices();
      if (prev !== germanVoiceAvailable) {
        listeners.forEach((cb) => cb(germanVoiceAvailable));
      }
    });

    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        const prev = germanVoiceAvailable;
        checkGermanVoices();
        if (prev !== germanVoiceAvailable) {
          listeners.forEach((cb) => cb(germanVoiceAvailable));
        }
      };
    }
  }
}

/**
 * Returns true if a German voice is detected and speech synthesis is available.
 */
export function hasGermanVoice() {
  if (!isInitialized) {
    initSpeech();
  }
  return germanVoiceAvailable;
}

/**
 * Subscribe to changes in German voice availability.
 * Returns unsubscribe function.
 */
export function subscribeVoiceChange(callback) {
  if (!isInitialized) {
    initSpeech();
  }
  listeners.add(callback);
  callback(germanVoiceAvailable);
  return () => listeners.delete(callback);
}

/**
 * Returns the complete spoken phrase for a word entry:
 * includes article + noun for nouns (e.g. "der Bauch"),
 * or the full sentence for sentence entries (e.g. "Ich messe jetzt Ihren Blutdruck.").
 */
export function getSpokenText(word) {
  if (!word) return '';
  if (typeof word === 'string') return word;
  if (word.article) {
    return `${word.article} ${word.de}`;
  }
  return word.de;
}

/**
 * Returns the text to speak on Learn/intro screens.
 * If the word has compound 'parts' defined, it returns an array of parts
 * (with the article prepended if present) so they are spoken with gaps.
 * Otherwise falls back to getSpokenText.
 */
export function getSpokenTextForLearn(word) {
  if (!word) return '';
  if (typeof word === 'string') return word;
  if (word.parts && Array.isArray(word.parts)) {
    return word.article ? [word.article, ...word.parts] : word.parts;
  }
  return getSpokenText(word);
}

/**
 * Find the best available German voice.
 * Prefers voices with "Google" or "Microsoft" in the name for better clarity.
 */
function getBestGermanVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const deVoices = voices.filter(
    (v) =>
      v.lang &&
      (v.lang.toLowerCase().startsWith('de') ||
        v.lang.replace('_', '-').toLowerCase().startsWith('de-'))
  );

  if (deVoices.length === 0) return null;

  // Rank voices: Google/Microsoft > others
  return deVoices.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aPref = aName.includes('google') || aName.includes('microsoft') ? 1 : 0;
    const bPref = bName.includes('google') || bName.includes('microsoft') ? 1 : 0;
    return bPref - aPref;
  })[0];
}

/**
 * Speak the given German text (or array of text parts) using the Web Speech API.
 * Cancels any currently playing speech before starting.
 * Options:
 * - rate: playback speed (default 0.85)
 * - onstart: callback when speech begins
 * - onend: callback when speech finishes
 */
export function speak(text, options = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  
  window.speechSynthesis.cancel();
  
  if (!text) {
    if (options.onend) options.onend();
    return null;
  }

  const { rate = 0.85, onstart, onend, onboundary } = options;
  const voice = getBestGermanVoice();

  // Handle compound word parts as sequential utterances
  if (Array.isArray(text)) {
    if (text.length === 0) return null;
    
    let currentIndex = 0;
    const playNext = () => {
      if (currentIndex >= text.length) {
        if (onend) onend();
        return;
      }
      
      const utterance = new SpeechSynthesisUtterance(text[currentIndex]);
      utterance.lang = 'de-DE';
      utterance.rate = rate;
      if (voice) utterance.voice = voice;
      
      if (currentIndex === 0 && onstart) {
        utterance.onstart = onstart;
      }
      if (onboundary) {
        utterance.onboundary = (event) => {
          // Offset charIndex so it addresses the joined string
          let base = 0;
          for (let i = 0; i < currentIndex; i++) {
            base += text[i].length + 1;
          }
          onboundary({
            charIndex: base + (event.charIndex || 0),
            charLength: event.charLength || 0,
          });
        };
      }
      
      utterance.onend = () => {
        currentIndex++;
        if (currentIndex < text.length) {
          setTimeout(playNext, 150); // ~150ms gap
        } else {
          if (onend) onend();
        }
      };
      
      window.speechSynthesis.speak(utterance);
    };
    
    playNext();
    return true; // We don't return a single utterance for arrays
  }

  // Single string
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = rate;
    if (voice) utterance.voice = voice;
    
    if (onstart) utterance.onstart = onstart;
    if (onend) utterance.onend = onend;
    if (onboundary) {
      utterance.onboundary = (event) =>
        onboundary({ charIndex: event.charIndex || 0, charLength: event.charLength || 0 });
    }

    window.speechSynthesis.speak(utterance);
    return utterance;
  } catch {
    if (onend) onend();
    return null;
  }
}

/**
 * Timed letter-by-letter highlight fallback for browsers/voices that never
 * fire boundary events. Yields charIndex positions across `text` at a pace
 * derived from msPerChar, scaled by the speech rate (slower rate = longer
 * per character).
 *
 * Returns a cancel function; the caller can cancel the emulation once real
 * boundary events start arriving.
 *
 * @param {string} text
 * @param {(charIndex: number) => void} onChar
 * @param {() => void} onDone
 * @param {number} msPerChar baseline ms per character at rate 1.0
 * @param {number} rate speech rate (lower = slower speech = longer per char)
 */
export function startTimedHighlight(text, onChar, onDone, msPerChar = 85, rate = 0.85) {
  if (typeof window === 'undefined') return () => {};
  const step = Math.max(25, msPerChar / Math.max(0.25, rate));
  let i = 0;
  let timer = null;

  const tick = () => {
    if (i >= text.length) {
      if (onDone) onDone();
      return;
    }
    if (onChar) onChar(i);
    i++;
    timer = setTimeout(tick, step);
  };
  timer = setTimeout(tick, step);

  return function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

/**
 * Loose comparison of what the learner said with the expected German text.
 * Uses the same umlaut folding as the typing exercises plus de-accenting of
 * the recognised transcript, so recognition hiccups on umlauts do not punish
 * the learner. Collapses duplicated adjacent words to tolerate stray article
 * echoes from the recogniser.
 *
 * @returns {boolean}
 */
export function isPronunciationMatch(recognised, expected) {
  if (!recognised || !expected) return false;

  const stripAccents = (s) =>
    s
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/á|à|â/g, 'a')
      .replace(/é|è|ê/g, 'e')
      .replace(/í|ì|î/g, 'i')
      .replace(/ó|ò|ô/g, 'o')
      .replace(/ú|ù|û/g, 'u');

  const norm = (s) =>
    stripAccents(String(s))
      .trim()
      .toLowerCase()
      .replace(/[.,!?;:]+/g, '')
      .replace(/\s+/g, ' ');

  const a = norm(recognised);
  const b = norm(expected);

  if (a === b) return true;

  // Tolerate a stray repeated word from the recogniser ("der der Bauch")
  const collapsed = a
    .split(' ')
    .filter((w, idx, arr) => idx === 0 || w !== arr[idx - 1])
    .join(' ');

  return collapsed === b;
}
