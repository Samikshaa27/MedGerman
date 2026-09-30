import { useState, useCallback, useEffect, useRef } from 'react';
import {
  speak,
  getSpokenText,
  getSpokenTextForLearn,
  isPronunciationMatch,
} from '../lib/speech.js';
import { useSpeechPlayback, renderSpokenText } from '../lib/useSpeechPlayback.jsx';
import { grade, getReencounterText } from '../lib/srs.js';
import { loadProgress, saveProgress, defaultProgress, addXP, addDailyXP } from '../lib/storage.js';
import { buildExplanation, evaluateAnswer, fetchAIExplanation } from '../lib/explain.js';
import { playCorrectSound, playIncorrectSound } from '../lib/sound.js';
import words from '../data/words.json';
import { markWordCompleted } from '../lib/storage.js';

/**
 * Practice component: renders one exercise at a time from a session queue.
 * Props:
 *   session      – initial array of exercise objects from buildSession()
 *   onFinish     – callback when all exercises are done, receives { correct, total, missed }
 *   variant      – 'practice' (full loop: explanations + re-queue) | 'quiz' (no explanations, no re-queue)
 *   answeredIds  – exercise indexes already answered (skip guard for non-advancing quiz variants)
 *   progressMeta – { levelId } when the session records level completion on correct answers
 *   onSkip       – exit callback rendered as “Leave” (used by timed Test sessions)
 */
export default function Practice({
  session,
  onFinish,
  audioAvailable = true,
  variant = 'practice',
  progressMeta = null,
  onSkip = null,
  answeredIds = null,
  onAnswered = null,
  expired = false,
}) {
  const [queue, setQueue] = useState(session);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [typed, setTyped] = useState('');
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [softNote, setSoftNote] = useState(null);
  const [mistake, setMistake] = useState(null);
  const [explanationData, setExplanationData] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [xpToast, setXpToast] = useState(null);
  const [results, setResults] = useState({ correct: 0, total: 0, missed: [] });
  const [playingId, setPlayingId] = useState(null);

  const current = queue[index];

  const handleSelect = useCallback(
    (option) => {
      if (answered) return;
      setSelected(option);
      setSoftNote(null);
      const correct = option === current.correct;
      submitAnswer(correct, option);
    },
    [answered, current]
  );

  const handleTypingSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (answered || !typed.trim()) return;
      const ans = typed.trim();
      const evalResult = evaluateAnswer(ans, current.correct, current.type);
      setSoftNote(evalResult.note);
      submitAnswer(evalResult.isCorrect, ans);
    },
    [answered, typed, current]
  );

  async function handleExplain() {
    if (explanationData || isExplaining || !mistake) return;
    setIsExplaining(true);
    try {
      // Fast race: Groq responds in ~250ms; if taking > 1.2s or offline, fall back directly
      const aiPromise = fetchAIExplanation(mistake, words);
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1200));
      const aiData = await Promise.race([aiPromise, timeoutPromise]);

      if (aiData) {
        setExplanationData(aiData);
      } else {
        setExplanationData(buildExplanation(mistake, words));
      }
    } catch {
      setExplanationData(buildExplanation(mistake, words));
    } finally {
      setIsExplaining(false);
    }
  }

  function submitAnswer(correct, ans) {
    if (answeredIds && answeredIds.includes(index)) return; // already answered in quiz mode
    setAnswered(true);
    setIsCorrect(correct);

    if (correct) {
      playCorrectSound();
      const bonus = softNote ? 2 : 0;
      const gained = 10 + bonus;
      addXP(gained);
      addDailyXP(gained);
      setXpToast({ text: bonus > 0 ? `+${gained} XP (typing bonus!)` : `+${gained} XP`, id: Date.now() });
      setMistake(null);
    } else {
      playIncorrectSound();
      setXpToast(null);
      const mistakeData = {
        exerciseType: current.type === 'listening' ? 'audio' : current.type,
        german: current.word.de,
        article: current.word.article,
        english: current.word.en,
        userAnswer: ans,
        correctAnswer: current.correct,
        category: current.word.theme,
        example: current.word.example,
        exampleEn: current.word.exampleEn,
      };
      setMistake(mistakeData);
    }

    // Update SRS progress (with per-exercise-type stats for adaptive selection)
    const progress = loadProgress();
    const wordId = current.word.id;
    const prev = progress[wordId] || defaultProgress();
    progress[wordId] = grade(prev, correct, current.type);
    saveProgress(progress);

    // Level completion (Tab 3) is recorded separately from SRS boxes:
    // one correct pass marks the item as "done" for that level.
    if (progressMeta && progressMeta.levelId && correct) {
      markWordCompleted(progressMeta.levelId, wordId);
    }

    // Track results (submitAnswer runs once per exercise, so plain state is safe)
    const next = {
      correct: results.correct + (correct ? 1 : 0),
      total: results.total + 1,
      missed: correct ? results.missed : [...results.missed, current.word],
    };
    setResults(next);
    if (onAnswered) onAnswered(index, next);

    // Re-queue wrong answers at the end (full practice loop only)
    if (!correct && variant !== 'quiz') {
      setQueue((prev) => [...prev, current]);
    }
  }

  function resetExerciseState() {
    setSelected(null);
    setTyped('');
    setAnswered(false);
    setIsCorrect(false);
    setSoftNote(null);
    setMistake(null);
    setExplanationData(null);
    setIsExplaining(false);
    setXpToast(null);
  }

  function handleIntroGotIt() {
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      onFinish(results);
      return;
    }
    setIndex(nextIndex);
    resetExerciseState();
  }

  function handleNext() {
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      onFinish(results);
      return;
    }
    setIndex(nextIndex);
    resetExerciseState();
  }

  /** Restart the whole session from the beginning with the same exercises. */
  function handleRestart() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setQueue(session);
    setIndex(0);
    setResults({ correct: 0, total: 0, missed: [] });
    resetExerciseState();
  }

  function playAudio(id, textOrParts, rate = 0.85) {
    speak(textOrParts, {
      rate,
      onstart: () => setPlayingId(id),
      onend: () => setPlayingId(null),
    });
  }

  if (!current) return null;

  // Timed test: time is up — finish immediately with what was answered so far.
  // (Kept before rendering so an expired session never shows another question.)
  useEffect(() => {
    if (expired) {
      onFinish(results);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  const totalGraded = queue.filter((item) => item.type !== 'intro').length;
  const currentGradedIndex = queue.slice(0, index).filter((item) => item.type !== 'intro').length;
  const progressPct = totalGraded > 0 ? Math.round((currentGradedIndex / totalGraded) * 100) : 0;
  const word = current.word;
  const label = word.article
    ? `${word.article}${word.plural ? ' (Pl.)' : ''} ${word.de}`
    : word.de;

  // Attempt number for the current exercise within this session
  // (re-queued wrong answers count as additional attempts)
  const attemptNo =
    queue.slice(0, index + 1).filter((q) => q.word.id === word.id && q.type === current.type)
      .length || 1;

  // New-word intro: full-screen pronunciation screen
  if (current.type === 'intro') {
    return (
      <IntroFullScreen
        key={word.id}
        word={word}
        audioAvailable={audioAvailable}
        onDone={handleIntroGotIt}
      />
    );
  }

  return (
    <div className="practice">
      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="progress-row">
        <p className="progress-text">
          {currentGradedIndex + 1} / {totalGraded} · Attempt {attemptNo}
        </p>
        <div className="progress-actions">
          {onSkip && (
            <button
              type="button"
              className="restart-btn"
              onClick={onSkip}
              title="Leave this session"
            >
              Leave
            </button>
          )}
          <button
            type="button"
            className="restart-btn"
            onClick={handleRestart}
            title="Restart this session from the beginning"
          >
            Restart
          </button>
        </div>
      </div>

      {/* Question */}
      <div className="question-card">
        {renderQuestion(current, typed, setTyped, handleTypingSubmit, handleSelect, answered, selected, audioAvailable, playingId, playAudio)}
      </div>

      {/* XP toast */}
      {xpToast && (
        <div className="xp-toast" key={xpToast.id}>{xpToast.text}</div>
      )}

      {/* Feedback */}
      {answered && (
        <div className={`feedback ${isCorrect ? 'correct anim-correct' : 'incorrect anim-incorrect'}`}>
          <p className="feedback-label">
            {isCorrect ? <span className="anim-checkmark">✓</span> : <span className="anim-shake">✗</span>}
            {isCorrect ? ' Correct!' : ' Incorrect'}
          </p>

          {isCorrect && softNote && (
            <p className="soft-note">
              {softNote}
            </p>
          )}

          {!isCorrect && mistake && (
            <div className="mistake-comparison">
              <p className="mistake-line">
                <span className="mistake-tag">You answered:</span>{' '}
                <strong className="mistake-val-wrong">{mistake.userAnswer}</strong>
              </p>
              <p className="mistake-line">
                <span className="mistake-tag">Correct:</span>{' '}
                <strong className="mistake-val-correct">{mistake.correctAnswer}</strong>
              </p>
            </div>
          )}

          {!isCorrect && variant !== 'quiz' && (
            <p className="loop-message">
              You'll see this word again in this session, and again {getReencounterText()}.
            </p>
          )}

          <p className="feedback-answer">
            <strong className={playingId === `fb_${word.id}` ? 'highlight-text' : ''}>{label}</strong> — {word.en}
            <span className="inline-audio-actions">
              <button
                type="button"
                className="rate-btn"
                onClick={() => playAudio(`fb_${word.id}`, getSpokenText(word), 0.5)}
                aria-label="Listen at half speed"
                disabled={!audioAvailable}
                title="Listen at half speed"
              >
                0.5x
              </button>
              <button
                type="button"
                className="listen-text-btn"
                onClick={() => playAudio(`fb_${word.id}`, getSpokenText(word), 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                Listen
              </button>
            </span>
          </p>
          {word.note && (
            <p className="feedback-note">{word.note}</p>
          )}
          <p className="feedback-example">
            <em className={playingId === `fb_ex_${word.id}` ? 'highlight-text' : ''}>{word.example}</em>
            <span className="inline-audio-actions">
              <button
                type="button"
                className="rate-btn"
                onClick={() => playAudio(`fb_ex_${word.id}`, word.example, 0.5)}
                aria-label="Listen to example at half speed"
                disabled={!audioAvailable}
                title="Listen at half speed"
              >
                0.5x
              </button>
              <button
                type="button"
                className="listen-text-btn"
                onClick={() => playAudio(`fb_ex_${word.id}`, word.example, 0.85)}
                aria-label="Listen to example sentence"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen to example' : 'Audio not available on this device'}
              >
                Listen
              </button>
            </span>
          </p>
          <p className="feedback-example-en">{word.exampleEn}</p>

          {!isCorrect && variant !== 'quiz' && (
            <div className="explain-section">
              {!explanationData && (
                <button
                  type="button"
                  className="btn secondary-btn explain-btn"
                  onClick={handleExplain}
                  disabled={isExplaining}
                >
                  {isExplaining ? 'Thinking…' : 'Explain Mistake'}
                </button>
              )}
              {explanationData && (
                <div className="explanation-card">
                  <p className="explanation-title">Explanation:</p>
                  <div className="explanation-lines">
                    {explanationData.lines.map((line, idx) => (
                      <p key={idx} className="explanation-row">
                        {renderLineWithBold(line, mistake, words)}
                      </p>
                    ))}
                    {explanationData.hint && (
                      <p className="explanation-row explanation-hint">
                        {renderLineWithBold(explanationData.hint, mistake, words)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <button className="btn next-btn anim-bounce-btn" onClick={handleNext}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Full-screen new-word intro: only the word, centered, with letter-by-letter
 * highlighting while it is spoken. The learner pronounces it; a match turns
 * the screen green, a miss turns it red. Tracks the attempt count.
 */
function IntroFullScreen({ word, audioAvailable, onDone }) {
  const [attempts, setAttempts] = useState(1);
  const [checkState, setCheckState] = useState(null); // null | 'green' | 'red'
  const [listening, setListening] = useState(false);
  const [selfCheck, setSelfCheck] = useState(false);
  const [heard, setHeard] = useState(null);
  const { charIndex, play, stop } = useSpeechPlayback();
  const recognitionRef = useRef(null);
  const recognitionTimeoutRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const replayTimerRef = useRef(null);

  const spokenText = getSpokenText(word); // "der Bauch" or the sentence
  const learnText = getSpokenTextForLearn(word); // string or array of parts

  const sayWord = useCallback(
    (rate) => {
      play(`intro_${word.id}`, learnText, rate, 110);
    },
    [learnText, play, word.id]
  );

  function abortRecognition() {
    if (recognitionTimeoutRef.current) {
      clearTimeout(recognitionTimeoutRef.current);
      recognitionTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
  }

  function clearTimers() {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    if (replayTimerRef.current) clearTimeout(replayTimerRef.current);
    advanceTimerRef.current = null;
    replayTimerRef.current = null;
  }

  // Auto-play the word once on entry; clean everything up on exit
  useEffect(() => {
    const t = setTimeout(() => sayWord(0.8), 350);
    const replay = replayTimerRef;
    const adv = advanceTimerRef;
    return () => {
      clearTimeout(t);
      clearTimers();
      abortRecognition();
      stop();
      void replay;
      void adv;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleVerdict(passed) {
    abortRecognition();
    setListening(false);
    setSelfCheck(false);
    setHeard(null);
    if (passed) {
      setCheckState('green');
      playCorrectSound();
      advanceTimerRef.current = setTimeout(() => {
        onDone();
      }, 1600);
    } else {
      setCheckState('red');
      playIncorrectSound();
      // Replay the word slowly so the learner can compare
      replayTimerRef.current = setTimeout(() => sayWord(0.5), 700);
    }
  }

  function tryRecognition() {
    clearTimers();
    setCheckState(null);
    setHeard(null);
    setAttempts((a) => a + 1);

    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      // No microphone API: let the learner self-check
      setSelfCheck(true);
      return;
    }
    try {
      const rec = new SR();
      rec.lang = 'de-DE';
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      rec.onresult = (e) => {
        const alts = [];
        for (let i = 0; i < e.results[0].length; i++) {
          alts.push(e.results[0][i].transcript);
        }
        setHeard(alts[0] || null);
        const passed = alts.some((t) => isPronunciationMatch(t, spokenText));
        handleVerdict(passed);
      };
      rec.onerror = () => {
        setListening(false);
        setSelfCheck(true);
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
      // Safety net: if no result/error arrives (e.g. missing mic), fall back
      // to self-check after a few seconds.
      recognitionTimeoutRef.current = setTimeout(() => {
        if (recognitionRef.current === rec) {
          abortRecognition();
          setListening(false);
          setSelfCheck(true);
        }
      }, 6000);
    } catch {
      setListening(false);
      setSelfCheck(true);
    }
  }

  function skip() {
    clearTimers();
    abortRecognition();
    stop();
    onDone();
  }

  const stateClass =
    checkState === 'green'
      ? ' intro-fullscreen--green'
      : checkState === 'red'
        ? ' intro-fullscreen--red'
        : '';

  return (
    <div className={`intro-fullscreen${stateClass}`} role="region" aria-label={`New word: ${spokenText}`}>
      <div className="intro-fs-top">
        <span className="intro-fs-badge">New Word</span>
        <span className="intro-fs-attempts">Attempt {attempts}</span>
      </div>

      <div className="intro-fs-center">
        <h2 className="intro-fs-word" aria-label={spokenText}>
          {renderSpokenText(learnText, charIndex)}
        </h2>
        <p className="intro-fs-hint">
          {checkState === 'green'
            ? 'Pronounced correctly!'
            : checkState === 'red'
              ? heard
                ? `Heard: "${heard}" — try again`
                : 'Not quite — listen and try again'
              : listening
                ? 'Listening… say the word now'
                : 'Listen, then say the word aloud'}
        </p>
      </div>

      <div className="intro-fs-actions">
        {checkState !== 'green' && (
          <>
            {audioAvailable && (
              <>
                <button
                  type="button"
                  className="rate-btn"
                  onClick={() => sayWord(0.5)}
                  title="Listen at half speed"
                >
                  0.5x
                </button>
                <button
                  type="button"
                  className="listen-text-btn"
                  onClick={() => sayWord(0.85)}
                  title="Listen"
                >
                  Listen
                </button>
              </>
            )}
            {!selfCheck && !listening && (
              <button type="button" className="btn primary-btn" onClick={tryRecognition}>
                Say it
              </button>
            )}
            {selfCheck && (
              <>
                <button type="button" className="btn primary-btn" onClick={() => handleVerdict(true)}>
                  I said it correctly
                </button>
                <button type="button" className="btn secondary-btn" onClick={() => handleVerdict(false)}>
                  Not correct yet
                </button>
              </>
            )}
          </>
        )}
        {checkState === 'green' && (
          <button type="button" className="btn primary-btn" onClick={skip}>
            Continue
          </button>
        )}
        <button type="button" className="intro-fs-skip" onClick={skip}>
          {checkState === 'green' ? '' : 'Skip →'}
        </button>
      </div>
    </div>
  );
}

/**
 * Highlights/bolds German words and phrases within explanation lines.
 */
function renderLineWithBold(line, mistake, words) {
  if (!line) return null;
  const candidates = new Set();
  if (mistake.article && mistake.german) candidates.add(`${mistake.article} ${mistake.german}`);
  if (mistake.german) candidates.add(mistake.german);
  if (mistake.correctAnswer) candidates.add(mistake.correctAnswer);
  if (mistake.example) candidates.add(mistake.example);
  if (mistake.article) candidates.add(mistake.article);
  if (
    mistake.userAnswer &&
    (mistake.exerciseType === 'article' ||
      mistake.exerciseType === 'cloze' ||
      mistake.exerciseType === 'typing' ||
      mistake.exerciseType === 'sentence')
  ) {
    candidates.add(mistake.userAnswer);
  }

  // Also include vocabulary words that appear in the line
  if (words && Array.isArray(words)) {
    for (const w of words) {
      if (w.article && line.includes(`${w.article} ${w.de}`)) {
        candidates.add(`${w.article} ${w.de}`);
      }
      if (line.includes(w.de)) {
        candidates.add(w.de);
      }
    }
  }

  const sortedTerms = [...candidates]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (sortedTerms.length === 0) return line;

  const escaped = sortedTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${escaped})`, 'g');
  const parts = line.split(regex);

  return parts.map((part, i) =>
    candidates.has(part) ? (
      <strong key={i} className="german-highlight">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

/**
 * Renders the question area based on exercise type.
 */
function renderQuestion(
  exercise,
  typed,
  setTyped,
  handleTypingSubmit,
  handleSelect,
  answered,
  selected,
  audioAvailable = true,
  playingId,
  playAudio
) {
  const { word, type } = exercise;

  switch (type) {
    case 'mcq':
      return (
        <>
          <p className="question-label">What does this mean?</p>
          <p className="question-word">
            <span className={playingId === `q_mcq_${word.id}` ? 'highlight-text' : ''}>
              {word.article
                ? `${word.article}${word.plural ? ' (Pl.)' : ''} ${word.de}`
                : word.de}
            </span>
            <span className="inline-audio-actions">
              <button
                type="button"
                className="rate-btn"
                onClick={() => playAudio(`q_mcq_${word.id}`, getSpokenText(word), 0.5)}
                aria-label="Listen at half speed"
                disabled={!audioAvailable}
                title="Listen at half speed"
              >
                0.5x
              </button>
              <button
                type="button"
                className="listen-text-btn"
                onClick={() => playAudio(`q_mcq_${word.id}`, getSpokenText(word), 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                Listen
              </button>
            </span>
          </p>
          <div className="options">
            {exercise.options.map((opt) => (
              <button
                key={opt}
                className={`option-btn ${optionClass(opt, exercise.correct, selected, answered)}`}
                onClick={() => handleSelect(opt)}
                disabled={answered}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      );

    case 'article':
      return (
        <>
          <p className="question-label">Pick the correct article</p>
          <p className="question-word">
            ___ <span className={playingId === `q_art_${word.id}` ? 'highlight-text' : ''}>{word.de} {word.plural ? '(Pl.)' : ''}</span>
            <span className="inline-audio-actions">
              <button
                type="button"
                className="rate-btn"
                onClick={() => playAudio(`q_art_${word.id}`, `${word.article} ${word.de}`, 0.5)}
                aria-label="Listen at half speed"
                disabled={!audioAvailable}
                title="Listen at half speed"
              >
                0.5x
              </button>
              <button
                type="button"
                className="listen-text-btn"
                onClick={() => playAudio(`q_art_${word.id}`, `${word.article} ${word.de}`, 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                Listen
              </button>
            </span>
          </p>
          <div className="options">
            {exercise.options.map((opt) => (
              <button
                key={opt}
                className={`option-btn ${optionClass(opt, exercise.correct, selected, answered)}`}
                onClick={() => handleSelect(opt)}
                disabled={answered}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      );

    case 'listening':
      return (
        <>
          <p className="question-label">Listen and pick the meaning</p>
          <div className="audio-actions" style={{ justifyContent: 'center', marginBottom: 16 }}>
            <button
              type="button"
              className="rate-btn"
              onClick={() => playAudio(`q_lis_${word.id}`, getSpokenText(word), 0.5)}
              aria-label="Play at half speed"
              disabled={!audioAvailable}
              title="Play at half speed"
            >
              0.5x
            </button>
            <button
              type="button"
              className="listen-text-btn"
              onClick={() => playAudio(`q_lis_${word.id}`, getSpokenText(word), 0.85)}
              aria-label="Play audio"
              disabled={!audioAvailable}
              title={audioAvailable ? 'Play audio' : 'Audio not available on this device'}
            >
              Play
            </button>
          </div>
          <div className="options">
            {exercise.options.map((opt) => (
              <button
                key={opt}
                className={`option-btn ${optionClass(opt, exercise.correct, selected, answered)}`}
                onClick={() => handleSelect(opt)}
                disabled={answered}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      );

    case 'cloze':
      return (
        <>
          <p className="question-label">Fill in the blank</p>
          <p className="question-sentence">
            <span className={playingId === `q_clz_${word.id}` ? 'highlight-text' : ''}>{exercise.sentence}</span>
            <span className="inline-audio-actions">
              <button
                type="button"
                className="rate-btn"
                onClick={() => playAudio(`q_clz_${word.id}`, word.example, 0.5)}
                aria-label="Listen at half speed"
                disabled={!audioAvailable}
                title="Listen at half speed"
              >
                0.5x
              </button>
              <button
                type="button"
                className="listen-text-btn"
                onClick={() => playAudio(`q_clz_${word.id}`, word.example, 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                Listen
              </button>
            </span>
          </p>
          <div className="options">
            {exercise.options.map((opt) => (
              <button
                key={opt}
                className={`option-btn ${optionClass(opt, exercise.correct, selected, answered)}`}
                onClick={() => handleSelect(opt)}
                disabled={answered}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      );

    case 'typing':
      return (
        <>
          <p className="question-label">Type this in German</p>
          <p className="question-en">
            {word.en}
            <span className="inline-audio-actions">
              <button
                type="button"
                className="rate-btn"
                onClick={() => playAudio(`q_typ_${word.id}`, getSpokenText(word), 0.5)}
                aria-label="Listen at half speed"
                disabled={!audioAvailable}
                title="Listen at half speed"
              >
                0.5x
              </button>
              <button
                type="button"
                className="listen-text-btn"
                onClick={() => playAudio(`q_typ_${word.id}`, getSpokenText(word), 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                Listen
              </button>
            </span>
          </p>
          <form onSubmit={handleTypingSubmit} className="typing-form">
            <input
              type="text"
              className="typing-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type the German word…"
              autoFocus
              disabled={answered}
            />
            {!answered && (
              <button type="submit" className="btn submit-btn">
                Check
              </button>
            )}
            <p className="typing-hint">Tip: you can type ae, oe, ue, ss instead of ä, ö, ü, ß.</p>
          </form>
        </>
      );

    case 'sentence':
      return (
        <>
          <p className="question-label">Type this sentence in German</p>
          <p className="question-en">
            {word.en}
            <span className="inline-audio-actions">
              <button
                type="button"
                className="rate-btn"
                onClick={() => playAudio(`q_snt_${word.id}`, word.de, 0.5)}
                aria-label="Listen at half speed"
                disabled={!audioAvailable}
                title="Listen at half speed"
              >
                0.5x
              </button>
              <button
                type="button"
                className="listen-text-btn"
                onClick={() => playAudio(`q_snt_${word.id}`, word.de, 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                Listen
              </button>
            </span>
          </p>
          <form onSubmit={handleTypingSubmit} className="typing-form">
            <input
              type="text"
              className="typing-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type the sentence…"
              autoFocus
              disabled={answered}
            />
            {!answered && (
              <button type="submit" className="btn submit-btn">
                Check
              </button>
            )}
            <p className="typing-hint">Tip: you can type ae, oe, ue, ss instead of ä, ö, ü, ß.</p>
          </form>
        </>
      );

    default:
      return null;
  }
}

/**
 * Returns CSS class for an option button based on answer state.
 */
function optionClass(option, correct, selected, answered) {
  if (!answered) return '';
  if (option === correct) return 'option-correct';
  if (option === selected) return 'option-wrong';
  return '';
}

// Shared with the shell's quiz variants (Daily Challenges, Test):
// they reuse the exact same exercise renderers, only the loop differs.
export { renderQuestion };

