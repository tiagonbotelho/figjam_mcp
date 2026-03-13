import type { PluginResponse } from './types.js';

/**
 * Converts a PluginResponse into the MCP tool result format.
 * Eliminates the repeated `{ content: [{ type, text }], isError }` block
 * that was duplicated across every tool handler.
 */
export function formatToolResponse(res: PluginResponse) {
  return {
    content: [
      {
        type: 'text' as const,
        text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}`,
      },
    ],
    isError: !res.success,
  };
}
