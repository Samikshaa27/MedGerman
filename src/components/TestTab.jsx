import { loadProfile, loadTestScores } from '../lib/storage.js';
import { getTestTiming } from '../lib/levels.js';
import { buildTestSession } from '../lib/quiz.js';

/**
 * Tab 4 — Take a Test.
 * Intro screen with timing info; the timed quiz itself renders through
 * Practice (variant="quiz") with a total countdown supplied by the shell.
 */
export default function TestTab({ levelNumber, onStart, onBack }) {
  const timing = getTestTiming(levelNumber);
  const profile = loadProfile();
  const testScores = loadTestScores();
  const lastScore = testScores.length > 0 ? testScores[0] : null;

  const mins = Math.round(timing.seconds / 60);
  const mmss = `${Math.floor(timing.seconds / 60)}:${String(timing.seconds % 60).padStart(2, '0')}`;

  return (
    <div className="tab-page test-tab">
      <header className="tab-head">
        <h2 className="tab-title">Take a Test</h2>
        <p className="tab-subtitle">A timed check across everything unlocked so far.</p>
      </header>

      <div className="glass-card test-info-card">
        <div className="test-info-row">
          <span className="test-info-label">Questions</span>
          <span className="test-info-value">{timing.questionCount}</span>
        </div>
        <div className="test-info-row">
          <span className="test-info-label">Time</span>
          <span className="test-info-value">
            {mmss} ({timing.mode === 'total' ? 'total' : 'per question'})
          </span>
        </div>
        <div className="test-info-row">
          <span className="test-info-label">Coverage</span>
          <span className="test-info-value">All unlocked words — not level-scoped</span>
        </div>
        {lastScore && (
          <div className="test-info-row">
            <span className="test-info-label">Last attempt</span>
            <span className="test-info-value">
              {lastScore.score}/{lastScore.total} on {lastScore.date}
            </span>
          </div>
        )}
      </div>

      {profile.displayName && (
        <p className="test-personal-note">
          Good luck, {profile.displayName} — the clock starts with the first question.
        </p>
      )}

      <button
        type="button"
        className="btn primary-btn test-start-btn"
        onClick={onStart}
      >
        Start test →
      </button>

      <button type="button" className="btn secondary-btn test-start-btn" onClick={onBack}>
        Back to hub
      </button>

      <p className="test-footnote">
        More time at lower levels, less at higher ones ({mins} min at your level). The clock keeps
        running through feedback screens.
      </p>
    </div>
  );
}
