# Speech-to-Text Summarizer

A simple browser-based app that:

- listens to your microphone,
- transcribes your spoken words with the browser's speech recognition API,
- supports Hebrew and English speech input,
- creates a concise summary with a lightweight extractive algorithm,
- reads the summary aloud using the browser's speech synthesis API.

## Run locally

Open [index.html](index.html) in a browser, or serve the folder with a simple local server.

Example:

```bash
cd web/text-to-speech-summarizer
python -m http.server 8000
```

Then open <http://localhost:8000> in your browser.

## Notes

This works best in Chrome or Edge because those browsers support the Web Speech APIs used for transcription and playback. Hebrew works best when your browser and system language settings support Hebrew speech recognition.
