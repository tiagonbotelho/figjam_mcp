# FigJam MCP Server

An MCP server that enables AI agents to manipulate a live FigJam canvas in real time via a companion Figma plugin.

## Architecture

```
AI Agent ↔ MCP Server (stdio) ↔ Bridge (Express + WS) ↔ FigJam Plugin (in Figma)
```

The system has two components:

1. **MCP Server + Bridge** — A Node.js process that speaks MCP over stdio and runs an embedded WebSocket bridge server. The bridge relays commands to the FigJam plugin and returns results.
2. **FigJam Plugin** — A Figma plugin that runs inside the FigJam editor, connects to the bridge via WebSocket, and executes Figma Plugin API calls to create/update/delete elements on the board.

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

### 2. Import the FigJam plugin

1. Open Figma Desktop
2. Open a FigJam board
3. Go to **Menu → Plugins → Development → Import plugin from manifest...**
4. Select `figma-plugin/manifest.json` from this project
5. The plugin will appear under **Plugins → Development → FigJam MCP**

### 3. Run the plugin

In your FigJam board, launch the plugin from **Plugins → Development → FigJam MCP**. It will auto-connect to the bridge server.

### 4. Configure your MCP client

See [MCP Client Configuration](#mcp-client-configuration) below.

## MCP Tools

| Tool | Description |
|------|-------------|
| `connect_figjam` | Open a new FigJam board and wait for the plugin to connect |
| `create_sticky` | Create a sticky note (text, position, color) |
| `create_shape` | Create a shape with text (type, position, size, color) |
| `create_text` | Create a text node (text, position, font size) |
| `create_connector` | Connect two elements with an optional label |
| `create_section` | Create a section for grouping elements |
| `update_element` | Update element properties (position, size, text, color) |
| `delete_element` | Remove an element by ID |
| `query_elements` | List elements, optionally filtered by type |
| `validate_layout` | Check for truncation, overlaps, bleed, and tight connectors |
| `batch_create` | Create multiple elements in one call with cross-referencing |
| `align_elements` | Align elements (left/center/right/top/middle/bottom) |
| `distribute_elements` | Distribute elements with even spacing |
| `clear_board` | Remove all elements from the board |
| `get_board_info` | Get board metadata (page name, element counts) |

## MCP Resources & Prompts

| Type | Name | Description |
|------|------|-------------|
| Resource | `figjam://schema` | Element reference — shape types, color palette, sizes, layout rules |
| Prompt | `draw_diagram` | Step-by-step workflow for creating well-structured diagrams |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BRIDGE_PORT` | Port for the WebSocket bridge server | `3000` |

## MCP Client Configuration

### GitHub Copilot CLI 

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
# Claude Code
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

## How It Works

1. The MCP server starts and launches an embedded Express + WebSocket bridge on `BRIDGE_PORT`
2. When you run the FigJam plugin in Figma, it connects to the bridge via WebSocket
3. AI agent calls an MCP tool (e.g., `create_sticky`)
4. The MCP server sends a command over WebSocket to the plugin
5. The plugin executes the Figma Plugin API call and returns the result
6. The MCP server returns the result to the agent

## Troubleshooting

- **"FigJam plugin is not connected"** — Make sure the FigJam MCP plugin is running in your Figma editor. Open it from Plugins → Development → FigJam MCP.
- **Plugin won't connect** — Verify the bridge server is running (check the health endpoint: `curl http://localhost:3000/health`). Ensure the port matches.
- **Command timeout** — Commands timeout after 15 seconds. This may happen if the plugin is busy or if font loading is slow (first text/shape creation).
- **Plugin not appearing in Figma** — You need to use the Figma Desktop app. Import the plugin via Development → Import plugin from manifest, pointing to `figma-plugin/manifest.json`.

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
