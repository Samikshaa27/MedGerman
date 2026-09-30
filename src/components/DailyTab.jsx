import { loadDailyStars } from '../lib/storage.js';

/**
 * Tab 2 — Daily Challenges: intro screen + star history.
 * The quiz renders through Practice (variant="quiz": no explanations, no
 * re-queue, no intros); completion is shown by the shared Summary screen.
 */
export default function DailyTab({
  challenge,
  onStart,
  dailyDoneToday,
  onBack,
}) {
  if (challenge) {
    return (
      <div className="tab-page daily-tab">
        <header className="tab-head">
          <h2 className="tab-title">Daily Challenge</h2>
          <p className="tab-subtitle">
            {challenge.length} quick question{challenge.length !== 1 ? 's' : ''} · no explanations,
            just your score.
          </p>
        </header>
        <div className="glass-card daily-start-card">
          <p className="daily-start-text">
            {dailyDoneToday
              ? 'You already earned stars today — this replay will not overwrite them.'
              : 'Five words, one tap each. Stars are logged for today.'}
          </p>
          <button type="button" className="btn primary-btn" onClick={onStart}>
            Start the challenge →
          </button>
          <button type="button" className="btn secondary-btn" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const history = loadDailyStars();
  const todayStars = getTodayStars(history);

  return (
    <div className="tab-page daily-tab">
      <header className="tab-head">
        <h2 className="tab-title">Daily Challenge</h2>
        <p className="tab-subtitle">A short daily check-in, built from your reviews.</p>
      </header>

      {todayStars !== null && (
        <div className="glass-card daily-today-card">
          <p className="daily-today-label">Today</p>
          <p className="daily-stars">
            {'★'.repeat(todayStars)}
            <span className="stars-empty">{'☆'.repeat(3 - todayStars)}</span>
          </p>
        </div>
      )}

      <div className="glass-card daily-start-card">
        {challenge ? (
          <p className="daily-start-text">
            Nothing is due right now — today’s set comes from your most recent session.
          </p>
        ) : (
          <p className="daily-start-text">
            Build a set from your due reviews (or recent words) and earn up to 3 stars.
          </p>
        )}
        <button
          type="button"
          className="btn primary-btn"
          onClick={onStart}
          disabled={!challenge || challenge.length === 0}
        >
          {challenge && challenge.length > 0 ? 'Start today’s challenge →' : 'Nothing available yet'}
        </button>
      </div>

      {history.length > 0 && (
        <div className="glass-card">
          <h3 className="glass-card-title">Past challenges</h3>
          <ul className="stars-list">
            {history.slice(0, 7).map((d, i) => (
              <li key={`${d.date}-${i}`} className="stars-item">
                <span className="score-date">{d.date}</span>
                <span className="stars-value">
                  {'★'.repeat(d.stars)}
                  <span className="stars-empty">{'☆'.repeat(3 - d.stars)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Stars logged for today, or null. */
function getTodayStars(history) {
  const key = new Date();
  const mm = String(key.getMonth() + 1).padStart(2, '0');
  const dd = String(key.getDate()).padStart(2, '0');
  const today = `${key.getFullYear()}-${mm}-${dd}`;
  const entry = history.find((e) => e.date === today);
  return entry ? entry.stars : null;
}
