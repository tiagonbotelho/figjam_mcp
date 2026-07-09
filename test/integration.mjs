// Integration test: Bridge server + mock FigJam plugin WebSocket
// Run with: node test/integration.mjs

import { WebSocket } from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const BRIDGE_PORT = 3999; // Use a different port for testing
const POEM_PROMPT_BRIDGE_PORT = 3998; // Separate port so the stdio server can run alongside the bridge test
process.env.BRIDGE_PORT = String(BRIDGE_PORT);

const { BridgeServer } = await import('../dist/bridge.js');

let bridge;
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectMockPlugin() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${BRIDGE_PORT}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function createChildEnv(extraEnv = {}) {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...extraEnv }).filter(([, value]) => value !== undefined)
  );
}

function testCreateChildEnv() {
  console.log('\nTest: Child env helper merges and filters values');

  const env = createChildEnv({ FIGJAM_TEST_VALUE: 'ok', FIGJAM_UNDEFINED: undefined });
  assert(env.FIGJAM_TEST_VALUE === 'ok', 'createChildEnv merges additional environment variables');
  assert(!('FIGJAM_UNDEFINED' in env), 'createChildEnv filters undefined values');
}

async function testPoemPrompt() {
  console.log('\nTest: MCP poem prompt is available');

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['./dist/index.js'],
    cwd: process.cwd(),
    env: createChildEnv({ BRIDGE_PORT: String(POEM_PROMPT_BRIDGE_PORT) }),
    stderr: 'pipe',
  });
  const client = new Client({ name: 'figjam-mcp-test-client', version: '1.0.0' });

  try {
    await client.connect(transport);

    const prompts = await client.listPrompts();
    const poemPrompt = prompts.prompts.find((prompt) => prompt.name === 'write_poem');
    assert(!!poemPrompt, 'write_poem prompt is listed');
    assert(poemPrompt?.description === 'Write an original poem', 'write_poem prompt exposes the expected description');

    const defaultPrompt = await client.getPrompt({ name: 'write_poem' });
    const defaultMessage = defaultPrompt.messages[0];
    assert(defaultMessage?.role === 'user', 'write_poem prompt returns a user message');
    assert(defaultMessage?.content.type === 'text', 'write_poem prompt returns text content');
    assert(defaultMessage?.content.text === 'Write an original poem.', 'write_poem prompt has the default poem request');
  } finally {
    await transport.close();
  }
}

async function main() {
  console.log('\n=== FigJam MCP Integration Tests ===\n');

  // 1. Start bridge server
  console.log('Test: Bridge server starts');
  bridge = new BridgeServer(BRIDGE_PORT);
  await bridge.start();
  assert(true, 'Bridge server started');

  // 2. Health check (no plugin connected)
  console.log('\nTest: Health check without plugin');
  const healthRes = await fetch(`http://localhost:${BRIDGE_PORT}/health`);
  const health = await healthRes.json();
  assert(health.status === 'healthy', 'Health status is healthy');
  assert(health.pluginConnected === false, 'Plugin not connected');

  // 3. Send command without plugin → should error
  console.log('\nTest: Command without plugin connected');
  const errResult = bridge.sendCommand('create_sticky', { text: 'test' });
  const errRes = await errResult;
  assert(errRes.success === false, 'Command fails without plugin');
  assert(errRes.error.includes('not connected'), 'Error mentions not connected');

  // 4. Connect mock plugin
  console.log('\nTest: Mock plugin connects');
  const mockPlugin = await connectMockPlugin();
  await sleep(100);
  assert(bridge.isPluginConnected(), 'Plugin is connected');

  // 5. Send command → mock plugin receives and responds
  console.log('\nTest: Command relay to plugin');
  mockPlugin.on('message', (data) => {
    const cmd = JSON.parse(data.toString());
    // Simulate plugin response
    mockPlugin.send(
      JSON.stringify({
        id: cmd.id,
        success: true,
        data: { id: '42:1', type: 'STICKY', text: cmd.params.text, x: cmd.params.x, y: cmd.params.y },
      })
    );
  });

  const result = await bridge.sendCommand('create_sticky', {
    text: 'Hello',
    x: 100,
    y: 200,
    color: 'YELLOW',
  });
  assert(result.success === true, 'Command succeeded');
  assert(result.data.text === 'Hello', 'Response data has correct text');
  assert(result.data.x === 100, 'Response data has correct x');

  // 6. waitForConnection — already connected returns immediately
  console.log('\nTest: waitForConnection when already connected');
  const alreadyConnected = await bridge.waitForConnection(1000);
  assert(alreadyConnected === true, 'waitForConnection returns true when already connected');

  // 7. Plugin disconnect → pending commands rejected
  console.log('\nTest: Plugin disconnect rejects pending');
  mockPlugin.removeAllListeners('message');

  const pendingPromise = bridge.sendCommand('query_elements', { type: 'ALL' });
  await sleep(50);
  mockPlugin.close();
  await sleep(100);

  const pendingRes = await pendingPromise;
  assert(pendingRes.success === false, 'Pending command rejected on disconnect');
  assert(!bridge.isPluginConnected(), 'Plugin no longer connected');

  // 8. waitForConnection — times out when no plugin
  console.log('\nTest: waitForConnection times out');
  const timedOut = await bridge.waitForConnection(500, 100);
  assert(timedOut === false, 'waitForConnection returns false on timeout');

  // 9. waitForConnection — succeeds when plugin connects during wait
  console.log('\nTest: waitForConnection succeeds mid-wait');
  const waitPromise = bridge.waitForConnection(5000, 100);
  await sleep(200);
  const mockPlugin2 = await connectMockPlugin();
  const midWaitResult = await waitPromise;
  assert(midWaitResult === true, 'waitForConnection returns true when plugin connects during wait');
  mockPlugin2.close();
  await sleep(100);

  // 10. Health check after disconnect
  console.log('\nTest: Health check after disconnect');
  const health2Res = await fetch(`http://localhost:${BRIDGE_PORT}/health`);
  const health2 = await health2Res.json();
  assert(health2.pluginConnected === false, 'Plugin shows disconnected');

  // 11. Test helper behavior
  testCreateChildEnv();

  // 12. MCP prompt exposure
  await testPoemPrompt();

  // Cleanup
  await bridge.stop();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test failed:', err);
  if (bridge) bridge.stop();
  process.exit(1);
});
