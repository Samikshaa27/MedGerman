import { useState } from 'react';
import words from '../data/words.json';
import { isDue, isDevMode, computeStages } from '../lib/srs.js';
import { loadProgress, loadStreak, loadXP, calculateLevel, resetProgress } from '../lib/storage.js';

/**
 * Home dashboard.
 * Props:
 *   onLearn    – navigate to Learn screen
 *   onPractice – start a "practice" session
 *   onReview   – start a "review" session
 */
export default function Home({ onLearn, onPractice, onReview }) {
  const [, setTick] = useState(0);
  const progress = loadProgress();
  const { streak, lastDate } = loadStreak();
  const xp = loadXP();
  const levelInfo = calculateLevel(xp);
  const dev = isDevMode();

  // Compute beginner-friendly mastery stages
  const stages = computeStages(words, progress);
  const totalWords = Math.max(1, words.length);
  const masteredPct = (stages.masteredCount / totalWords) * 100;
  const familiarPct = (stages.familiarCount / totalWords) * 100;
  const learningPct = (stages.learningCount / totalWords) * 100;
  const newPct = (stages.newCount / totalWords) * 100;

  function handleReset() {
    resetProgress();
    setTick((t) => t + 1);
  }

  // Calculate streak warning
  const today = new Date().toDateString();
  const hasPracticedToday = lastDate === today;
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const hoursLeft = Math.max(1, Math.round((midnight.getTime() - now.getTime()) / (1000 * 60 * 60)));
  const showStreakWarning = streak > 0 && !hasPracticedToday && hoursLeft <= 12;

  // Categorise words
  const dueWords = [];
  const weakest = [];
  let nextDueTime = null;

  for (const word of words) {
    const p = progress[word.id];
    if (!p) continue; // unseen words aren't in any box yet

    if (isDue(p)) {
      dueWords.push(word);
    } else {
      // Track the earliest upcoming due time
      if (nextDueTime === null || p.due < nextDueTime) {
        nextDueTime = p.due;
      }
    }

    if (p.wrong > 0) {
      weakest.push({ word, wrong: p.wrong, seen: p.seen });
    }
  }

  // Sort weakest by error ratio descending (wrong / seen), tie-breaker by wrong count
  weakest.sort((a, b) => {
    const ratioA = a.wrong / a.seen;
    const ratioB = b.wrong / b.seen;
    if (ratioB !== ratioA) return ratioB - ratioA;
    return b.wrong - a.wrong;
  });
  const top5Weakest = weakest.slice(0, 5);

  // Count unseen words
  const seenCount = Object.keys(progress).length;
  const unseenCount = words.length - seenCount;

  // Format the next due time and batch count
  const nextDueLabel = formatNextDue(nextDueTime);
  let nextDueBatchCount = 0;
  if (nextDueTime !== null) {
    nextDueBatchCount = words.filter(
      (w) =>
        progress[w.id] &&
        !isDue(progress[w.id]) &&
        Math.abs(progress[w.id].due - nextDueTime) <= 60000
    ).length || 1;
  }

  return (
    <div className="home">
      {/* Top Learner Stats: Streak & Level */}
      <div className="home-stats-bar">
        <div className="home-streak">
          <span className="streak-fire">🔥</span>
          <span className="streak-count">{streak}</span>
          <span className="streak-label">day streak</span>
        </div>
        <div className="home-level-badge">
          <div className="level-badge-pill">
            <span className="level-star">⭐</span>
            <span className="level-num">Lvl {levelInfo.level}</span>
          </div>
          <span className="level-xp-text">{xp} XP</span>
        </div>
      </div>

      {/* Level XP Progress Bar */}
      <div className="level-progress-container">
        <div className="level-progress-bar">
          <div className="level-progress-fill" style={{ width: `${levelInfo.progressPct}%` }} />
        </div>
        <span className="level-subtext">{levelInfo.title} • {levelInfo.currentXPInLevel}/{levelInfo.levelThreshold} XP</span>
      </div>

      {/* Streak Expiry Warning Banner */}
      {showStreakWarning && (
        <div className="streak-warning-banner">
          <span className="streak-warning-icon">⏳</span>
          <p className="streak-warning-text">
            Your streak ends in {hoursLeft}h — practice now!
          </p>
        </div>
      )}

      {/* Day-0: Learner has never practised */}
      {seenCount === 0 ? (
        <div className="home-day0-card">
          <p className="day0-subtext">Start with 5 words. It takes about 3 minutes.</p>
          <button className="btn primary-btn day0-start-btn" onClick={onPractice}>
            Start Practice
          </button>
          <div className="home-actions" style={{ marginTop: '12px' }}>
            <button className="btn secondary-btn" onClick={onLearn}>
              Learn New Words <span className="badge">{unseenCount} new</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Due words / Next review card */}
          <div className="home-due-card">
            {dueWords.length > 0 ? (
              <>
                <p className="due-count">
                  <strong>{dueWords.length}</strong> word{dueWords.length !== 1 ? 's' : ''} due for review
                </p>
                <button className="btn primary-btn" onClick={onReview}>
                  Review Now
                </button>
              </>
            ) : (
              <>
                <p className="due-count">
                  Next review:{' '}
                  {nextDueTime !== null
                    ? `${nextDueBatchCount} word${nextDueBatchCount !== 1 ? 's' : ''} ${nextDueLabel}`
                    : 'Practise again to keep words fresh'}
                </p>
                <button className="btn primary-btn" onClick={onPractice}>
                  Practise Anyway
                </button>
              </>
            )}
          </div>

          {/* Actions for returning learners */}
          <div className="home-actions">
            <button className="btn secondary-btn" onClick={onLearn}>
              Learn New Words {unseenCount > 0 && <span className="badge">{unseenCount} new</span>}
            </button>
            {dueWords.length > 0 && (
              <button className="btn secondary-btn" onClick={onPractice}>
                Practise Anyway
              </button>
            )}
          </div>
        </>
      )}

      {/* Beginner-friendly Word Mastery Overview */}
      <div className="home-section mastery-section">
        <h3 className="mastery-headline">
          <span className="mastery-headline-count">{stages.masteredCount}</span> / {words.length} words mastered
        </h3>

        {/* Horizontal Stacked Bar */}
        <div
          className="mastery-bar-track"
          role="progressbar"
          aria-valuenow={stages.masteredCount}
          aria-valuemin="0"
          aria-valuemax={words.length}
          aria-label={`${stages.masteredCount} of ${words.length} words mastered`}
        >
          {stages.masteredCount > 0 && (
            <div
              className="mastery-segment segment-mastered"
              style={{ width: `${masteredPct}%` }}
              title={`Mastered: ${stages.masteredCount}`}
            />
          )}
          {stages.familiarCount > 0 && (
            <div
              className="mastery-segment segment-familiar"
              style={{ width: `${familiarPct}%` }}
              title={`Familiar: ${stages.familiarCount}`}
            />
          )}
          {stages.learningCount > 0 && (
            <div
              className="mastery-segment segment-learning"
              style={{ width: `${learningPct}%` }}
              title={`Learning: ${stages.learningCount}`}
            />
          )}
          {stages.newCount > 0 && (
            <div
              className="mastery-segment segment-new"
              style={{ width: `${newPct}%` }}
              title={`New: ${stages.newCount}`}
            />
          )}
        </div>

        {/* Small Legend Below */}
        <div className="mastery-legend">
          <span className="legend-item">
            <span className="legend-dot dot-mastered" aria-hidden="true" />
            <span className="legend-name">Mastered</span>
            <span className="legend-count">{stages.masteredCount}</span>
          </span>
          <span className="legend-sep" aria-hidden="true">·</span>
          <span className="legend-item">
            <span className="legend-dot dot-familiar" aria-hidden="true" />
            <span className="legend-name">Familiar</span>
            <span className="legend-count">{stages.familiarCount}</span>
          </span>
          <span className="legend-sep" aria-hidden="true">·</span>
          <span className="legend-item">
            <span className="legend-dot dot-learning" aria-hidden="true" />
            <span className="legend-name">Learning</span>
            <span className="legend-count">{stages.learningCount}</span>
          </span>
          <span className="legend-sep" aria-hidden="true">·</span>
          <span className="legend-item">
            <span className="legend-dot dot-new" aria-hidden="true" />
            <span className="legend-name">New</span>
            <span className="legend-count">{stages.newCount}</span>
          </span>
        </div>
      </div>

      {/* Weakest words */}
      {top5Weakest.length > 0 && (
        <div className="home-section">
          <h3 className="home-section-title">Words Needing Practice</h3>
          <ul className="weak-list">
            {top5Weakest.map(({ word, wrong, seen }) => (
              <li key={word.id} className="weak-item">
                <span className="weak-word">
                  {word.article ? `${word.article} ${word.de}` : word.de}
                </span>
                <span className="weak-stat">
                  {wrong} wrong / {seen} seen
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dev-only controls */}
      {dev && (
        <div className="home-dev-panel">
          <p className="dev-tag">⚡ DEV MODE: intervals in minutes [0, 1, 2, 3, 5, 8]</p>
          <button className="btn dev-reset-btn" onClick={handleReset}>
            Reset progress
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Formats a due timestamp into a human-readable relative time.
 */
function formatNextDue(timestamp) {
  if (!timestamp) return null;
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'now';

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `in ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours} hr${hours !== 1 ? 's' : ''}`;

  const days = Math.floor(hours / 24);
  return `in ${days} day${days !== 1 ? 's' : ''}`;
}
