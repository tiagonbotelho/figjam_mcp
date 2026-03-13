// Centralised configuration constants for the FigJam MCP server.

export const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '3000', 10);

export const COMMAND_TIMEOUT_MS = 15_000;

export const CONNECTION_DEFAULTS = {
  timeoutMs: 60_000,
  pollIntervalMs: 2_000,
} as const;

export const ELEMENT_DEFAULTS = {
  shape: { width: 200, height: 100, color: 'LIGHT_BLUE', shapeType: 'ROUNDED_RECTANGLE' },
  sticky: { color: 'LIGHT_YELLOW', wide: false },
  text: { fontSize: 16 },
  section: { width: 600, height: 400 },
  position: { x: 0, y: 0 },
} as const;
