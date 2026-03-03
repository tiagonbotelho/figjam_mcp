# FigJam MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple.svg)](https://modelcontextprotocol.io)

> Let AI agents draw on a live FigJam canvas in real time — architecture diagrams, flowcharts, mind maps, and more.

An [MCP](https://modelcontextprotocol.io) server that gives AI agents (GitHub Copilot, Claude, Cursor, etc.) the ability to create, update, and manipulate elements on a FigJam board through a companion Figma plugin.

## What Can You Do With It?

Just describe what you want to your AI agent and it will build it on the canvas:

- 🏗️ *"Draw a microservices architecture for an e-commerce platform"*
- 🔄 *"Create a CI/CD pipeline diagram for our GitHub Actions workflow"*
- 🗺️ *"Map out the user authentication flow with OAuth2"*
- 📊 *"Build an ER diagram for the database schema"*
- 🧠 *"Create a mind map of our Q3 product roadmap"*

The agent plans the layout, picks the right shapes and colors, draws connectors with labels, and validates the result — all in one go.

## Architecture

```
┌──────────┐   stdio    ┌─────────────────────────────┐   WebSocket   ┌──────────────────┐
│ AI Agent │ ◄────────► │  MCP Server + Bridge (Node) │ ◄──────────► │  FigJam Plugin   │
│ (Copilot,│            │                             │              │  (runs in Figma) │
│  Claude, │            │  • MCP protocol handler     │              │                  │
│  Cursor) │            │  • Express + WS bridge      │              │  • Executes      │
└──────────┘            │  • Command routing          │              │    Figma API     │
                        └─────────────────────────────┘              │  • Auto-reconnect│
                                                                     └──────────────────┘
```

The system has two components:

1. **MCP Server + Bridge** — A Node.js process that speaks MCP over stdio and runs an embedded WebSocket bridge server. The bridge relays commands to the FigJam plugin and returns results.
2. **FigJam Plugin** — A Figma plugin that runs inside the FigJam editor, connects to the bridge via WebSocket, and executes Figma Plugin API calls on the board. It auto-reconnects if the connection drops.

## Prerequisites

- **Node.js >= 18**
- **Figma Desktop App** (required for running development plugins)
- A FigJam board open in Figma (or use `connect_figjam` to create one automatically)

## Quick Start

### 1. Build the project

```bash
npm ci
npm run build
```

### 2. Configure your MCP client

Add the server to your AI tool of choice — see [MCP Client Configuration](#mcp-client-configuration) for copy-paste configs for GitHub Copilot, Claude, Cursor, and more.

### 3. Import the FigJam plugin

1. Open Figma Desktop
2. Open a FigJam board (or any Figma file)
3. Go to **Menu → Plugins → Development → Import plugin from manifest...**
4. Select `figma-plugin/manifest.json` from this repo
5. The plugin will appear under **Plugins → Development → FigJam MCP**

> **Tip:** You only need to import the plugin once — it persists across Figma sessions.

### 4. Start drawing

1. Open a FigJam board in Figma
2. Launch the plugin from **Plugins → Development → FigJam MCP** (it auto-connects to the bridge)
3. Ask your AI agent to draw something — e.g. *"Create an architecture diagram for a REST API"*

Alternatively, you can ask the agent to call `connect_figjam` which will create a new board and wait for the plugin connection automatically (macOS with Figma Desktop).

## MCP Tools

### Connection & Board Management

| Tool | Description |
|------|-------------|
| `connect_figjam` | Create a new FigJam board and wait for the plugin to connect |
| `get_board_info` | Get board metadata (page name, element counts) |
| `clear_board` | Remove all elements from the board |

### Creating Elements

| Tool | Description |
|------|-------------|
| `create_shape` | Create a shape with text — the primary building block (10+ shape types) |
| `create_sticky` | Create a sticky note for annotations (fixed 240×240 size) |
| `create_text` | Create a standalone text label |
| `create_connector` | Connect two elements with an optional label |
| `create_section` | Create a section container to group elements |
| `batch_create` | Create multiple elements in one call with cross-referencing |

### Modifying & Querying

| Tool | Description |
|------|-------------|
| `update_element` | Update position, size, text, or color of any element |
| `delete_element` | Remove an element by ID |
| `query_elements` | List elements, optionally filtered by type |

### Layout & Validation

| Tool | Description |
|------|-------------|
| `validate_layout` | Check for truncation, overlaps, bleed, and tight connectors |
| `align_elements` | Align elements (left/center/right/top/middle/bottom) |
| `distribute_elements` | Distribute elements with even spacing |

### Resources & Prompts

| Type | Name | Description |
|------|------|-------------|
| Resource | `figjam://schema` | Element reference — shape types, color palette, sizes, and layout rules |
| Prompt | `draw_diagram` | Guided workflow for building well-structured diagrams |

## MCP Client Configuration

### GitHub Copilot (VS Code / CLI)

Config location: `~/.copilot/mcp-config.json`

```json
{
  "mcpServers": {
    "figjam": {
      "command": "node",
      "args": ["/absolute/path/to/figjam-mcp/dist/index.js"],
      "env": {
        "BRIDGE_PORT": "3000"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add figjam --scope user \
  -e BRIDGE_PORT=3000 \
  -- node /absolute/path/to/figjam-mcp/dist/index.js
```

### Claude Desktop

Config location:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "figjam": {
      "command": "node",
      "args": ["/absolute/path/to/figjam-mcp/dist/index.js"],
      "env": {
        "BRIDGE_PORT": "3000"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "figjam": {
      "command": "node",
      "args": ["/absolute/path/to/figjam-mcp/dist/index.js"],
      "env": {
        "BRIDGE_PORT": "3000"
      }
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BRIDGE_PORT` | Port for the WebSocket bridge server | `3000` |

## How It Works

1. The MCP server starts and launches an embedded Express + WebSocket bridge on `BRIDGE_PORT`
2. When you run the FigJam plugin in Figma, it connects to the bridge via WebSocket
3. The AI agent calls an MCP tool (e.g. `create_shape`)
4. The MCP server sends a command over WebSocket to the plugin
5. The plugin executes the Figma Plugin API call and returns the result
6. The MCP server returns the result to the agent

The plugin auto-reconnects every 3 seconds if the connection drops, so you can restart the MCP server without needing to re-launch the plugin.

## Project Structure

```
figjam-mcp/
├── src/
│   ├── index.ts          # MCP server — tool definitions, resources, and prompts
│   ├── bridge.ts         # Express + WebSocket bridge server
│   └── types.ts          # Shared types (commands, responses)
├── figma-plugin/
│   ├── manifest.json     # Figma plugin manifest
│   ├── code.ts           # Plugin main thread — Figma API execution
│   └── ui.html           # Plugin UI — WebSocket client with auto-reconnect
├── test/
│   └── integration.mjs   # Integration tests
└── dist/                 # Built output
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"FigJam plugin is not connected"** | Make sure the FigJam MCP plugin is running in your Figma editor. Open it from **Plugins → Development → FigJam MCP**. |
| **Plugin won't connect** | Check the bridge is running: `curl http://localhost:3000/health`. Ensure the port matches your `BRIDGE_PORT`. |
| **Port already in use** | A previous instance may still be running. Run `lsof -ti :3000 \| xargs kill -9` or set a different `BRIDGE_PORT`. |
| **Command timeout** | Commands timeout after 15s. This may happen if the plugin is busy or font loading is slow on the first text creation. |
| **Plugin not appearing in Figma** | You must use the Figma Desktop app. Import via **Development → Import plugin from manifest**, pointing to `figma-plugin/manifest.json`. |

## Development

```bash
npm run type-check    # Type-check without emitting
npm run dev           # Watch mode for server code
npm run build         # Build everything (server + plugin)
npm run build:server  # Build server only
npm run build:plugin  # Build plugin only
```

### Testing

```bash
node test/integration.mjs   # Run integration tests
```

## License

MIT
