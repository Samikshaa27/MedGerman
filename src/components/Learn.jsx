import { useState } from 'react';
import words from '../data/words.json';
import alphabet from '../data/alphabet.json';
import { speak, getSpokenText, getSpokenTextForLearn } from '../lib/speech.js';
import { loadProgress } from '../lib/storage.js';
import { getB1Progress } from '../lib/srs.js';

const THEME_INFO = {
  body: {
    label: 'Body & Anatomy',
    shortLabel: 'Body',
    icon: '🫀',
    description: 'Essential body parts for clinical assessment and pain localization',
  },
  symptoms: {
    label: 'Symptoms & Vitals',
    shortLabel: 'Symptoms',
    icon: '🌡️',
    description: 'Common patient complaints, vitals, and acute symptoms',
  },
  patient_care: {
    label: 'Patient Care & Ward',
    shortLabel: 'Patient Care',
    icon: '🩺',
    description: 'Ward routines, medication administration, and hygiene procedures',
  },
  hospital_places: {
    label: 'Hospital Places',
    shortLabel: 'Places',
    icon: '🏥',
    description: 'Key locations in the hospital that nurses navigate daily',
  },
  sentences: {
    label: 'Clinical Sentences',
    shortLabel: 'Sentences',
    icon: '💬',
    description: 'High-frequency phrases for daily nurse-patient interactions',
  },
  b1_stretch: {
    label: 'Stretch Goals (B1)',
    shortLabel: 'B1 Stretch',
    icon: '🚀',
    description: 'Advanced vocabulary for confident ward communication',
  },
};

const THEME_ORDER = ['body', 'symptoms', 'patient_care', 'hospital_places', 'sentences', 'b1_stretch'];

// Winding sinusoidal horizontal offset pattern (px offset from center)
const S_CURVE_OFFSETS = [0, 36, 68, 36, 0, -36, -68, -36];

export default function Learn({
  onStartPractice,
  onPracticeTheme,
  onPracticeWord,
  onBack,
  audioAvailable = true,
}) {
  const [viewMode, setViewMode] = useState('path'); // 'path' or 'cards'
  const [selectedWord, setSelectedWord] = useState(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState(null);
  const [showAlphabet, setShowAlphabet] = useState(false);
  const [playingId, setPlayingId] = useState(null);

  const progress = loadProgress();
  const b1Info = getB1Progress(words, progress);

  // Group words by theme; B1-level words go into a virtual 'b1_stretch' theme
  const grouped = {};
  for (const word of words) {
    const effectiveTheme = word.level === 'B1' ? 'b1_stretch' : word.theme;
    if (!grouped[effectiveTheme]) grouped[effectiveTheme] = [];
    grouped[effectiveTheme].push(word);
  }

  // Calculate theme checkpoint stats
  function getThemeStats(theme) {
    const themeWords = grouped[theme] || [];
    if (themeWords.length === 0) return { avgBox: 0, level: 1, mastered: 0, total: 0 };
    
    let totalBoxes = 0;
    let masteredCount = 0;
    let learningCount = 0;
    let unseenCount = 0;

    for (const w of themeWords) {
      const p = progress[w.id];
      const box = p ? p.box : 0;
      totalBoxes += box;
      if (box >= 4) {
        masteredCount++;
      } else if (p && p.seen > 0) {
        learningCount++;
      } else {
        unseenCount++;
      }
    }

    const avgBox = totalBoxes / themeWords.length;
    // Level 1 = avg box 0-1, Level 2 = avg box 2-3, Level 3 = avg box 4-5
    const level = avgBox >= 4 ? 3 : avgBox >= 2 ? 2 : 1;

    return {
      avgBox: avgBox.toFixed(1),
      level,
      mastered: masteredCount,
      learning: learningCount,
      unseen: unseenCount,
      total: themeWords.length,
    };
  }

  function getNodeState(word) {
    const p = progress[word.id];
    if (p && p.box >= 4) return 'mastered';
    if (p && p.seen > 0) return 'available';
    return 'locked'; // 0 exposure, yet reachable
  }

  function handleWordNodeClick(word) {
    setSelectedWord(word);
  }

  function handleCheckpointClick(theme) {
    const stats = getThemeStats(theme);
    setSelectedCheckpoint({
      theme,
      info: THEME_INFO[theme],
      stats,
    });
  }

  function handleStartBurst(word) {
    if (onPracticeWord) {
      onPracticeWord(word);
    } else if (onStartPractice) {
      onStartPractice();
    }
  }

  function playAudio(id, textOrParts, rate = 0.8) {
    speak(textOrParts, {
      rate,
      onstart: () => setPlayingId(id),
      onend: () => setPlayingId(null),
    });
  }

  return (
    <div className="learn">
      {/* Learn Header Bar */}
      <div className="learn-header-nav">
        {onBack && (
          <button className="learn-back-btn" onClick={onBack} aria-label="Back to home">
            ← Home
          </button>
        )}
        <h2 className="learn-title">Learning Path</h2>
        <div className="learn-view-toggle">
          <button
            className={`toggle-tab-btn ${viewMode === 'path' ? 'active' : ''}`}
            onClick={() => setViewMode('path')}
            title="Winding Path View"
          >
            🗺️ Path
          </button>
          <button
            className={`toggle-tab-btn ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Card List View"
          >
            📋 Cards
          </button>
        </div>
      </div>

      {viewMode === 'path' ? (
        <div className="path-container">
          <p className="path-subtitle">
            Follow the winding nursing path. Tap any node to inspect or review.
          </p>

          {/* Letters & Sounds Collapsible Section */}
          <section className="path-theme-unit alphabet-unit">
            <div className="checkpoint-wrapper">
              <button
                className="checkpoint-node checkpoint-node--alphabet"
                onClick={() => setShowAlphabet((v) => !v)}
                aria-label="Letters & Sounds"
                aria-expanded={showAlphabet}
              >
                <span className="checkpoint-icon">🔤</span>
                <span className="checkpoint-level-label">{showAlphabet ? '▾' : '▸'}</span>
              </button>
              <div className="checkpoint-meta">
                <h3 className="checkpoint-title">Letters & Sounds</h3>
                <span className="checkpoint-sub">
                  {alphabet.length} letters · Pronunciation guide
                </span>
              </div>
            </div>

            {showAlphabet && (
              <div className="alphabet-grid">
                {alphabet.map((item) => (
                  <button
                    key={item.letter}
                    className={`alphabet-tile ${playingId === `alpha_${item.letter}` ? 'is-playing' : ''}`}
                    onClick={() => playAudio(`alpha_${item.letter}`, item.de, 0.8)}
                    title={`${item.letter}: ${item.de} (${item.en}) — ${item.note}`}
                  >
                    <span className="alpha-letter">{item.letter.split(' ')[0]}</span>
                    <span className="alpha-word">{item.de}</span>
                    <span className="alpha-hint">{item.note.split('.')[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {THEME_ORDER.map((theme, themeIdx) => {
            const themeWords = grouped[theme] || [];
            if (themeWords.length === 0) return null;
            const info = THEME_INFO[theme];
            const stats = getThemeStats(theme);
            const isB1 = theme === 'b1_stretch';
            const b1Locked = isB1 && !b1Info.unlocked;

            return (
              <section key={theme} className={`path-theme-unit ${b1Locked ? 'path-theme--locked' : ''}`}>
                {/* Theme Checkpoint Node */}
                <div className="checkpoint-wrapper">
                  <button
                    className="checkpoint-node"
                    onClick={() => handleCheckpointClick(theme)}
                    aria-label={`${info.label} Checkpoint - Level ${stats.level}`}
                  >
                    <div className="checkpoint-crown-badge">
                      {b1Locked ? '🔒' : '👑'.repeat(stats.level)}
                    </div>
                    <span className="checkpoint-icon">{info.icon}</span>
                    <span className="checkpoint-level-label">{b1Locked ? 'Locked' : `Lvl ${stats.level}`}</span>
                  </button>
                  <div className="checkpoint-meta">
                    <h3 className="checkpoint-title">{info.label}</h3>
                    <span className="checkpoint-sub">
                      {b1Locked
                        ? `Unlocks at ${b1Info.percentage}% / 60% A1 familiarity`
                        : `${stats.mastered}/${stats.total} Mastered`}
                    </span>
                  </div>
                </div>

                {/* Vertical Winding Path of Nodes */}
                <div className="path-track">
                  {themeWords.map((word, wordIdx) => {
                    const state = b1Locked ? 'locked' : getNodeState(word);
                    const globalIdx = themeIdx * 10 + wordIdx;
                    const offsetPx = S_CURVE_OFFSETS[globalIdx % S_CURVE_OFFSETS.length];
                    const p = progress[word.id];

                    return (
                      <div
                        key={word.id}
                        className="path-node-row"
                        style={{ transform: `translateX(${offsetPx}px)` }}
                      >
                        <button
                          className={`path-node path-node--${state} ${
                            state === 'available' ? 'anim-pulse-node' : ''
                          }`}
                          onClick={() => !b1Locked && handleWordNodeClick(word)}
                          aria-label={`${word.article ? word.article + ' ' : ''}${word.de}: ${state}`}
                          title={`${word.article ? word.article + ' ' : ''}${word.de} (${state})`}
                          disabled={b1Locked}
                        >
                          {state === 'mastered' ? (
                            <span className="node-icon node-check">✓</span>
                          ) : state === 'available' ? (
                            <span className="node-icon node-star">
                              {p ? `B${p.box}` : '★'}
                            </span>
                          ) : (
                            <span className="node-icon node-lock">🔒</span>
                          )}
                        </button>
                        <span className={`path-node-label ${b1Locked ? 'path-node-label--locked' : ''}`}>
                          {word.article ? (
                            <span className="node-article">{word.article} </span>
                          ) : null}
                          {word.de}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* Flat Card List View */
        <div className="cards-container">
          {THEME_ORDER.map((theme) => {
            const themeWords = grouped[theme] || [];
            if (themeWords.length === 0) return null;
            const isB1 = theme === 'b1_stretch';
            const b1Locked = isB1 && !b1Info.unlocked;

            return (
            <section key={theme} className={`theme-section ${b1Locked ? 'path-theme--locked' : ''}`}>
              <h3 className="theme-heading">
                {THEME_INFO[theme].label}
                {b1Locked && <span className="b1-lock-badge"> 🔒 {b1Info.percentage}% / 60%</span>}
              </h3>
              <div className="word-cards">
                {themeWords.map((word) => (
                  <div key={word.id} className="word-card">
                    <div className="word-card-top">
                      <span className={`word-card-de ${playingId === `word_${word.id}` ? 'highlight-text' : ''}`}>
                        {word.article ? (
                          <>
                            <span className="word-article">
                              {word.article}
                              {word.plural ? ' (Pl.)' : ''}
                            </span>{' '}
                            {word.de}
                          </>
                        ) : (
                          word.de
                        )}
                      </span>
                      <div className="audio-actions">
                        <button
                          className="speaker-btn slow-btn"
                          onClick={() => playAudio(`word_${word.id}`, getSpokenTextForLearn(word), 0.6)}
                          aria-label={`Listen slowly to ${getSpokenText(word)}`}
                          disabled={!audioAvailable}
                          title={audioAvailable ? 'Listen slowly' : 'Audio not available'}
                        >
                          🐢
                        </button>
                        <button
                          className="speaker-btn"
                          onClick={() => playAudio(`word_${word.id}`, getSpokenTextForLearn(word), 0.8)}
                          aria-label={`Listen to ${getSpokenText(word)}`}
                          disabled={!audioAvailable}
                          title={
                            audioAvailable
                              ? `Listen to ${getSpokenText(word)}`
                              : 'Audio not available on this device'
                          }
                        >
                          🔊
                        </button>
                      </div>
                    </div>
                    <p className="word-card-en">{word.en}</p>
                    {word.note && <p className="word-card-note">ℹ️ {word.note}</p>}
                    <p className="word-card-example">
                      <em className={playingId === `ex_${word.id}` ? 'highlight-text' : ''}>{word.example}</em>
                      {word.example && (
                        <span className="inline-audio-actions">
                          <button
                            className="speaker-btn feedback-speaker-btn slow-btn"
                            onClick={() => playAudio(`ex_${word.id}`, word.example, 0.6)}
                            aria-label={`Listen slowly to example: ${word.example}`}
                            disabled={!audioAvailable}
                            title="Listen slowly"
                          >
                            🐢
                          </button>
                          <button
                            className="speaker-btn feedback-speaker-btn"
                            onClick={() => playAudio(`ex_${word.id}`, word.example, 0.8)}
                            aria-label={`Listen to example: ${word.example}`}
                            disabled={!audioAvailable}
                            title={
                              audioAvailable
                                ? 'Listen to example sentence'
                                : 'Audio not available'
                            }
                          >
                            🔊
                          </button>
                        </span>
                      )}
                    </p>
                    <p className="word-card-example-en">{word.exampleEn}</p>
                  </div>
                ))}
              </div>
            </section>
            );
          })}
        </div>
      )}

      {/* Floating Bottom Practice CTA */}
      <div className="learn-cta-footer">
        <button className="btn primary-btn learn-start-btn" onClick={onStartPractice}>
          Start Practice →
        </button>
      </div>

      {/* Word Intro Card Modal */}
      {selectedWord && (
        <div className="learn-modal-backdrop" onClick={() => setSelectedWord(null)}>
          <div
            className="learn-intro-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              className="learn-modal-close"
              onClick={() => setSelectedWord(null)}
              aria-label="Close dialog"
            >
              ✕
            </button>

            <div className="intro-card-header">
              <span className="intro-box-badge">
                {progress[selectedWord.id]
                  ? progress[selectedWord.id].box >= 4
                    ? `🏆 Mastered (Box ${progress[selectedWord.id].box})`
                    : `📖 Learning (Box ${progress[selectedWord.id].box})`
                  : '🌱 New Word'}
              </span>
            </div>

            <div className="intro-card-top">
              <h3 className={`intro-de ${playingId === `intro_${selectedWord.id}` ? 'highlight-text' : ''}`}>
                {selectedWord.article ? (
                  <span className="intro-article">{selectedWord.article} </span>
                ) : null}
                {selectedWord.de}
                {selectedWord.plural && <span className="intro-plural"> (Pl.)</span>}
              </h3>
              <div className="audio-actions">
                <button
                  className="speaker-btn intro-speaker-btn slow-btn"
                  onClick={() => playAudio(`intro_${selectedWord.id}`, getSpokenTextForLearn(selectedWord), 0.6)}
                  disabled={!audioAvailable}
                  aria-label="Listen slowly"
                >
                  🐢
                </button>
                <button
                  className="speaker-btn intro-speaker-btn"
                  onClick={() => playAudio(`intro_${selectedWord.id}`, getSpokenTextForLearn(selectedWord), 0.8)}
                  disabled={!audioAvailable}
                  aria-label={`Listen to ${getSpokenText(selectedWord)}`}
                >
                  🔊
                </button>
              </div>
            </div>

            <p className="intro-en">{selectedWord.en}</p>

            {selectedWord.note && (
              <div className="intro-note">
                <span className="intro-note-icon">ℹ️</span>
                <p className="intro-note-text">{selectedWord.note}</p>
              </div>
            )}

            {selectedWord.example && (
              <div className="intro-example-box">
                <div className="intro-example-header">
                  <p className={`intro-example-de ${playingId === `intro_ex_${selectedWord.id}` ? 'highlight-text' : ''}`}>{selectedWord.example}</p>
                  <div className="audio-actions">
                    <button
                      className="speaker-btn feedback-speaker-btn slow-btn"
                      onClick={() => playAudio(`intro_ex_${selectedWord.id}`, selectedWord.example, 0.6)}
                      disabled={!audioAvailable}
                      aria-label="Listen slowly"
                    >
                      🐢
                    </button>
                    <button
                      className="speaker-btn feedback-speaker-btn"
                      onClick={() => playAudio(`intro_ex_${selectedWord.id}`, selectedWord.example, 0.8)}
                      disabled={!audioAvailable}
                      aria-label="Listen to example sentence"
                    >
                      🔊
                    </button>
                  </div>
                </div>
                <p className="intro-example-en">{selectedWord.exampleEn}</p>
              </div>
            )}

            {selectedWord.tip && (
              <p className="intro-tip">
                💡 <em>{selectedWord.tip}</em>
              </p>
            )}

            <div className="intro-modal-actions">
              <button
                className="btn primary-btn"
                onClick={() => {
                  const w = selectedWord;
                  setSelectedWord(null);
                  handleStartBurst(w);
                }}
              >
                Practice This Word 🚀
              </button>
              <button
                className="btn secondary-btn"
                onClick={() => setSelectedWord(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkpoint Summary Modal */}
      {selectedCheckpoint && (
        <div className="learn-modal-backdrop" onClick={() => setSelectedCheckpoint(null)}>
          <div
            className="learn-checkpoint-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              className="learn-modal-close"
              onClick={() => setSelectedCheckpoint(null)}
              aria-label="Close dialog"
            >
              ✕
            </button>

            <div className="checkpoint-modal-icon">
              {selectedCheckpoint.info.icon}
            </div>

            <h3 className="checkpoint-modal-title">
              {selectedCheckpoint.info.label}
            </h3>

            <div className="checkpoint-level-stars">
              {'👑'.repeat(selectedCheckpoint.stats.level)} Checkpoint Level {selectedCheckpoint.stats.level}
            </div>

            <p className="checkpoint-modal-desc">
              {selectedCheckpoint.info.description}
            </p>

            <div className="checkpoint-stats-grid">
              <div className="checkpoint-stat-card">
                <span className="stat-num">{selectedCheckpoint.stats.mastered}</span>
                <span className="stat-lbl">Mastered</span>
              </div>
              <div className="checkpoint-stat-card">
                <span className="stat-num">{selectedCheckpoint.stats.learning}</span>
                <span className="stat-lbl">In Progress</span>
              </div>
              <div className="checkpoint-stat-card">
                <span className="stat-num">{selectedCheckpoint.stats.unseen}</span>
                <span className="stat-lbl">New Words</span>
              </div>
              <div className="checkpoint-stat-card">
                <span className="stat-num">{selectedCheckpoint.stats.avgBox}</span>
                <span className="stat-lbl">Avg Leitner Box</span>
              </div>
            </div>

            <div className="checkpoint-modal-actions">
              <button
                className="btn primary-btn"
                onClick={() => {
                  const theme = selectedCheckpoint.theme;
                  setSelectedCheckpoint(null);
                  if (onPracticeTheme) {
                    onPracticeTheme(theme);
                  } else if (onStartPractice) {
                    onStartPractice();
                  }
                }}
              >
                Practice {selectedCheckpoint.info.shortLabel} 🎯
              </button>
              <button
                className="btn secondary-btn"
                onClick={() => setSelectedCheckpoint(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
