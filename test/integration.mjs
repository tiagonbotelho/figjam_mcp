// Integration test: Bridge server + mock FigJam plugin WebSocket
// Run with: node test/integration.mjs

import { WebSocket } from 'ws';

const BRIDGE_PORT = 3999; // Use a different port for testing
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
