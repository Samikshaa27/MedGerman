import { useState, useEffect, useRef } from 'react';
import Home from './components/Home.jsx';
import Learn from './components/Learn.jsx';
import Practice from './components/Practice.jsx';
import Summary from './components/Summary.jsx';
import Hub from './components/Hub.jsx';
import ProfileTab from './components/ProfileTab.jsx';
import DailyTab from './components/DailyTab.jsx';
import LevelTab from './components/LevelTab.jsx';
import TestTab from './components/TestTab.jsx';
import SideNav from './components/SideNav.jsx';
import LaunchOverlay, { shouldShowLaunch } from './components/LaunchOverlay.jsx';
import { buildSession, buildSingleExercise } from './lib/session.js';
import { buildDailyChallenge, buildTestSession, starsFor } from './lib/quiz.js';
import {
  loadProgress,
  updateStreak,
  loadXP,
  calculateLevel,
  loadProfile,
  loadDailyStars,
  getLevelCompletion,
  incrementSessionsCompleted,
  logDailyStars,
  logTestScore,
} from './lib/storage.js';
import { subscribeVoiceChange } from './lib/speech.js';
import { getCurrentLevel, getLevelWords, getTestTiming } from './lib/levels.js';
import words from './data/words.json';

const LAST_SESSION_KEY = 'medgerman-last-session-words';

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function rememberLastSessionWords(exercises) {
  try {
    const ids = [...new Set(exercises.filter((e) => e.word).map((e) => e.word.id))];
    sessionStorage.setItem(LAST_SESSION_KEY, JSON.stringify(ids));
  } catch {
    /* unavailable: daily fallback just stays empty */
  }
}

function loadLastSessionWords() {
  try {
    const raw = sessionStorage.getItem(LAST_SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Timed runner for quiz variants (Daily Challenge, Test).
 * Wraps Practice with a countdown; when time is up it flags `expired`
 * and Practice finishes immediately with what was answered so far.
 */
function PracticeRunner({ session, sessionMeta, answeredIds, onAnswered, onFinish, onSkip, audioAvailable }) {
  const [secondsLeft, setSecondsLeft] = useState(sessionMeta ? sessionMeta.total : null);

  const isTimed = Boolean(sessionMeta && typeof sessionMeta.total === 'number');
  const expired = isTimed && secondsLeft <= 0;

  useEffect(() => {
    if (!isTimed || expired) return undefined;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 0) {
          clearInterval(t);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isTimed, expired]);

  const mm = secondsLeft !== null ? Math.floor(Math.max(0, secondsLeft) / 60) : 0;
  const ss = secondsLeft !== null ? String(Math.max(0, secondsLeft) % 60).padStart(2, '0') : '00';

  return (
    <div className="practice-shell">
      {isTimed && (
        <div className={`test-timer ${expired ? 'is-expired' : secondsLeft <= 30 ? 'is-low' : ''}`}>
          <span className="test-timer-label">Time</span>
          <span className="test-timer-clock">
            {mm}:{ss}
          </span>
        </div>
      )}
      <Practice
        key={`${sessionMeta ? sessionMeta.kind : 'free'}-${session.length}-${session[0] ? session[0].word.id : 'x'}`}
        session={session}
        onFinish={onFinish}
        audioAvailable={audioAvailable}
        variant={sessionMeta && sessionMeta.kind === 'level' ? 'practice' : 'quiz'}
        answeredIds={answeredIds}
        progressMeta={
          sessionMeta && sessionMeta.kind === 'level' ? { levelId: sessionMeta.levelId } : null
        }
        onAnswered={onAnswered}
        expired={expired}
        onSkip={onSkip}
      />
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState('hub'); // hub | profile | daily | level | test | practice | summary | learn | mastery
  const [showLaunch, setShowLaunch] = useState(shouldShowLaunch());
  const [session, setSession] = useState([]);
  const [sessionMeta, setSessionMeta] = useState(null); // { kind: 'level'|'daily'|'test', levelId?, total? } | null
  const [results, setResults] = useState(null);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [audioAlertDismissed, setAudioAlertDismissed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [dailyChallenge, setDailyChallenge] = useState(null);
  const [answeredIds, setAnsweredIds] = useState([]);
  const [notice, setNotice] = useState(null);
  const [, setProfileVersion] = useState(0); // displayName changes re-render via loadProfile()

  useEffect(() => {
    const unsubscribe = subscribeVoiceChange((hasVoice) => {
      setAudioAvailable(hasVoice);
    });
    return unsubscribe;
  }, []);

  // Auto-dismiss in-app notices (replaces blocking alert() dialogs)
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const profile = loadProfile();
  const xp = loadXP();
  const levelInfo = calculateLevel(xp);
  const dailyDoneToday = loadDailyStars().some((e) => e.date === todayKey());
  const currentLevel = getCurrentLevel(loadProgress(), getLevelCompletion());

  /* ===== Session starters (reusing the existing engines) ===== */

  function startPractice(themeFilter = null, specificWord = null) {
    const progress = loadProgress();
    let pool = words;
    if (themeFilter) {
      pool = words.filter((w) => w.theme === themeFilter);
    }
    let exercises = buildSession(pool, progress, 'practice', audioAvailable);
    if (specificWord) {
      const specificExercises = buildSession([specificWord], progress, 'practice', audioAvailable);
      if (specificExercises.length > 0) {
        exercises = [
          ...specificExercises,
          ...exercises.filter((ex) => ex.word.id !== specificWord.id),
        ];
      }
    }
    if (exercises.length === 0) {
      exercises = buildSession(pool, progress, 'review', audioAvailable);
    }
    if (exercises.length === 0) {
      setNotice('No words to practise right now!');
      return;
    }
    updateStreak();
    rememberLastSessionWords(exercises);
    setSessionMeta(null);
    setSession(exercises);
    setScreen('practice');
  }

  function startReview() {
    const progress = loadProgress();
    const exercises = buildSession(words, progress, 'review', audioAvailable);
    if (exercises.length === 0) {
      setNotice('No words due for review!');
      return;
    }
    updateStreak();
    rememberLastSessionWords(exercises);
    setSessionMeta(null);
    setSession(exercises);
    setScreen('practice');
  }

  /** Tab 3: full practice loop scoped to one level's words.
   * A level is always practisable: when SRS has nothing queued for its words
   * (all seen + none due), we synthesize exercises with the same full-loop
   * shape (re-queue on wrong, explanations) instead of refusing. */
  function startLevel(level) {
    const lvlWords = getLevelWords(level);
    const progress = loadProgress();
    let exercises = buildSession(lvlWords, progress, 'practice', audioAvailable);
    if (exercises.length === 0) {
      exercises = buildSession(lvlWords, progress, 'review', audioAvailable);
    }
    if (exercises.length === 0) {
      exercises = lvlWords.map((w) =>
        buildSingleExercise(w, lvlWords, audioAvailable)
      );
    }
    if (exercises.length === 0) {
      setNotice('This level has no practice available yet.');
      return;
    }
    updateStreak();
    rememberLastSessionWords(exercises);
    setSessionMeta({ kind: 'level', levelId: level.id });
    setSession(exercises);
    setScreen('practice');
  }

  /** Tab 2 hub entry: build today's challenge from due words (or recent session). */
  function openDaily() {
    const progress = loadProgress();
    setDailyChallenge(
      buildDailyChallenge(words, progress, audioAvailable, loadLastSessionWords())
    );
    setScreen('daily');
  }

  /** Tab 2: run the prebuilt challenge through Practice in quiz mode. */
  function startDaily() {
    if (!dailyChallenge || dailyChallenge.length === 0) return;
    updateStreak();
    setSessionMeta({ kind: 'daily' });
    setSession(dailyChallenge);
    setAnsweredIds([]);
    setScreen('practice');
  }

  /** Tab 4: cumulative timed test. */
  function startTest() {
    const timing = getTestTiming(levelInfo.level);
    const queue = buildTestSession(words, loadProgress(), audioAvailable, timing.questionCount);
    if (queue.length === 0) {
      setNotice('Nothing to test on yet — practise some words first.');
      return;
    }
    updateStreak();
    setSessionMeta({ kind: 'test', total: timing.seconds, mode: timing.mode });
    setSession(queue);
    setAnsweredIds([]);
    setScreen('practice');
  }

  const liveResultsRef = useRef({ correct: 0, total: 0 });

  function handleAnswered(index, next) {
    setAnsweredIds((prev) => (prev.includes(index) ? prev : [...prev, index]));
    if (next) liveResultsRef.current = { correct: next.correct, total: next.total };
  }

  function handleFinish(finalResults) {
    liveResultsRef.current = { correct: 0, total: 0 };
    const meta = sessionMeta;
    if (meta && meta.kind === 'daily') {
      logDailyStars(starsFor(finalResults.correct, finalResults.total));
      incrementSessionsCompleted();
    } else if (meta && meta.kind === 'test') {
      logTestScore(finalResults.correct, finalResults.total);
      incrementSessionsCompleted();
    } else {
      incrementSessionsCompleted();
    }
    setResults(finalResults);
    setScreen('summary');
  }

  /** Replay the exact same session queue from the beginning (free practice only). */
  function handleRedoSession() {
    if (!session || session.length === 0 || (sessionMeta && sessionMeta.kind !== null)) {
      startPractice();
      return;
    }
    updateStreak();
    setScreen('practice');
  }

  function leaveSession() {
    if (sessionMeta && sessionMeta.kind === 'test') {
      // Abandoning a timed test: log what was answered so far
      const { correct, total } = liveResultsRef.current;
      if (total > 0) logTestScore(correct, total);
    }
    liveResultsRef.current = { correct: 0, total: 0 };
    setSessionMeta(null);
    setResults(null);
    setScreen('hub');
  }

  // Sound settings live in the side nav (Settings section).

  function openTab(tab) {
    if (tab === 'daily') {
      openDaily();
    } else {
      setScreen(tab);
    }
  }

  return (
    <div className="app">
      {notice && (
        <div className="app-notice" role="status">
          {notice}
        </div>
      )}

      {showLaunch && <LaunchOverlay onDone={() => setShowLaunch(false)} />}

      <header className="app-header app-header--fixed">
        {screen === 'profile' ? (
          <>
            <button
              type="button"
              className="header-btn header-back-btn"
              onClick={() => setScreen('hub')}
              aria-label="Back to hub"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>

            <h1 className="header-screen-title">Profile &amp; Analytics</h1>

            <div className="header-right-actions">
              <button
                type="button"
                className="header-avatar-btn"
                onClick={() => {}}
                aria-label={`Level ${levelInfo.level}`}
              >
                <span className="header-avatar" aria-hidden="true">
                  {profile.displayName ? profile.displayName.charAt(0).toUpperCase() : 'M'}
                </span>
                <span className="header-lvl-badge">Lvl {levelInfo.level}</span>
              </button>
              <button
                type="button"
                className="header-btn hamburger-btn"
                onClick={() => setNavOpen(true)}
                aria-label="Open menu"
              >
                <span className="hamburger-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className="header-btn hamburger-btn"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
            >
              <span className="hamburger-bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>

            <button
              type="button"
              className="header-title-btn"
              onClick={() => setScreen('hub')}
              aria-label="Go to hub"
            >
              {profile.displayName ? (
                <span className="header-display-name">{profile.displayName}</span>
              ) : (
                <h1 className="app-wordmark">
                  <span className="wordmark-med">Med</span>
                  <span className="wordmark-german">German</span>
                </h1>
              )}
            </button>

            <button
              type="button"
              className="header-avatar-btn"
              onClick={() => setScreen('profile')}
              aria-label="Open Profile & Analytics"
            >
              <span className="header-avatar" aria-hidden="true">
                {profile.displayName ? profile.displayName.charAt(0).toUpperCase() : 'M'}
              </span>
              <span className="header-lvl-badge">Lvl {levelInfo.level}</span>
            </button>
          </>
        )}
      </header>

      {!audioAvailable && !audioAlertDismissed && (
        <div className="audio-alert">
          <p className="audio-alert-text">
            Audio isn't available on this device. Try Chrome, or install a German voice in your phone's text-to-speech settings.
          </p>
          <button
            className="audio-alert-close"
            onClick={() => setAudioAlertDismissed(true)}
            aria-label="Dismiss audio notice"
          >
            ✕
          </button>
        </div>
      )}

      <main className="app-main">
        {screen === 'hub' && (
          <Hub onOpenTab={openTab} dailyDoneToday={dailyDoneToday} />
        )}

        {screen === 'profile' && (
          <ProfileTab onNameSaved={() => setProfileVersion((v) => v + 1)} />
        )}

        {screen === 'daily' && (
          <DailyTab
            challenge={dailyChallenge}
            dailyDoneToday={dailyDoneToday}
            onStart={startDaily}
            onBack={() => setScreen('hub')}
          />
        )}

        {screen === 'level' && (
          <LevelTab
            currentLevelId={currentLevel.id}
            onStartLevel={startLevel}
            onOpenLevelBrowser={() => setScreen('learn')}
          />
        )}

        {screen === 'test' && (
          <TestTab levelNumber={levelInfo.level} onStart={startTest} onBack={() => setScreen('hub')} />
        )}

        {screen === 'practice' && (
          <PracticeRunner
            session={session}
            sessionMeta={sessionMeta}
            answeredIds={answeredIds}
            onAnswered={handleAnswered}
            onFinish={handleFinish}
            onSkip={leaveSession}
            audioAvailable={audioAvailable}
          />
        )}

        {screen === 'summary' && results && (
          <Summary
            results={results}
            variant={sessionMeta ? sessionMeta.kind : 'practice'}
            onPracticeAgain={startPractice}
            onRedoSession={handleRedoSession}
            redoUnavailable={
              !session || session.length === 0 || (sessionMeta && sessionMeta.kind !== null)
            }
            onHome={() => setScreen('hub')}
            onBackToHub={() => {
              setSessionMeta(null);
              setScreen('hub');
            }}
            audioAvailable={audioAvailable}
          />
        )}

        {screen === 'learn' && (
          <Learn
            onStartPractice={() => startPractice()}
            onPracticeTheme={(theme) => startPractice(theme)}
            onPracticeWord={(word) => startPractice(null, word)}
            onBack={() => setScreen('hub')}
            audioAvailable={audioAvailable}
          />
        )}

        {screen === 'mastery' && (
          <Home
            masteryOnly
            onLearn={() => setScreen('learn')}
            onPractice={() => startPractice()}
            onReview={startReview}
          />
        )}
      </main>

      <SideNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onOpenLearn={() => {
          setNavOpen(false);
          setScreen('learn');
        }}
        onOpenMastery={() => {
          setNavOpen(false);
          setScreen('mastery');
        }}
      />
    </div>
  );
}
