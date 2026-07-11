# DraftWhisper

AI voice-over desktop tool — manage your voice-over one sentence at a time.

## Current Features

- Import or edit scripts with automatic/manual sentence splitting
- MiMo v2.5 basic, voice-design, and voice-clone generation with editable model mappings
- Free-text performance direction, reusable WAV/MP3 clone samples, and independent clone previews
- Voice-clone file signature validation and MiMo's 10 MB Base64 Data URI limit enforced locally
- Configurable concurrent generation with per-sentence retry and readable errors
- Playback, native macOS file drag, clipboard copy, and Finder reveal
- Local projects with automatic persistence and project deletion
- Up to five cached audio versions per sentence with automatic cleanup
- Multiple project-selectable API configurations with keys isolated in macOS Keychain
- Bilingual Settings center with per-capability real synthesis tests and editable model mappings

## Tech Stack

- **Desktop**: Tauri 2
- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand
- **Animation**: Motion
- **Lint/Format**: Biome

## Getting Started

```bash
# Install dependencies
npm install

# Start the Vite dev server
npm run dev

# Start the Tauri desktop app (launches Vite automatically)
npm run tauri dev

# Build a production bundle
npm run tauri build
```

## Code Quality

```bash
# Lint
npm run lint

# Lint with auto-fix
npm run lint:fix

# Format
npm run format

# Frontend and Rust unit tests
npm test
```

## Project Structure

```
draft-whisper/
├── docs/                # Product docs (PRD, etc.)
├── public/              # Static assets served as-is
├── src/                 # Frontend source
│   ├── assets/          # Images and static imports
│   ├── components/
│   │   └── ui/          # shadcn/ui primitives
│   ├── lib/             # Shared helpers (cn, etc.)
│   ├── stores/          # Zustand stores
│   ├── types/           # TypeScript type definitions
│   ├── utils/           # Domain utilities (sentence splitting, id, etc.)
│   ├── App.tsx          # Root component
│   ├── main.tsx         # React entry
│   └── index.css        # Global styles + Tailwind theme tokens
├── src-tauri/           # Rust backend (Tauri)
│   ├── capabilities/    # Permission definitions
│   ├── icons/           # App icons
│   ├── src/             # Rust source (lib.rs, main.rs)
│   ├── Cargo.toml       # Rust manifest
│   └── tauri.conf.json  # Tauri config
├── biome.json           # Biome config
├── components.json      # shadcn/ui config
├── index.html           # HTML entry
├── package.json
├── tsconfig.json        # TS project references
├── tsconfig.app.json    # TS config for src/
├── tsconfig.node.json   # TS config for build scripts
└── vite.config.ts
```

## License

MIT
