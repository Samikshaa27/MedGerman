// React hook for speaking with letter-by-letter highlight tracking.

import { useRef, useState, useCallback, useEffect } from 'react';
import { speak, startTimedHighlight } from './speech.js';

/**
 * Tracks the highlighted character index while text is being spoken.
 * Uses utterance boundary events when the browser provides them and falls
 * back to a timed emulation otherwise (msPerChar scaled by speech rate).
 *
 * Returns { playingId, charIndex, play, stop }.
 * - play(id, text, rate, msPerChar, onDone): starts playback; charIndex
 *   advances letter by letter, then resets to -1 when done. onDone fires
 *   once playback finishes (or is superseded).
 * - charIndex indexes a plain rendering of the spoken string. For words with
 *   parts, render getSpokenTextForLearn(word).join(' ') so indexes line up.
 */
export function useSpeechPlayback() {
  const [playingId, setPlayingId] = useState(null);
  const [charIndex, setCharIndex] = useState(-1);
  const cancelTimedRef = useRef(null);
  const generationRef = useRef(0);
  const onDoneRef = useRef(null);

  const cleanup = useCallback(() => {
    if (cancelTimedRef.current) {
      cancelTimedRef.current();
      cancelTimedRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [cleanup]);

  const play = useCallback(
    (id, text, rate = 0.85, msPerChar = 85, onDone) => {
      cleanup();
      window.speechSynthesis && window.speechSynthesis.cancel();
      onDoneRef.current = typeof onDone === 'function' ? onDone : null;
      const generation = ++generationRef.current;
      setPlayingId(id);
      setCharIndex(-1);

      let sawBoundary = false;
      const finish = () => {
        if (generationRef.current !== generation) return;
        cleanup();
        setPlayingId(null);
        setCharIndex(-1);
        if (onDoneRef.current) {
          const cb = onDoneRef.current;
          onDoneRef.current = null;
          cb();
        }
      };

      const handleBoundary = (event) => {
        if (generationRef.current !== generation) return;
        sawBoundary = true;
        // Stop the timed emulation once real events arrive
        if (cancelTimedRef.current) {
          cancelTimedRef.current();
          cancelTimedRef.current = null;
        }
        setCharIndex(event.charIndex || 0);
      };

      // Start the timed emulation immediately so the highlight always moves;
      // real boundary events (if the browser fires them) take over and cancel it.
      if (typeof text === 'string' && text.length > 0) {
        cancelTimedRef.current = startTimedHighlight(
          text,
          (idx) => {
            if (generationRef.current !== generation || sawBoundary) return;
            setCharIndex(idx);
          },
          () => {
            // Emulation reached the end. If no real speech end arrives (e.g. no
            // matching voice on the device), still reset the highlight state.
            if (generationRef.current !== generation || sawBoundary) return;
            finish();
          },
          msPerChar,
          rate
        );
      }

      speak(text, {
        rate,
        onend: finish,
        onboundary: handleBoundary,
      });
    },
    [cleanup]
  );

  const stop = useCallback(() => {
    generationRef.current++;
    onDoneRef.current = null;
    cleanup();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setPlayingId(null);
    setCharIndex(-1);
  }, [cleanup]);

  return { playingId, charIndex, play, stop };
}

/**
 * Renders text with the character at charIndex highlighted (letter-by-letter
 * karaoke style). Accepts a string or an array of parts (joined with spaces
 * for indexing, rendered with article spacing).
 */
export function renderSpokenText(text, charIndex, highlightClass = 'letter-active') {
  const source = Array.isArray(text) ? text.join(' ') : String(text || '');
  const chars = Array.from(source);
  return chars.map((ch, i) => {
    const active = i === charIndex;
    const spoken = ch === ' ' ? '\u00A0' : ch;
    return active ? (
      <span key={i} className={highlightClass}>
        {spoken}
      </span>
    ) : (
      <span key={i}>{spoken}</span>
    );
  });
}
