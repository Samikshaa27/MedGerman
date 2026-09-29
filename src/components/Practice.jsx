import { useState, useCallback } from 'react';
import { speak, getSpokenText, getSpokenTextForLearn } from '../lib/speech.js';
import { grade, getReencounterText } from '../lib/srs.js';
import { loadProgress, saveProgress, defaultProgress, addXP } from '../lib/storage.js';
import { buildExplanation, evaluateAnswer, fetchAIExplanation } from '../lib/explain.js';
import { playCorrectSound, playIncorrectSound } from '../lib/sound.js';
import words from '../data/words.json';

/**
 * Practice component: renders one exercise at a time from a session queue.
 * Props:
 *   session   – initial array of exercise objects from buildSession()
 *   onFinish  – callback when all exercises are done, receives { correct, total, missed }
 */
export default function Practice({ session, onFinish, audioAvailable = true }) {
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
    setAnswered(true);
    setIsCorrect(correct);

    if (correct) {
      playCorrectSound();
      const bonus = softNote ? 2 : 0;
      const gained = 10 + bonus;
      addXP(gained);
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

    // Update SRS progress
    const progress = loadProgress();
    const wordId = current.word.id;
    const prev = progress[wordId] || defaultProgress();
    progress[wordId] = grade(prev, correct);
    saveProgress(progress);

    // Track results
    setResults((prev) => {
      const next = {
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
        missed: correct
          ? prev.missed
          : [...prev.missed, current.word],
      };
      return next;
    });

    // Re-queue wrong answers at the end
    if (!correct) {
      setQueue((prev) => [...prev, current]);
    }
  }

  function handleIntroGotIt() {
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      onFinish(results);
      return;
    }
    setIndex(nextIndex);
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

  function handleNext() {
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) {
      onFinish(results);
      return;
    }
    setIndex(nextIndex);
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

  function playAudio(id, textOrParts, rate = 0.85) {
    speak(textOrParts, {
      rate,
      onstart: () => setPlayingId(id),
      onend: () => setPlayingId(null),
    });
  }

  if (!current) return null;

  const totalGraded = queue.filter((item) => item.type !== 'intro').length;
  const currentGradedIndex = queue.slice(0, index).filter((item) => item.type !== 'intro').length;
  const progressPct = totalGraded > 0 ? Math.round((currentGradedIndex / totalGraded) * 100) : 0;
  const word = current.word;
  const label = word.article
    ? `${word.article}${word.plural ? ' (Pl.)' : ''} ${word.de}`
    : word.de;

  // Intro step card
  if (current.type === 'intro') {
    return (
      <div className="practice">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="progress-text">
          New word preview ({currentGradedIndex} / {totalGraded})
        </p>

        <div className="intro-card question-card">
          <div className="intro-badge">✨ New Word</div>
          <div className="intro-word-row">
            <h2 className={`intro-german ${playingId === `intro_${word.id}` ? 'highlight-text' : ''}`}>
              {word.article ? (
                <>
                  <span className="intro-article">{word.article}</span> {word.de}
                  {word.plural ? ' (Pl.)' : ''}
                </>
              ) : (
                word.de
              )}
            </h2>
            {audioAvailable && (
              <div className="audio-actions">
                <button
                  type="button"
                  className="speaker-btn intro-speaker-btn slow-btn"
                  onClick={() => playAudio(`intro_${word.id}`, getSpokenTextForLearn(word), 0.6)}
                  aria-label="Listen slowly"
                >
                  🐢
                </button>
                <button
                  type="button"
                  className="speaker-btn intro-speaker-btn"
                  onClick={() => playAudio(`intro_${word.id}`, getSpokenTextForLearn(word), 0.8)}
                  aria-label={`Listen to ${getSpokenText(word)}`}
                >
                  🔊
                </button>
              </div>
            )}
          </div>
          <p className="intro-en">{word.en}</p>

          <div className="intro-example-box">
            <p className="intro-example">
              <em className={playingId === `intro_ex_${word.id}` ? 'highlight-text' : ''}>{word.example}</em>
              {audioAvailable && word.example && (
                <span className="inline-audio-actions">
                  <button
                    type="button"
                    className="speaker-btn feedback-speaker-btn slow-btn"
                    onClick={() => playAudio(`intro_ex_${word.id}`, word.example, 0.6)}
                    aria-label="Listen slowly"
                  >
                    🐢
                  </button>
                  <button
                    type="button"
                    className="speaker-btn feedback-speaker-btn"
                    onClick={() => playAudio(`intro_ex_${word.id}`, word.example, 0.8)}
                    aria-label={`Listen to ${word.example}`}
                  >
                    🔊
                  </button>
                </span>
              )}
            </p>
            <p className="intro-example-en">{word.exampleEn}</p>
          </div>

          {word.note && (
            <div className="intro-note">
              ℹ️ {word.note}
            </div>
          )}

          <button
            type="button"
            className="btn primary-btn intro-got-it-btn"
            onClick={handleIntroGotIt}
          >
            Got it →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice">
      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="progress-text">
        {currentGradedIndex + 1} / {totalGraded}
      </p>

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
              ℹ️ {softNote}
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

          {!isCorrect && (
            <p className="loop-message">
              You'll see this word again in this session, and again {getReencounterText()}.
            </p>
          )}

          <p className="feedback-answer">
            <strong className={playingId === `fb_${word.id}` ? 'highlight-text' : ''}>{label}</strong> — {word.en}
            <span className="inline-audio-actions">
              <button
                className="speaker-btn feedback-speaker-btn slow-btn"
                onClick={() => playAudio(`fb_${word.id}`, getSpokenText(word), 0.6)}
                aria-label="Listen slowly"
                disabled={!audioAvailable}
                title="Listen slowly"
              >
                🐢
              </button>
              <button
                className="speaker-btn feedback-speaker-btn"
                onClick={() => playAudio(`fb_${word.id}`, getSpokenText(word), 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                🔊
              </button>
            </span>
          </p>
          {word.note && (
            <p className="feedback-note">ℹ️ {word.note}</p>
          )}
          <p className="feedback-example">
            <em className={playingId === `fb_ex_${word.id}` ? 'highlight-text' : ''}>{word.example}</em>
            <span className="inline-audio-actions">
              <button
                className="speaker-btn feedback-speaker-btn slow-btn"
                onClick={() => playAudio(`fb_ex_${word.id}`, word.example, 0.6)}
                aria-label="Listen slowly"
                disabled={!audioAvailable}
                title="Listen slowly"
              >
                🐢
              </button>
              <button
                className="speaker-btn feedback-speaker-btn"
                onClick={() => playAudio(`fb_ex_${word.id}`, word.example, 0.85)}
                aria-label="Listen to example sentence"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen to example' : 'Audio not available on this device'}
              >
                🔊
              </button>
            </span>
          </p>
          <p className="feedback-example-en">{word.exampleEn}</p>

          {!isCorrect && (
            <div className="explain-section">
              {!explanationData && (
                <button
                  type="button"
                  className="btn secondary-btn explain-btn"
                  onClick={handleExplain}
                  disabled={isExplaining}
                >
                  {isExplaining ? '⏳ Thinking…' : '💡 Explain Mistake'}
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
                className="speaker-btn slow-btn"
                onClick={() => playAudio(`q_mcq_${word.id}`, getSpokenText(word), 0.6)}
                aria-label="Listen slowly"
                disabled={!audioAvailable}
              >
                🐢
              </button>
              <button
                className="speaker-btn"
                onClick={() => playAudio(`q_mcq_${word.id}`, getSpokenText(word), 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                🔊
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
                className="speaker-btn slow-btn"
                onClick={() => playAudio(`q_art_${word.id}`, `${word.article} ${word.de}`, 0.6)}
                aria-label="Listen slowly"
                disabled={!audioAvailable}
              >
                🐢
              </button>
              <button
                className="speaker-btn"
                onClick={() => playAudio(`q_art_${word.id}`, `${word.article} ${word.de}`, 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                🔊
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
              className="listen-play-btn slow-btn"
              onClick={() => playAudio(`q_lis_${word.id}`, getSpokenText(word), 0.6)}
              aria-label="Play slowly"
              disabled={!audioAvailable}
            >
              🐢
            </button>
            <button
              className="listen-play-btn"
              onClick={() => playAudio(`q_lis_${word.id}`, getSpokenText(word), 0.85)}
              aria-label="Play audio"
              disabled={!audioAvailable}
              title={audioAvailable ? 'Play audio' : 'Audio not available on this device'}
            >
              🔊 Play
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
                className="speaker-btn slow-btn"
                onClick={() => playAudio(`q_clz_${word.id}`, word.example, 0.6)}
                aria-label="Listen slowly"
                disabled={!audioAvailable}
              >
                🐢
              </button>
              <button
                className="speaker-btn"
                onClick={() => playAudio(`q_clz_${word.id}`, word.example, 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                🔊
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
          <p className="question-label">Type the German word</p>
          <p className="question-en">
            {word.en}
            <span className="inline-audio-actions">
              <button
                className="speaker-btn slow-btn"
                onClick={() => playAudio(`q_typ_${word.id}`, getSpokenText(word), 0.6)}
                aria-label="Listen slowly"
                disabled={!audioAvailable}
              >
                🐢
              </button>
              <button
                className="speaker-btn"
                onClick={() => playAudio(`q_typ_${word.id}`, getSpokenText(word), 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                🔊
              </button>
            </span>
          </p>
          <form onSubmit={handleTypingSubmit} className="typing-form">
            <input
              type="text"
              className="typing-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type in German…"
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
                className="speaker-btn slow-btn"
                onClick={() => playAudio(`q_snt_${word.id}`, word.de, 0.6)}
                aria-label="Listen slowly"
                disabled={!audioAvailable}
              >
                🐢
              </button>
              <button
                className="speaker-btn"
                onClick={() => playAudio(`q_snt_${word.id}`, word.de, 0.85)}
                aria-label="Listen"
                disabled={!audioAvailable}
                title={audioAvailable ? 'Listen' : 'Audio not available on this device'}
              >
                🔊
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
