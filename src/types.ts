import crypto from 'crypto';

// Command sent from bridge to plugin
export interface PluginCommand {
  id: string;
  type: string;
  params: Record<string, unknown>;
}

// Response sent from plugin back to bridge
export interface PluginResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type CommandResolver = {
  resolve: (response: PluginResponse) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function generateCommandId(): string {
  return crypto.randomUUID();
}
