import { useEffect, useState } from 'react';

/**
 * Launch animation: app name with split-entry slide, once per browser session.
 * sessionStorage (not localStorage) so it replays in a fresh tab but not on
 * every internal navigation. Tapping anywhere skips it.
 *
 * Animation phases:
 *   "in"   → halves start off-screen (translateX)
 *   "meet" → halves slide to center
 *   "out"  → entire overlay fades out
 */
export function shouldShowLaunch() {
  try {
    return !sessionStorage.getItem('medgerman-launched');
  } catch {
    return true;
  }
}

function markLaunched() {
  try {
    sessionStorage.setItem('medgerman-launched', '1');
  } catch {
    /* private mode: show each load, harmless */
  }
}

export default function LaunchOverlay({ onDone }) {
  const [phase, setPhase] = useState('in'); // in -> meet -> out

  function finish() {
    markLaunched();
    onDone();
  }

  useEffect(() => {
    // Tiny delay so the browser paints the "in" state before transitioning
    const t0 = requestAnimationFrame(() => setPhase('meet'));
    const t1 = setTimeout(() => setPhase('out'), 1800);  // slide-in (~0.6s) + ~1.2s hold
    const t2 = setTimeout(finish, 2400);                  // after fade-out completes
    return () => {
      cancelAnimationFrame(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`launch-overlay launch-overlay--${phase}`}
      onClick={finish}
      role="button"
      aria-label="MedGerman — tap to continue"
    >
      <div className="launch-card">
        <div className="launch-overlay-inner">
          <h1 className="launch-wordmark">
            <span className="wordmark-med">Med</span>
            <span className="wordmark-german">German</span>
          </h1>
        </div>
      </div>
    </div>
  );
}
