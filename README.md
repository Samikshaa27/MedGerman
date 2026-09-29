# MedGerman

MedGerman is a phone-first, zero-friction medical German web application designed specifically for Indian nurses preparing to work in Germany, training high-yield clinical vocabulary and patient-care phrases at CEFR level A1–A2 with native pronunciation and intelligent Leitner spaced repetition.

---

## The Learning Loop

The core pedagogy follows a continuous, mistake-forgiving mastery cycle:

$$\text{Intro Card} \longrightarrow \text{Active Exercise} \longrightarrow \text{Immediate Feedback} \longrightarrow \text{Deterministic Explanation} \longrightarrow \text{In-Session Re-queue} \longrightarrow \text{Spaced Review}$$

1. **Intro Step**: First-time encounters show an introductory flashcard (German word with gendered article, audio pronunciation, English meaning, clinical example, and modern usage notes) before testing.
2. **Graded Practice**: The learner completes recognition, listening, cloze, or recall typing exercises tailored to their current mastery box.
3. **Instant Feedback & Loop**: Correct answers celebrate and advance; mistakes trigger an immediate diff explanation, provide memory hooks (cognate cues and curated mnemonics), and re-queue the item within the same session.
4. **Spaced Repetition**: Mastered items graduate to longer intervals, surfacing on the daily review dashboard just as memory begins to decay.

---

## Leitner Spaced-Repetition System (SRS)

MedGerman implements a 6-box Leitner system ([src/lib/srs.js](src/lib/srs.js)):

| Box | Production Interval | Dev Interval (`?dev=1`) | Mastery Stage | Exercise Types |
|:---:|:---:|:---:|:---|:---|
| **Box 0** | 0 days (immediate) | 0 minutes | New / Demoted | Multiple Choice (`mcq`), Article Picking (`article`) |
| **Box 1** | 1 day | 1 minute | Recognition | Multiple Choice (`mcq`), Article Picking (`article`) |
| **Box 2** | 2 days | 2 minutes | Passive Recall | Listening Comprehension (`listening`), Cloze (`cloze`) |
| **Box 3** | 4 days | 3 minutes | Contextual Recall | Listening Comprehension (`listening`), Cloze (`cloze`) |
| **Box 4** | 8 days | 5 minutes | Active Recall | German Spelling/Typing (`typing`), Sentence Writing (`sentence`) |
| **Box 5** | 16 days | 8 minutes | Full Mastery | German Spelling/Typing (`typing`), Sentence Writing (`sentence`) |

- **Correct answer**: Promotes word to $\min(\text{box} + 1, 5)$ and schedules the next review date.
- **Incorrect answer**: Demotes word back to Box 0, sets review to immediate, and re-queues it at the end of the current session.
- **Audio fallback**: If German speech synthesis is unavailable on the device, listening exercises gracefully fallback to cloze (for nouns) and sentence typing (for sentences).

---

## Key Design Decisions

- **No Login / Zero Friction**: Nurses studying between clinical hospital shifts need to open the app and practise in under 3 seconds without managing accounts, passwords, or authentication flows.
- **`localStorage`-Only Persistence**: All Leitner intervals, error histories, streaks, and XP are stored locally on the device. Completely private, GDPR-compliant by design, and operable offline.
- **Deterministic Rule-Based Explanations (No AI / LLMs)**: Mistake explanations are 100% deterministic and offline ([src/lib/explain.js](src/lib/explain.js)). This guarantees zero hallucination, zero network latency, zero API costs or keys, and reliable educational tips (differentiating identical English cognates, similar cognates, noun capitalization rules, and umlaut substitutions).
- **Lenient Typing for Indian Keyboards**: English mobile keyboards without German layouts automatically accept `ae`, `oe`, `ue`, and `ss` for `ä`, `ö`, `ü`, and `ß` with polite guidance, preventing frustrating input barriers.

---

## Local Development & Testing

### Prerequisites
- Node.js (v18+)
- npm

### Installation & Run
```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Run unit test suites (explain, srs, and session)
npm test
```

### Dev Mode (`?dev=1`)
Append `?dev=1` to the URL in your browser:
```
http://localhost:5173/?dev=1
```
Dev mode activates:
1. **Minute intervals**: `[0, 1, 2, 3, 5, 8]` minutes instead of days, enabling rapid verification of Leitner promotions and due queues.
2. **Reset progress button**: A one-click reset button on the Home dashboard to clear test progress.

---

## Deployment (Static Site)

MedGerman is an entirely client-side Single Page Application (SPA) with zero backend services. It can be hosted on any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages):

- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: None required

---

## Known Limitations

1. **Speech Synthesis**: Native German pronunciation relies on the Web Speech API (`SpeechSynthesis`). Availability depends on the user's OS and browser (e.g. mobile Chrome or Safari with German voice installed). When unavailable, the app displays a non-blocking notification and automatically excludes audio-dependent exercises.
2. **Local Storage Scoping**: Progress is tied to the specific browser instance and device. Clearing browser cache or switching devices does not sync historical progress.
