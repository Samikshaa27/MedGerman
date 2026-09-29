import { useState, useEffect } from 'react';
import Home from './components/Home.jsx';
import Learn from './components/Learn.jsx';
import Practice from './components/Practice.jsx';
import Summary from './components/Summary.jsx';
import { buildSession } from './lib/session.js';
import { loadProgress, updateStreak } from './lib/storage.js';
import { subscribeVoiceChange } from './lib/speech.js';
import { isMuted, toggleMuted } from './lib/sound.js';
import words from './data/words.json';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [session, setSession] = useState([]);
  const [results, setResults] = useState(null);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [audioAlertDismissed, setAudioAlertDismissed] = useState(false);
  const [soundMuted, setSoundMuted] = useState(isMuted());

  useEffect(() => {
    const unsubscribe = subscribeVoiceChange((hasVoice) => {
      setAudioAvailable(hasVoice);
    });
    return unsubscribe;
  }, []);

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
      alert('No words to practise right now!');
      return;
    }
    updateStreak();
    setSession(exercises);
    setScreen('practice');
  }

  function startReview() {
    const progress = loadProgress();
    const exercises = buildSession(words, progress, 'review', audioAvailable);
    if (exercises.length === 0) {
      alert('No words due for review!');
      return;
    }
    updateStreak();
    setSession(exercises);
    setScreen('practice');
  }

  function handleFinish(finalResults) {
    setResults(finalResults);
    setScreen('summary');
  }

  function handleToggleMute() {
    const next = toggleMuted();
    setSoundMuted(next);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-wordmark">
          <span className="wordmark-med">Med</span><span className="wordmark-german">German</span>
        </h1>
        <button
          className="mute-toggle-btn"
          onClick={handleToggleMute}
          aria-label={soundMuted ? 'Unmute sound effects' : 'Mute sound effects'}
          title={soundMuted ? 'Unmute sound effects' : 'Mute sound effects'}
        >
          {soundMuted ? '🔇' : '🔔'}
        </button>
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
        {screen === 'home' && (
          <Home
            onLearn={() => setScreen('learn')}
            onPractice={() => startPractice()}
            onReview={startReview}
          />
        )}
        {screen === 'learn' && (
          <Learn
            onStartPractice={() => startPractice()}
            onPracticeTheme={(theme) => startPractice(theme)}
            onPracticeWord={(word) => startPractice(null, word)}
            onBack={() => setScreen('home')}
            audioAvailable={audioAvailable}
          />
        )}
        {screen === 'practice' && (
          <Practice session={session} onFinish={handleFinish} audioAvailable={audioAvailable} />
        )}
        {screen === 'summary' && results && (
          <Summary
            results={results}
            onPracticeAgain={startPractice}
            onHome={() => setScreen('home')}
            audioAvailable={audioAvailable}
          />
        )}
      </main>
    </div>
  );
}
