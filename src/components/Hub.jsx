import {
  loadXP,
  calculateLevel,
  loadStreak,
  loadSessionsCompleted,
  loadProfile,
  loadProgress,
  getLevelCompletion,
  loadTestScores,
} from '../lib/storage.js';
import { LEVELS, getCurrentLevel, getLevelProgress } from '../lib/levels.js';

/**
 * Hub screen: four glass cards (Profile, Daily, Current Level, Test).
 * Shows live badges: due count, stars earned today, level completion, last score.
 */
export default function Hub({ onOpenTab, dailyDoneToday }) {
  const xp = loadXP();
  const levelInfo = calculateLevel(xp);
  const { streak } = loadStreak();
  const sessions = loadSessionsCompleted();
  const progress = loadProgress();
  const completion = getLevelCompletion();
  const current = getCurrentLevel(progress, completion);
  const currentDone = getLevelProgress(current, completion);

  // Words due right now (badge on the Daily card)
  const dueCount = Object.values(progress).filter(
    (p) => p && p.due <= Date.now()
  ).length;

  const testScores = loadTestScores();
  const lastScore = testScores.length > 0 ? testScores[0] : null;

  const CARD_META = {
    profile: { num: '1', title: 'Profile', sub: 'Your progress at a glance' },
    daily: { num: '2', title: 'Daily Challenge', sub: dailyDoneToday ? 'Done today — replay anytime' : 'A quick 5-word check-in' },
    level: {
      num: '3',
      title: 'Current Level',
      sub: current.comingSoon
        ? 'Coming soon'
        : `${current.title} · ${currentDone.done}/${currentDone.total}`,
    },
    test: {
      num: '4',
      title: 'Take a Test',
      sub: lastScore ? `Last: ${lastScore.score}/${lastScore.total}` : 'Timed, cumulative check',
    },
  };

  return (
    <div className="hub">
      <div className="hub-greeting">
        <h2 className="hub-hello">
          {loadProfile().displayName ? `Hi, ${loadProfile().displayName}` : 'Your practice hub'}
        </h2>
        <p className="hub-subtext">
          {streak} day streak · Lvl {levelInfo.level} · {sessions} session{sessions !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="hub-cards">
        <button
          type="button"
          className="hub-card glass-card hub-card--profile"
          onClick={() => onOpenTab('profile')}
        >
          <span className="hub-card-num">{CARD_META.profile.num}</span>
          <span className="hub-card-title">{CARD_META.profile.title}</span>
          <span className="hub-card-sub">{CARD_META.profile.sub}</span>
          <span className="hub-card-foot">{xp} XP · {streak} day streak</span>
        </button>

        <button
          type="button"
          className={`hub-card glass-card hub-card--daily ${dailyDoneToday ? 'is-done' : ''}`}
          onClick={() => onOpenTab('daily')}
        >
          <span className="hub-card-num">{CARD_META.daily.num}</span>
          <span className="hub-card-title">{CARD_META.daily.title}</span>
          <span className="hub-card-sub">{CARD_META.daily.sub}</span>
          <span className="hub-card-foot">
            {dueCount > 0 ? `${dueCount} word${dueCount !== 1 ? 's' : ''} due today` : 'Nothing due — recent words'}
          </span>
        </button>

        <button
          type="button"
          className="hub-card glass-card hub-card--level"
          onClick={() => onOpenTab('level')}
        >
          <span className="hub-card-num">{CARD_META.level.num}</span>
          <span className="hub-card-title">{CARD_META.level.title}</span>
          <span className="hub-card-sub">{CARD_META.level.sub}</span>
          <span className="hub-card-foot">{levelInfo.title}</span>
        </button>

        <button
          type="button"
          className="hub-card glass-card hub-card--test"
          onClick={() => onOpenTab('test')}
        >
          <span className="hub-card-num">{CARD_META.test.num}</span>
          <span className="hub-card-title">{CARD_META.test.title}</span>
          <span className="hub-card-sub">{CARD_META.test.sub}</span>
          <span className="hub-card-foot">10 questions · timed</span>
        </button>
      </div>

      <p className="hub-footnote">
        {LEVELS.filter((l) => !l.comingSoon).length} levels · stretch levels coming soon
      </p>
    </div>
  );
}
