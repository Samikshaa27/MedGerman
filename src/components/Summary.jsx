import { useState, useEffect, useRef } from 'react';
import { speak, getSpokenText } from '../lib/speech.js';
import { loadProgress, addXP, loadXP, calculateLevel } from '../lib/storage.js';
import { computeMilestone, getSummaryNextReview } from '../lib/milestone.js';
import words from '../data/words.json';

const EMOJIS = ['🎉', '🌟', '✨', '🏆', '💪', '🔥', '⭐', '🎊', '💯', '🩺'];

/**
 * Summary screen: shown after a practice session.
 * Props:
 *   results       – { correct, total, missed: [word, …] }
 *   onPracticeAgain – callback to start another practice session
 *   onHome         – callback to go back to home
 */
export default function Summary({ results, onPracticeAgain, onHome, audioAvailable = true }) {
  const { correct, total, missed } = results;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const progress = loadProgress();
  const nextReviewText = getSummaryNextReview(progress, words);
  const milestoneText = computeMilestone(progress, words);

  // Award session completion XP once
  const xpAwarded = useRef(false);
  const [sessionXP, setSessionXP] = useState(0);
  useEffect(() => {
    if (!xpAwarded.current) {
      xpAwarded.current = true;
      const stats = addXP(5);
      setSessionXP(5);
    }
  }, []);

  const xpTotal = loadXP();
  const levelInfo = calculateLevel(xpTotal);

  // Confetti / emoji burst
  const [particles, setParticles] = useState([]);
  useEffect(() => {
    const count = pct === 100 ? 24 : pct >= 80 ? 16 : pct >= 50 ? 10 : 5;
    const newParticles = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: i,
        emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 1.2 + Math.random() * 0.8,
        size: 1 + Math.random() * 0.6,
      });
    }
    setParticles(newParticles);
  }, [pct]);

  return (
    <div className="summary">
      {/* Celebration particles */}
      <div className="celebration-container" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="celebration-particle"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              fontSize: `${p.size}rem`,
            }}
          >
            {p.emoji}
          </span>
        ))}
      </div>

      {/* Milestone callout — prominent, above the score */}
      <div className="milestone-callout" data-testid="milestone-line">
        <span className="milestone-icon">🎯</span>
        <span className="milestone-text">{milestoneText}</span>
      </div>

      <h2 className="summary-title">
        {pct === 100 ? '🏆 Perfect!' : pct >= 80 ? '🌟 Great job!' : pct >= 50 ? '💪 Nice effort!' : '🩺 Keep going!'}
      </h2>

      <div className="summary-score">
        <span className="summary-pct">{pct}%</span>
        <span className="summary-detail">
          {correct} / {total} correct
        </span>
      </div>

      {/* Session XP summary */}
      <div className="summary-xp-card">
        <div className="summary-xp-row">
          <span>⭐ Session bonus</span>
          <span className="summary-xp-val">+{sessionXP} XP</span>
        </div>
        <div className="summary-xp-row summary-xp-total">
          <span>Total XP</span>
          <span className="summary-xp-val">{xpTotal}</span>
        </div>
        <div className="summary-xp-row summary-xp-level">
          <span>Level {levelInfo.level}</span>
          <span className="summary-xp-val">{levelInfo.title}</span>
        </div>
      </div>

      <div className="summary-next-review">
        <p className="summary-next-text">{nextReviewText}</p>
      </div>

      {missed.length > 0 && (
        <div className="summary-missed">
          <h3 className="summary-missed-title">Words to review</h3>
          <ul className="missed-list">
            {missed.map((word) => (
              <li key={word.id} className="missed-item">
                <div className="missed-word">
                  <span>
                    {word.article
                      ? `${word.article}${word.plural ? ' (Pl.)' : ''} ${word.de}`
                      : word.de}
                  </span>
                  <button
                    className="speaker-btn"
                    onClick={() => speak(getSpokenText(word))}
                    aria-label={`Listen to ${getSpokenText(word)}`}
                    disabled={!audioAvailable}
                    title={audioAvailable ? `Listen to ${getSpokenText(word)}` : 'Audio not available on this device'}
                  >
                    🔊
                  </button>
                </div>
                <span className="missed-en">{word.en}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missed.length === 0 && (
        <p className="summary-perfect">🎉 Perfect session — no mistakes!</p>
      )}

      <div className="summary-actions">
        <button className="btn primary-btn" onClick={onPracticeAgain}>
          Practise Again
        </button>
        <button className="btn secondary-btn" onClick={onHome}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
