import { useState } from 'react';
import {
  loadXP,
  calculateLevel,
  loadStreak,
  loadSessionsCompleted,
  loadProfile,
  loadTestScores,
  loadDailyStars,
  loadProgress,
  setDisplayName,
  loadDailyXP,
} from '../lib/storage.js';

/**
 * Tab 1 — Profile & Analytics (read-only stats + optional display name).
 * Shows total XP, level, streak, sessions completed, overall correct/incorrect
 * ratio and recent test scores. The display name appears in the header centre.
 */
export default function ProfileTab({ onNameSaved }) {
  const [, setTick] = useState(0);
  const [nameInput, setNameInput] = useState('');
  const [editing, setEditing] = useState(() => !loadProfile().displayName);
  const [nameMsg, setNameMsg] = useState(null);

  const xp = loadXP();
  const levelInfo = calculateLevel(xp);
  const { streak } = loadStreak();
  const sessions = loadSessionsCompleted();
  const profile = loadProfile();
  const testScores = loadTestScores();
  const dailyStars = loadDailyStars();

  // Overall correct/incorrect ratio from per-word SRS data
  const progress = loadProgress();
  let seen = 0;
  let wrong = 0;
  for (const p of Object.values(progress)) {
    if (!p) continue;
    seen += p.seen || 0;
    wrong += p.wrong || 0;
  }
  const correct = Math.max(0, seen - wrong);
  const correctPct = seen > 0 ? Math.round((correct / seen) * 100) : null;

  // Keep the "today" daily chip honest across midnight while the tab is open
  const daily = loadDailyXP();

  function handleSaveName(e) {
    e.preventDefault();
    const saved = setDisplayName(nameInput);
    if (saved) {
      setEditing(false);
      setNameMsg(null);
      setTick((t) => t + 1);
      if (onNameSaved) onNameSaved(saved);
    } else {
      setNameMsg('Please enter at least one character.');
    }
  }

  return (
    <div className="tab-page profile-tab">
      <header className="tab-head">
        <h2 className="tab-title">Profile &amp; Analytics</h2>
        <p className="tab-subtitle">Everything you have built so far.</p>
      </header>

      <div className="stat-grid">
        <div className="stat-tile glass-card">
          <span className="stat-value">{xp}</span>
          <span className="stat-label">Total XP</span>
        </div>
        <div className="stat-tile glass-card">
          <span className="stat-value">Lvl {levelInfo.level}</span>
          <span className="stat-label">{levelInfo.title}</span>
        </div>
        <div className="stat-tile glass-card">
          <span className="stat-value">{streak}</span>
          <span className="stat-label">Day streak</span>
        </div>
        <div className="stat-tile glass-card">
          <span className="stat-value">{sessions}</span>
          <span className="stat-label">Sessions completed</span>
        </div>
      </div>

      <div className="glass-card ratio-card">
        <h3 className="glass-card-title">Overall accuracy</h3>
        {seen > 0 ? (
          <>
            <div className="ratio-track" role="img" aria-label={`${correctPct}% correct of ${seen} answers`}>
              <div className="ratio-fill" style={{ width: `${correctPct}%` }} />
            </div>
            <p className="ratio-text">
              <strong>{correctPct}%</strong> · {correct} correct / {wrong} incorrect of {seen} answers
            </p>
          </>
        ) : (
          <p className="ratio-text">Answer your first exercise to see accuracy here.</p>
        )}
      </div>

      <div className="glass-card">
        <h3 className="glass-card-title">Recent test scores</h3>
        {testScores.length === 0 ? (
          <p className="empty-line">No tests taken yet — try one from Take a Test.</p>
        ) : (
          <ul className="score-list">
            {testScores.slice(0, 8).map((s, i) => {
              const pct = Math.round((s.score / s.total) * 100);
              return (
                <li key={`${s.date}-${i}`} className="score-item">
                  <span className="score-date">{s.date}</span>
                  <span className="score-bar-track">
                    <span className="score-bar-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="score-frac">
                    {s.score}/{s.total}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="glass-card">
        <h3 className="glass-card-title">Daily challenge stars</h3>
        {dailyStars.length === 0 ? (
          <p className="empty-line">No daily challenges done yet.</p>
        ) : (
          <ul className="stars-list">
            {dailyStars.slice(0, 8).map((d, i) => (
              <li key={`${d.date}-${i}`} className="stars-item">
                <span className="score-date">{d.date}</span>
                <span className="stars-value">
                  {'★'.repeat(d.stars)}
                  {'☆'.repeat(3 - d.stars)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="glass-card name-card">
        <h3 className="glass-card-title">Display name</h3>
        {editing ? (
          <form onSubmit={handleSaveName} className="name-form">
            <input
              type="text"
              className="typing-input name-input"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={profile.displayName || 'e.g. Priya'}
              maxLength={30}
              autoFocus
            />
            <button type="submit" className="btn primary-btn">
              Save
            </button>
            {profile.displayName && (
              <button
                type="button"
                className="btn secondary-btn"
                onClick={() => {
                  setEditing(false);
                  setNameMsg(null);
                }}
              >
                Cancel
              </button>
            )}
            {nameMsg && <p className="name-msg">{nameMsg}</p>}
          </form>
        ) : (
          <div className="name-row">
            <span className="name-current">{profile.displayName}</span>
            <button type="button" className="btn secondary-btn" onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
