# Hermes Agent — VS Code / Antigravity IDE Extension

Autonomous AI coding agent with chat, kanban task management, and native editor integration via ACP.

## Features

- **Chat sidebar** — talk to Hermes (Grok 4.3) directly in your editor
- **Kanban task board** — create, track, and dispatch tasks to specialist agent profiles
- **Multi-agent swarms** — parallel workers → verifier → synthesizer pipelines
- **ACP integration** — native editor features: file ops, terminal, browser, approvals
- **Status bar** — connection status, active task count

## Requirements

- **Hermes API server** running on `http://localhost:8642` (managed by `hermes gateway`)
- **Hermes CLI** at `/Users/varunpratapbhardwaj/.local/bin/hermes` (for ACP + kanban)
- VS Code or Antigravity IDE ≥ 1.85

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `hermes.apiUrl` | `http://localhost:8642` | Hermes API server URL |
| `hermes.autoConnect` | `true` | Auto-connect on startup |
| `hermes.acpEnabled` | `true` | Enable ACP subprocess (native editor integration) |
| `hermes.acpPath` | `/Users/.../.local/bin/hermes` | Path to hermes binary |
| `hermes.pollIntervalMs` | `5000` | Kanban poll interval (ms) |

## Commands

| Command | Description |
|---------|-------------|
| `Hermes: Connect` | Connect to Hermes API server |
| `Hermes: Disconnect` | Disconnect from Hermes |
| `Hermes: Open Chat` | Open chat sidebar |
| `Hermes: Create Task` | Create a new kanban task |
| `Hermes: New Swarm` | Spawn a multi-agent swarm |
| `Hermes: Dispatch Tasks` | Run dispatcher on ready tasks |
| `Hermes: Refresh` | Refresh kanban tree |

## Development

```bash
npm install
npm run compile
npm run watch        # watch mode
npm run package      # build .vsix
```

## Architecture

```
extension.ts
├── HermesClient (HTTP → port 8642)
│   ├── /health
│   └── /v1/chat/completions
├── StatusBarManager
├── KanbanTreeProvider (hermes kanban * CLI)
├── SidebarChatProvider (webview)
├── AcpManager (hermes acp --accept-hooks subprocess)
└── commands.ts
```
