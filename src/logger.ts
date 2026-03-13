// Lightweight tagged logger that writes to stderr (MCP convention).

export type LogTag = 'bridge' | 'mcp';

function makeLogger(tag: LogTag) {
  const prefix = `[${tag}]`;
  return {
    info: (...args: unknown[]) => console.error(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
}

export const logger = {
  bridge: makeLogger('bridge'),
  mcp: makeLogger('mcp'),
};
