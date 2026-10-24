# OpenCode Companion (`opencode-companion`)

Modern, local-first web dashboard and CLI launcher to configure and manage [OpenCode](https://opencode.ai) on your device.

[![npm version](https://img.shields.io/npm/v/opencode-companion.svg)](https://www.npmjs.com/package/opencode-companion)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Highlights

- **Instant Local Web Dashboard**: Launch locally with a single command via `npx opencode-companion@latest`.
- **Zero Secrets Leaked**: Write-only credentials semantic, HMAC tagged secret redaction in diffs and editor, credentials stored locally.
- **Provider & Model Manager**: Configure endpoints, API keys (literal or `{env:VAR}` / `{file:path}` references), modalities (vision, reasoning, tool calls), and context limits.
- **MCP Tool Integration**: Seamless management of Model Context Protocol servers (remote SSE/HTTP and local command with confirmation prompt).
- **Interactive Config Editor**: Monaco editor with schema validation, comment preservation (JSONC), and side-by-side diff review before committing.
- **Automated Backups & Restore**: Automatic point-in-time snapshots created before every mutation, with single-click rollback.
- **Automated Diagnostics**: Instant health checks verifying binary installation, permissions, config syntax, and network loopback.
- **AI Config Assistant**: Natural-language configuration updates powered by your own chosen OpenAI-compatible model, proposing validated unified diffs.

---

## Quick Start

### Run with NPX (No installation required)

```bash
npx opencode-companion@latest
```

### Or install globally

```bash
npm install -g opencode-companion
opencode-companion
```

Companion will find an available port (default `3000`), generate a secure one-time session token, bind strictly to `127.0.0.1` (loopback only), and provide the URL:

```text
==================================================
  OpenCode Companion v0.1.0
  Dashboard: http://127.0.0.1:3000/?token=8e4f1a...
==================================================
* Running on 127.0.0.1 (Local device only)
* Preserving privacy: credentials remain local
* Press Ctrl+C to stop
```

---

## CLI Options

```text
Usage:
  npx opencode-companion@latest [options]
  opencode-companion [options]

Options:
  -p, --port <number>     Preferred port (default: 3000, auto-fallback to next free)
  --host <string>         Host interface to bind (default: 127.0.0.1)
  --open                  Automatically open dashboard in default browser
  --config-dir <path>     Explicit OpenCode config directory to manage
  --project-dir <path>    Project directory containing local opencode.json
  --token <string>        Explicit session token (default: generated secure random hex)
  -h, --help              Show help information
  -v, --version           Show version information
```

---

## Architecture & Monorepo Structure

```text
├── packages/
│   ├── schemas/              # Zod schemas, OpenCode JSON schema validator, operation types
│   ├── opencode-adapter/     # OS path resolution, JSONC comment preservation, atomic file writes, ops engine
│   ├── core/                 # Diagnostics engine, real connectivity prober, backups manager, AI assistant planner
│   └── cli/                  # CLI launcher, port finder, browser launcher, packaged web bundle
└── apps/
    └── web/                  # Next.js 16 App Router frontend, Tailwind CSS, Monaco editor, REST APIs
```

---

## Configuration File Support

OpenCode Companion detects configuration files according to the official OpenCode precedence:

1. **Custom Flag / Env**: `--config-dir`, `$OPENCODE_CONFIG_DIR`, `$OPENCODE_CONFIG`
2. **Project Local**: `./opencode.json` or `./opencode.jsonc` in active project
3. **Global User**: `~/.config/opencode/opencode.json` (Linux/macOS/Termux) or `%USERPROFILE%\.config\opencode\opencode.json` (Windows)
4. **System Managed**: `/etc/opencode/opencode.json` (Linux), `/Library/Application Support/opencode/` (macOS), `%ProgramData%\opencode\` (Windows)

Edits write cleanly to the primary active configuration file (`opencode.json`), preserving comments and structure.

---

## Security & Privacy Model

- **Localhost Only**: Binds strictly to loopback interface `127.0.0.1` by default.
- **CSRF & Origin Protection**: All mutations require anti-CSRF headers and reject mismatched Origin headers.
- **Secret Redaction**: API keys and auth tokens are masked with HMAC-SHA256 placeholders (`{secret:hash}`) inside the Monaco editor and diff previews.
- **Safe Command Confirmation**: Testing local MCP servers requiring process execution prompts for explicit human approval before running.
- **Safety Backups**: Every write automatically creates an immutable snapshot under `~/.opencode-companion/backups/`.

---

## Development & Testing

```bash
# Install dependencies
npm install

# Run unit tests (Vitest)
npm test

# Run type checking
npm run typecheck

# Run linter
npm run lint

# Build full distribution bundle
npm run build

# Run end-to-end smoke tests (real CLI startup, security tests, API route checks)
npm run smoke

# Check npm package distribution readiness
npm run pack:check
```

---

## License

MIT © OpenCode Companion Contributors
