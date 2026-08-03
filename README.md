[English](README.md) · [简体中文](README.zh-CN.md)

# DraftWhisper

DraftWhisper is a AI voice-over workspace for creators who need to revise one
sentence, regenerate it, listen immediately, download files and drop the result into an editor.

```text
Edit one sentence → Regenerate → Listen → Drag into your video editor
```

It turns a script into independently managed WAV clips instead of treating the whole script as
one long TTS job. The current MVP uses Xiaomi MiMo v2.5 TTS and keeps projects, settings, and
generated audio local to the machine.

## Features

### Sentence-level workflow

- Paste a script and preview automatic sentence splitting, or enter one sentence per line.
- Generate all sentences with a configurable worker pool (1–16 concurrent requests).
- Play, edit, regenerate, retry failed sentences, and see readable per-sentence errors.
- Editing a sentence automatically clears its old audio and starts a new generation.
- Keep and switch between the five most recent audio versions for each sentence.

### Voice generation

- MiMo basic voices, including Chinese and English presets.
- Voice design from a text description, with reusable saved voice-design presets.
- Voice cloning from WAV or MP3 samples, with reusable local sample management.
- Optional free-text performance direction for basic and clone modes.
- Independent voice previews that do not become part of a sentence's audio history.
- Per-capability model IDs and real synthesis tests in Settings.

### Local editing workflow

- Local projects with project-specific scripts, voice settings, and cached audio.
- Native macOS file drag into apps such as CapCut/Jianying, Premiere, DaVinci Resolve, and Final
  Cut Pro.
- Copy an audio file to the macOS clipboard or reveal it in Finder.
- Automatic cleanup of evicted versions and unused cached audio.
- Light, dark, and system themes; English and Simplified Chinese UI.

## Supported provider

The provider registry is designed to be extensible, but the current implementation includes only
Xiaomi MiMo.

| Provider | Protocol | Default base URL | Modes |
| --- | --- | --- | --- |
| Xiaomi MiMo | Chat Completions-style TTS | `https://api.xiaomimimo.com/v1` | Basic, voice design, voice clone |

New MiMo configurations use these default model mappings. Every model ID can be edited in
Settings:

| Mode | Default model |
| --- | --- |
| Basic voice | `mimo-v2.5-tts` |
| Voice design | `mimo-v2.5-tts-voicedesign` |
| Voice clone | `mimo-v2.5-tts-voiceclone` |

See the [MiMo v2.5 speech synthesis documentation](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5)
for API access and account details.

### Voice-clone limits

Before a sample is stored or sent, DraftWhisper checks the file signature and validates that it is
a WAV or MP3 file, shorter than 30 seconds, and under MiMo's 10 MB limit after conversion to a
complete Base64 Data URI.

## Quick start

### Requirements

- macOS is the primary target for the current MVP and its native drag, clipboard, Finder, and
  Keychain integrations.
- A recent Node.js/npm installation.
- Rust and Cargo compatible with the project's Tauri toolchain (Rust 1.77.2 or newer).
- A MiMo API key.

### Run the desktop app

```bash
npm install
npm run tauri dev
```

On first launch:

1. Open Settings and add a MiMo API configuration.
2. Enter the API key and test the capabilities you want to use.
3. Paste a script, choose a voice mode, and generate the sentence audio.

For front-end-only work, use `npm run dev`. Tauri commands and native macOS behavior require the
desktop command.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite for front-end-only development |
| `npm run tauri dev` | Start the complete Tauri desktop app |
| `npm run build` | Type-check and build the front end |
| `npm run tauri build` | Build the production desktop bundle |
| `npm run lint` | Run Biome checks |
| `npm run lint:fix` | Apply Biome lint fixes |
| `npm run format` | Format the repository with Biome |
| `npm test` | Run front-end and Rust tests |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Check the Rust backend |

## Architecture and storage

```text
React + TypeScript + Zustand
          │ Tauri IPC
          ▼
Rust + reqwest ──────► MiMo v2.5 TTS API
          │
          ├─ Project metadata and preferences: localStorage
          ├─ API keys: macOS Keychain
          └─ WAV files and voice samples: local audio cache
```

- The front end owns project and settings state; the Rust side handles HTTP, file I/O, audio
  caching, and macOS integrations.
- API keys are stored per API configuration in the macOS Keychain and are not persisted in
  `localStorage`.
- Generated audio is written locally. The app tries its OS cache/data directory first and falls
  back to `.cache/audio` during development when necessary.
- Voice-clone samples are copied into the local voice-sample cache and sent to MiMo only when a
  clone generation or preview request is made.

## Project structure

```text
draft-whisper/
├── docs/                 # Product requirements and project documents
├── src/                  # React front end
│   ├── components/dw/    # DraftWhisper UI
│   ├── hooks/            # Generation and playback hooks
│   ├── services/         # Tauri IPC service wrappers
│   ├── stores/           # Zustand stores
│   ├── types/            # TypeScript domain types
│   └── utils/            # Sentence, ID, cache, and configuration helpers
├── src-tauri/            # Rust/Tauri backend
│   ├── src/lib.rs        # Tauri setup and command registration
│   └── src/tts.rs        # MiMo requests, audio cache, and native actions
├── tests/                # Front-end and Rust-facing tests
├── package.json
└── biome.json
```

## Current scope

Native file drag, clipboard, Finder, and Keychain behavior ismacOS-specific; macOS remains the primary supported platform while the provider and desktop architecture evolve.

## License

[MIT](LICENSE)
