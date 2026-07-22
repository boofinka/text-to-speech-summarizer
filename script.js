const transcriptOutput = document.getElementById('transcriptOutput');
const summaryOutput = document.getElementById('summaryOutput');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const summarizeBtn = document.getElementById('summarizeBtn');
const speakBtn = document.getElementById('speakBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const lengthInput = document.getElementById('summaryLength');
const lengthValue = document.getElementById('lengthValue');
const languageSelect = document.getElementById('languageSelect');
const voiceSelect = document.getElementById('voiceSelect');
const summaryMode = document.getElementById('summaryMode');

let voices = [];
let recognition = null;
let finalTranscript = '';
let interimTranscript = '';
let isListening = false;
let currentLanguage = 'he-IL';
let selectedVoiceName = 'auto';

function updateLengthLabel() {
  const count = Number(lengthInput.value);
  const isBulletMode = summaryMode.value === 'key-points';
  const unit = isBulletMode ? 'point' : 'sentence';
  lengthValue.textContent = `${count} ${unit}${count === 1 ? '' : 's'}`;
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function tokenizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function getSentences(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const punctuationChunks = normalized
    .split(/(?<=[.!?])\s+|(?<=[;:])\s+|(?:\n|\r)/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (punctuationChunks.length > 1) {
    return punctuationChunks;
  }

  const words = normalized.split(/\s+/);
  const chunkSize = Math.max(12, Math.min(24, Math.ceil(words.length / 3)));
  const chunks = [];

  for (let index = 0; index < words.length; index += chunkSize) {
    chunks.push(words.slice(index, index + chunkSize).join(' '));
  }

  return chunks;
}

function getWordFrequency(sentences) {
  const stopWords = new Set([
    'the','and','a','an','to','of','in','on','for','is','are','with','that','this','it','be','as','by','or','from','at','was','were','but','have','has','had','can','could','should','would','will','your','our','their','its','we','you','i','he','she','they','them','then','than','into','about','after','before','while','during','through','over','under','very','more','most','some','such','הוא','היא','הם','הן','הינו','אנחנו','את','אתה','אתן','אתם','גם','זה','זאת','כדי','כי','אבל','ולכן','אז','לפיכך','על','עם','של','היה','היתה','היו','יש','יכל','יכולה','יכולים','יכולות','לא','אפשר','צריך','צריך','ממש','כמו','רק','עוד','כל','כמה','כלומר'
  ]);

  const frequency = new Map();
  sentences.forEach((sentence) => {
    const words = tokenizeText(sentence).filter((word) => !stopWords.has(word));

    words.forEach((word) => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });
  });

  return frequency;
}

function summarizeText(text, numberOfSentences = 2, mode = 'short-summary') {
  const sentences = getSentences(text);
  if (sentences.length === 0) {
    return { text: 'Please speak a bit more so I can summarize it.', bullets: [] };
  }

  if (sentences.length <= numberOfSentences) {
    return { text: sentences.join(' '), bullets: sentences };
  }

  const frequency = getWordFrequency(sentences);
  const scored = sentences.map((sentence, index) => {
    const words = tokenizeText(sentence);
    const keywordScore = words.reduce((total, word) => total + (frequency.get(word) || 0), 0);
    const coverageBoost = words.length > 8 ? 1 : 0.5;
    const positionBoost = 1 / (index + 1);
    const lengthPenalty = sentence.length > 220 ? -1.2 : 0;
    return { sentence, score: keywordScore + coverageBoost + positionBoost + lengthPenalty, index };
  });

  const bucketSize = Math.max(1, Math.ceil(sentences.length / Math.max(1, numberOfSentences)));
  const buckets = Array.from({ length: numberOfSentences }, () => []);

  scored.forEach((item) => {
    const bucketIndex = Math.min(numberOfSentences - 1, Math.floor(item.index / bucketSize));
    buckets[bucketIndex].push(item);
  });

  const selected = buckets
    .map((bucket) => bucket.sort((a, b) => b.score - a.score)[0])
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  if (mode === 'one-sentence') {
    const bestSentence = scored.sort((a, b) => b.score - a.score)[0];
    return { text: bestSentence.sentence, bullets: [bestSentence.sentence] };
  }

  if (mode === 'key-points') {
    return { text: selected.join(' '), bullets: selected.slice(0, numberOfSentences) };
  }

  return { text: selected.join(' '), bullets: selected };
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderSummary(summary, mode) {
  if (mode === 'key-points') {
    const items = summary.bullets.length ? summary.bullets : [summary.text];
    summaryOutput.innerHTML = `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    return;
  }

  summaryOutput.innerHTML = `<p>${escapeHtml(summary.text)}</p>`;
}

function getPreferredVoice(language) {
  const preferred = language.toLowerCase();
  const base = preferred.split('-')[0];
  const exactMatches = voices.filter((voice) => {
    const voiceLang = voice.lang.toLowerCase();
    return voiceLang === preferred || voiceLang.startsWith(`${preferred}-`) || voiceLang === base || voiceLang.startsWith(`${base}-`);
  });

  if (exactMatches.length > 0) {
    return exactMatches[0];
  }

  if (language === 'he-IL') {
    return voices.find((voice) => voice.lang.toLowerCase().includes('he')) || voices[0] || null;
  }

  return voices.find((voice) => voice.lang.toLowerCase().includes('en')) || voices[0] || null;
}

function speakText(text, language = currentLanguage) {
  if (!('speechSynthesis' in window)) {
    statusEl.textContent = 'Speech synthesis is not supported in this browser.';
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.voice = selectedVoiceName && selectedVoiceName !== 'auto'
    ? voices.find((voice) => voice.name === selectedVoiceName) || getPreferredVoice(language)
    : getPreferredVoice(language);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
  statusEl.textContent = 'Reading the summary aloud...';
}

function populateVoices() {
  voices = window.speechSynthesis.getVoices();
  const currentLanguageBase = currentLanguage.split('-')[0].toLowerCase();
  const relevantVoices = voices.filter((voice) => {
    const lang = voice.lang.toLowerCase();
    return lang.startsWith(currentLanguageBase) || lang.includes(currentLanguageBase);
  });

  const options = relevantVoices.length > 0 ? relevantVoices : voices;
  voiceSelect.innerHTML = '';
  const autoOption = document.createElement('option');
  autoOption.value = 'auto';
  autoOption.textContent = 'Auto';
  voiceSelect.appendChild(autoOption);

  options.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  if (selectedVoiceName && selectedVoiceName !== 'auto') {
    voiceSelect.value = selectedVoiceName;
  } else {
    voiceSelect.value = 'auto';
  }
}

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    statusEl.textContent = 'Speech recognition is not supported in this browser. Try Chrome or Edge.';
    return null;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = currentLanguage;

    recognition.onstart = () => {
      isListening = true;
      statusEl.textContent = 'Listening for speech...';
    };

    recognition.onresult = (event) => {
      interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          finalTranscript += `${text} `;
        } else {
          interimTranscript += `${text} `;
        }
      }
      transcriptOutput.value = `${finalTranscript}${interimTranscript}`.trim();
    };

    recognition.onerror = (event) => {
      statusEl.textContent = `Listening error: ${event.error}`;
    };

    recognition.onend = () => {
      isListening = false;
      if (finalTranscript) {
        statusEl.textContent = 'Listening stopped.';
      } else {
        statusEl.textContent = 'No speech detected.';
      }
    };
  }

  return recognition;
}

function startListening() {
  const speechRecognition = initRecognition();
  if (!speechRecognition) {
    return;
  }

  if (isListening) {
    statusEl.textContent = 'Already listening.';
    return;
  }

  try {
    speechRecognition.lang = currentLanguage;
    finalTranscript = transcriptOutput.value.trim();
    interimTranscript = '';
    speechRecognition.start();
  } catch (error) {
    statusEl.textContent = 'Unable to start microphone capture.';
  }
}

function stopListening() {
  if (recognition && isListening) {
    recognition.stop();
  }
}

startBtn.addEventListener('click', startListening);
stopBtn.addEventListener('click', stopListening);

summarizeBtn.addEventListener('click', () => {
  const text = transcriptOutput.value.trim();
  if (!text) {
    statusEl.textContent = 'Please speak something first.';
    summaryOutput.innerHTML = 'Your summary will appear here.';
    return;
  }

  const summary = summarizeText(text, Number(lengthInput.value), summaryMode.value);
  renderSummary(summary, summaryMode.value);
  statusEl.textContent = 'Summary ready.';
});

speakBtn.addEventListener('click', () => {
  const summary = summaryOutput.textContent.trim();
  if (!summary || summary.includes('Your summary will appear here')) {
    statusEl.textContent = 'Create a summary first.';
    return;
  }

  speakText(summary, currentLanguage);
});

clearBtn.addEventListener('click', () => {
  transcriptOutput.value = '';
  summaryOutput.innerHTML = 'Your summary will appear here.';
  finalTranscript = '';
  interimTranscript = '';
  statusEl.textContent = 'Ready to listen.';
  window.speechSynthesis.cancel();
  if (recognition && isListening) {
    recognition.stop();
  }
});

languageSelect.addEventListener('change', () => {
  currentLanguage = languageSelect.value;
  if (recognition) {
    recognition.lang = currentLanguage;
  }
  populateVoices();
  statusEl.textContent = `Language set to ${languageSelect.options[languageSelect.selectedIndex].text}.`;
});

voiceSelect.addEventListener('change', () => {
  selectedVoiceName = voiceSelect.value;
});

summaryMode.addEventListener('change', () => {
  updateLengthLabel();
});

lengthInput.addEventListener('input', updateLengthLabel);
window.addEventListener('load', () => {
  languageSelect.value = currentLanguage;
  updateLengthLabel();
  populateVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }
});
