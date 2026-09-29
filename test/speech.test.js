import assert from 'assert';
import { speak } from '../src/lib/speech.js';

let lastSpoken = null;

// Mock window and speechSynthesis
global.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};

global.window = {
  speechSynthesis: {
    cancel: () => {},
    speak: (utterance) => {
      lastSpoken = utterance;
    },
    getVoices: () => [
      { name: 'Generic German Voice', lang: 'de-DE' },
      { name: 'Microsoft Katja Online (Natural) - German', lang: 'de-DE' },
      { name: 'Google Deutsch', lang: 'de-DE' },
      { name: 'Apple Anna (German)', lang: 'de-DE' },
    ],
  },
};

console.log('Testing voice ranking (Google/Microsoft preferred)...');

speak('Test');

assert.ok(lastSpoken !== null, 'Speech was not triggered');
assert.ok(
  lastSpoken.voice.name.includes('Microsoft') || lastSpoken.voice.name.includes('Google'),
  `Expected Microsoft or Google voice, but got: ${lastSpoken.voice.name}`
);
console.log('Selected voice:', lastSpoken.voice.name);

console.log('✓ VOICE RANKING TEST PASSED SUCCESSFULLY!');
