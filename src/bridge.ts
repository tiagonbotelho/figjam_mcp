import express from 'express';
import cors from 'cors';
import { createServer, type Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  type PluginCommand,
  type PluginResponse,
  type CommandResolver,
  generateCommandId,
} from './types.js';

const COMMAND_TIMEOUT_MS = 15_000;

export class BridgeServer {
  private app = express();
  private server: Server;
  private wss: WebSocketServer;
  private pluginSocket: WebSocket | null = null;
  private pendingCommands = new Map<string, CommandResolver>();
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.app.use(cors());
    this.app.use(express.json());

    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        pluginConnected: this.isPluginConnected(),
        pendingCommands: this.pendingCommands.size,
      });
    });

    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocket();
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      console.error('[bridge] FigJam plugin connected');
      this.pluginSocket = ws;

      ws.on('message', (data) => {
        try {
          const response: PluginResponse = JSON.parse(data.toString());
          this.handlePluginResponse(response);
        } catch (err) {
          console.error('[bridge] Failed to parse plugin message:', err);
        }
      });

      ws.on('close', () => {
        console.error('[bridge] FigJam plugin disconnected');
        if (this.pluginSocket === ws) {
          this.pluginSocket = null;
        }
        // Reject all pending commands
        for (const [id, resolver] of this.pendingCommands) {
          clearTimeout(resolver.timer);
          resolver.resolve({
            id,
            success: false,
            error: 'Plugin disconnected',
          });
        }
        this.pendingCommands.clear();
      });

      ws.on('error', (err) => {
        console.error('[bridge] WebSocket error:', err);
      });
    });
  }

  private handlePluginResponse(response: PluginResponse): void {
    const resolver = this.pendingCommands.get(response.id);
    if (!resolver) {
      console.error(`[bridge] No pending command for id: ${response.id}`);
      return;
    }
    clearTimeout(resolver.timer);
    this.pendingCommands.delete(response.id);
    resolver.resolve(response);
  }

  isPluginConnected(): boolean {
    return (
      this.pluginSocket !== null &&
      this.pluginSocket.readyState === WebSocket.OPEN
    );
  }

  waitForConnection(timeoutMs: number = 60_000, pollIntervalMs: number = 2_000): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.isPluginConnected()) {
        resolve(true);
        return;
      }

      const deadline = Date.now() + timeoutMs;
      const interval = setInterval(() => {
        if (this.isPluginConnected()) {
          clearInterval(interval);
          resolve(true);
        } else if (Date.now() >= deadline) {
          clearInterval(interval);
          resolve(false);
        }
      }, pollIntervalMs);
    });
  }

  sendCommand(type: string, params: Record<string, unknown>): Promise<PluginResponse> {
    return new Promise((resolve) => {
      if (!this.isPluginConnected()) {
        resolve({
          id: '',
          success: false,
          error:
            'FigJam plugin is not connected. Please open the FigJam MCP plugin in your Figma editor.',
        });
        return;
      }

      const id = generateCommandId();
      const command: PluginCommand = { id, type, params };

      const timer = setTimeout(() => {
        this.pendingCommands.delete(id);
        resolve({
          id,
          success: false,
          error: `Command timed out after ${COMMAND_TIMEOUT_MS}ms`,
        });
      }, COMMAND_TIMEOUT_MS);

      this.pendingCommands.set(id, { resolve, timer });
      this.pluginSocket!.send(JSON.stringify(command));
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.error(`[bridge] Bridge server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const [id, resolver] of this.pendingCommands) {
        clearTimeout(resolver.timer);
        resolver.resolve({ id, success: false, error: 'Server shutting down' });
      }
      this.pendingCommands.clear();
      this.wss.close();
      this.server.close(() => resolve());
    });
  }
}
