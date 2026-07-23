/* whisper.js – client‑side Whisper (WebAssembly) transcription
   This script loads the Whisper model from a CDN, records microphone audio with MediaRecorder,
   and transcribes the captured audio when stopped. It works entirely in the browser and
   requires no API keys or external services.

   Usage (already referenced in script.js):
   - await startWhisperListening() – returns true if Whisper started successfully.
   - stopWhisperListening() – stops recording and fills `finalTranscript` with the transcription.
*/

let _whisper = null;               // Whisper instance
let _mediaRecorder = null;          // MediaRecorder for microphone
let _audioChunks = [];
let _whisperModelUrl = 'https://cdn.jsdelivr.net/npm/whisper-web@0.2.1/dist/whisper.wasm'; // ~100 MB model
let _usingWhisper = false;          // flag, mirrored in script.js via global var

// Load the Whisper WebAssembly model lazily
async function loadWhisperModel() {
  if (_whisper) return _whisper;
  if (!('WebAssembly' in window)) {
    console.warn('WebAssembly not supported – Whisper unavailable');
    return null;
  }
  try {
    const response = await fetch(_whisperModelUrl);
    const buffer = await response.arrayBuffer();
    // The library expects the raw wasm bytes – we use the global Whisper constructor
    // provided by the CDN (whisper.WebAssemblyTranscriber). If not present, we fallback.
    if (typeof Whisper !== 'undefined' && Whisper.create) {
      _whisper = await Whisper.create(buffer);
    } else if (typeof whisper !== 'undefined' && whisper.Transcriber) {
      // alternative export name
      _whisper = new whisper.Transcriber(buffer);
    } else {
      console.error('Whisper library not found on page');
      return null;
    }
    console.info('Whisper model loaded');
    return _whisper;
  } catch (e) {
    console.error('Failed to load Whisper model', e);
    return null;
  }
}

// Start listening with Whisper – returns true if started
async function startWhisperListening() {
  // If already using native SpeechRecognition, we skip Whisper.
  // Removed self‑check; function will be invoked directly.
  const model = await loadWhisperModel();
  if (!model) return false;

  // Request microphone permission
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _mediaRecorder = new MediaRecorder(stream);
    _audioChunks = [];
    _mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) _audioChunks.push(e.data);
    };
    _mediaRecorder.onstart = () => {
      _usingWhisper = true;
      window.usingWhisper = true; // sync with script.js variable
      if (window.statusEl) window.statusEl.textContent = 'Recording (Whisper)…';
    };
    _mediaRecorder.start();
    return true;
  } catch (err) {
    console.error('Microphone access denied', err);
    return false;
  }
}

// Stop Whisper recording, transcribe, and push results into the UI variables.
async function stopWhisperListening() {
  if (!_mediaRecorder) return;
  // Stop the MediaRecorder – onstop will fire after data is flushed.
  const stopPromise = new Promise(resolve => {
    _mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(_audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      try {
        const result = await _whisper.transcribe(arrayBuffer);
        // The result format depends on the library; we assume {text: '...'}
        const text = result && result.text ? result.text : '';
        // Append to the global transcripts used by script.js
        window.finalTranscript = (window.finalTranscript || '') + text + ' ';
        if (window.transcriptOutput) {
          window.transcriptOutput.value = window.finalTranscript.trim();
        }
        if (window.statusEl) window.statusEl.textContent = 'Transcription completed.';
      } catch (e) {
        console.error('Whisper transcription failed', e);
        if (window.statusEl) window.statusEl.textContent = 'Whisper error.';
      }
      // Cleanup
      _usingWhisper = false;
      window.usingWhisper = false;
      resolve();
    };
  });
  _mediaRecorder.stop();
  await stopPromise;
}

// Export functions globally so script.js can call them.
window.startWhisperListening = startWhisperListening;
window.stopWhisperListening = stopWhisperListening;
