import { useState, useEffect, useRef } from 'react';
import { speak, getSpokenText } from '../lib/speech.js';
import { loadProgress, addXP, loadXP, calculateLevel } from '../lib/storage.js';
import { computeMilestone, getSummaryNextReview } from '../lib/milestone.js';
import { starsFor } from '../lib/quiz.js';
import words from '../data/words.json';

const PARTICLE_COLORS = ['#F2B537', '#29A9E1', '#2FAE60', '#16406E'];

/**
 * Summary screen: shown after a practice session.
 * Props:
 *   results       – { correct, total, missed: [word, …] }
 *   onPracticeAgain – callback to start another (fresh) practice session
 *   onRedoSession   – callback to replay the exact same session
 *   redoUnavailable – true when the same session cannot be replayed
 *   onHome        – callback to go back to home
 */
export default function Summary({
  results,
  onPracticeAgain,
  onRedoSession,
  redoUnavailable = false,
  onHome,
  onBackToHub,
  audioAvailable = true,
  variant = 'practice', // 'practice' | 'daily' | 'test'
}) {
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

  // Celebration dots (plain colored circles, no emoji)
  const [particles, setParticles] = useState([]);
  useEffect(() => {
    const count = pct === 100 ? 24 : pct >= 80 ? 16 : pct >= 50 ? 10 : 5;
    const newParticles = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: i,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 1.2 + Math.random() * 0.8,
        size: 6 + Math.random() * 8,
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
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: p.color,
            }}
          />
        ))}
      </div>

      {/* Milestone callout — prominent, above the score */}
      <div className="milestone-callout" data-testid="milestone-line">
        <span className="milestone-text">{milestoneText}</span>
      </div>

      <h2 className="summary-title">
        {pct === 100 ? 'Perfect!' : pct >= 80 ? 'Great job!' : pct >= 50 ? 'Nice effort!' : 'Keep going!'}
      </h2>

      <div className="summary-score">
        <span className="summary-pct">{pct}%</span>
        <span className="summary-detail">
          {correct} / {total} correct
        </span>
      </div>

      {variant === 'daily' && (
        <p className="daily-stars" aria-label={`${starsFor(correct, total)} of 3 stars`}>
          {'★'.repeat(starsFor(correct, total))}
          <span className="stars-empty">{'☆'.repeat(3 - starsFor(correct, total))}</span>
        </p>
      )}

      {/* Session XP summary */}
      <div className="summary-xp-card">
        <div className="summary-xp-row">
          <span>Session bonus</span>
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
                    type="button"
                    className="listen-text-btn"
                    onClick={() => speak(getSpokenText(word))}
                    aria-label={`Listen to ${getSpokenText(word)}`}
                    disabled={!audioAvailable}
                    title={audioAvailable ? `Listen to ${getSpokenText(word)}` : 'Audio not available on this device'}
                  >
                    Listen
                  </button>
                </div>
                <span className="missed-en">{word.en}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missed.length === 0 && (
        <p className="summary-perfect">Perfect session — no mistakes!</p>
      )}

      {variant === 'daily' && (
        <p className="summary-variant-note">
          Daily challenge logged — your stars are saved for today.
        </p>
      )}
      {variant === 'test' && (
        <p className="summary-variant-note">
          Test complete — your score was added to your history.
        </p>
      )}

      <div className="summary-actions">
        {variant === 'practice' && (
          <button className="btn primary-btn" onClick={onPracticeAgain}>
            Practise Again
          </button>
        )}
        {variant === 'practice' && (
          <button className="btn secondary-btn" onClick={onRedoSession} disabled={redoUnavailable}>
            Redo This Session
          </button>
        )}
        {variant !== 'practice' && onBackToHub && (
          <button className="btn primary-btn" onClick={onBackToHub}>
            Back to Hub
          </button>
        )}
        <button className="btn secondary-btn" onClick={onHome}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
