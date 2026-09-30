import { useEffect, useRef, useState } from 'react';
import { isMuted, toggleMuted } from '../lib/sound.js';
import {
  loadProfile,
  saveProfile,
  exportProgress,
  importProgress,
} from '../lib/storage.js';

const RATE_OPTIONS = [
  { value: 0.5, label: '0.5x — slow' },
  { value: 0.85, label: '0.85x — normal' },
  { value: 1, label: '1x — fast' },
];

/**
 * Side navigation panel (hamburger): Settings, Export/Import progress,
 * About placeholder, plus links to the classic Learn browser and the
 * Mastery overview.
 */
export default function SideNav({ open, onClose, onOpenLearn, onOpenMastery }) {
  const [muted, setMuted] = useState(isMuted());
  const [defaultRate, setDefaultRate] = useState(() => loadProfile().defaultRate);
  const fileInputRef = useRef(null);
  const [importMsg, setImportMsg] = useState(null);

  // Live-update the mute state while the panel is open (nav + settings share it)
  useEffect(() => {
    if (!open) return;
    setMuted(isMuted());
    setDefaultRate(loadProfile().defaultRate);
  }, [open]);

  function handleToggleMute() {
    const next = toggleMuted();
    setMuted(next);
  }

  function handleRate(rate) {
    saveProfile({ defaultRate: rate });
    setDefaultRate(rate);
  }

  function handleExport() {
    try {
      const data = exportProgress();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `medgerman-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setImportMsg({ ok: true, text: 'Backup downloaded.' });
    } catch {
      setImportMsg({ ok: false, text: 'Export failed.' });
    }
  }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importProgress(String(reader.result));
      setImportMsg({
        ok: res.ok,
        text: res.ok ? 'Progress imported.' : res.error || 'Import failed.',
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className={`sidenav-root ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="sidenav-backdrop" onClick={onClose} />
      <nav className="sidenav-panel" aria-label="Menu">
        <div className="sidenav-head">
          <span className="sidenav-title">Menu</span>
          <button
            type="button"
            className="sidenav-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <section className="sidenav-section">
          <h3 className="sidenav-section-title">Settings</h3>
          <button
            type="button"
            className={`sidenav-toggle ${muted ? 'is-active' : ''}`}
            onClick={handleToggleMute}
            aria-pressed={muted}
          >
            <span className="sidenav-toggle-label">Sound effects</span>
            <span className="sidenav-toggle-value">{muted ? 'Off' : 'On'}</span>
          </button>
          <div className="sidenav-rate-row" role="group" aria-label="Default playback speed">
            <span className="sidenav-toggle-label">Playback speed</span>
            <div className="sidenav-rate-options">
              {RATE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`rate-chip ${defaultRate === opt.value ? 'is-selected' : ''}`}
                  onClick={() => handleRate(opt.value)}
                  aria-pressed={defaultRate === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="sidenav-section">
          <h3 className="sidenav-section-title">Progress</h3>
          <button type="button" className="sidenav-action" onClick={handleExport}>
            Export progress
          </button>
          <button
            type="button"
            className="sidenav-action"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
          >
            Import progress
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFile}
            className="sidenav-file-input"
            tabIndex={-1}
          />
          {importMsg && (
            <p className={`sidenav-msg ${importMsg.ok ? 'is-ok' : 'is-err'}`}>{importMsg.text}</p>
          )}
        </section>

        <section className="sidenav-section">
          <h3 className="sidenav-section-title">More</h3>
          {onOpenMastery && (
            <button type="button" className="sidenav-action" onClick={onOpenMastery}>
              Word mastery overview
            </button>
          )}
          {onOpenLearn && (
            <button type="button" className="sidenav-action" onClick={onOpenLearn}>
              Word browser (Learn)
            </button>
          )}
          <button
            type="button"
            className="sidenav-action"
            onClick={() => setImportMsg({ ok: true, text: 'About MedGerman — coming soon.' })}
          >
            About
          </button>
        </section>
      </nav>
    </div>
  );
}
