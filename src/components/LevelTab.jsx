import words from '../data/words.json';
import { loadProgress, getLevelCompletion } from '../lib/storage.js';
import { LEVELS, getLevelWords, getLevelProgress, isLevelUnlocked } from '../lib/levels.js';
import { buildSession } from '../lib/session.js';

/**
 * Tab 3 — Current Level.
 * Shows every level with X/10 completion (from the dedicated level-completion
 * store, never SRS boxes) and starts full practice sessions (exercise +
 * explanation + re-queue) for the tapped level. Stretch levels are stubs.
 */
export default function LevelTab({ currentLevelId, onStartLevel, onOpenLevelBrowser }) {
  const progress = loadProgress();
  const completion = getLevelCompletion();
  const currentLevel = LEVELS.find((l) => l.id === currentLevelId) || LEVELS[0];
  const b1LockedExists = LEVELS.some((l) => l.b1Gated && !isLevelUnlocked(l, progress, completion));

  return (
    <div className="tab-page level-tab">
      <header className="tab-head">
        <h2 className="tab-title">Current Level</h2>
        <p className="tab-subtitle">Your path through Medical German.</p>
      </header>

      {LEVELS.map((level, idx) => {
        const lvlWords = getLevelWords(level);
        const { done, total, allDone } = getLevelProgress(level, completion);
        const unlocked = isLevelUnlocked(level, progress, completion);
        const isCurrent = level.id === currentLevel.id;
        const isStretch = Boolean(level.comingSoon);

        // Previous playable level (for the lock message + B1 gate check)
        let prevNum = null;
        let prevLevel = null;
        for (let i = idx - 1; i >= 0; i--) {
          if (!LEVELS[i].comingSoon) {
            prevLevel = LEVELS[i];
            prevNum = i + 1;
            break;
          }
        }
        const prevDone = prevLevel ? getLevelProgress(prevLevel, completion).allDone : true;

        if (isStretch) {
          return (
            <section key={level.id} className="level-card glass-card level-card--stretch">
              <div className="level-card-head">
                <span className="level-index">{idx + 1}</span>
                <div className="level-card-titles">
                  <h3 className="level-title">{level.title}</h3>
                  <span className="level-subtitle">{level.subtitle}</span>
                </div>
                <span className="level-soon-badge">Coming soon</span>
              </div>
              {isCurrent && <p className="level-current-note">Planned after the content levels.</p>}
              <p className="level-planned">{level.plannedContent}</p>
            </section>
          );
        }

        return (
          <section
            key={level.id}
            className={`level-card glass-card ${isCurrent ? 'is-current' : ''} ${unlocked ? '' : 'is-locked'}`}
          >
            <div className="level-card-head">
              <span className="level-index">{idx + 1}</span>
              <div className="level-card-titles">
                <h3 className="level-title">
                  Level {idx + 1} · {level.title}
                  {isCurrent && <span className="level-current-badge">Current</span>}
                </h3>
                <span className="level-subtitle">
                  {allDone ? 'Complete · replay anytime' : `${done}/${total} complete`}
                </span>
              </div>
              <span className={`level-progress-chip ${allDone ? 'is-done' : ''}`}>
                {allDone ? '✓' : `${Math.round((done / Math.max(1, total)) * 100)}%`}
              </span>
            </div>

            <div
              className="level-bar-track"
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin="0"
              aria-valuemax={total}
              aria-label={`${done} of ${total} complete`}
            >
              <div className="level-bar-fill" style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
            </div>

            {!unlocked ? (
              <div className="level-locked">
                <span className="level-lock-icon" aria-hidden="true">🔒</span>
                <p className="level-lock-note">
                  {level.b1Gated && prevDone
                    ? 'Unlocks at 60% A1 familiarity — keep practising.'
                    : `Complete Level ${prevNum} first`}
                </p>
              </div>
            ) : (
              <>
                <div className="level-word-dots">
                  {lvlWords.map((w) => {
                    const doneList = completion[level.id] || [];
                    const isDone = doneList.includes(w.id);
                    const label = w.article ? `${w.article} ${w.de}` : w.de;
                    return (
                      <span key={w.id} className={`level-dot ${isDone ? 'is-done' : ''}`} title={label}>
                        {isDone ? '✓' : '·'}
                      </span>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn primary-btn level-start-btn"
                  onClick={() => onStartLevel(level, lvlWords)}
                >
                  {allDone ? 'Practise this level again' : `Practise Level ${idx + 1} →`}
                </button>
                {isCurrent && onOpenLevelBrowser && (
                  <button type="button" className="btn secondary-btn level-start-btn" onClick={onOpenLevelBrowser}>
                    Browse these words
                  </button>
                )}
              </>
            )}
          </section>
        );
      })}

      {b1LockedExists && (
        <p className="level-footnote">
          B1 sentence levels open automatically once 60% of A1 words are Familiar or above.
        </p>
      )}
      <p className="level-footnote">
        Level completion counts each word you have answered correctly once — it is separate from
        your spaced-repetition mastery.
      </p>
    </div>
  );
}
