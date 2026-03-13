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
  await sleep(100); // let Express settle before first request
  const healthRes = await fetch(`http://localhost:${BRIDGE_PORT}/health`);
  const health = await healthRes.json();
  assert(health.status === 'ok', 'Health status is ok');
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

  // ── Snapshot & Restore Tests ──────────────────────────────────────

  // 11. Snapshot board command relayed and response returned
  console.log('\nTest: snapshot_board command relay');
  const mockPlugin3 = await connectMockPlugin();
  await sleep(100);

  const mockSnapshot = {
    version: 1,
    pageName: 'Test Board',
    createdAt: '2026-01-01T00:00:00.000Z',
    elements: {
      sections: [{ id: '1:1', type: 'SECTION', name: 'Backend', x: 0, y: 0, width: 600, height: 400 }],
      shapes: [{ id: '1:2', type: 'SHAPE_WITH_TEXT', shapeType: 'ROUNDED_RECTANGLE', text: 'API Server', x: 50, y: 80, width: 200, height: 100, color: 'LIGHT_BLUE' }],
      stickies: [{ id: '1:3', type: 'STICKY', text: 'Note', x: 300, y: 0, width: 240, height: 240, color: 'LIGHT_YELLOW', isWideWidth: false }],
      textNodes: [{ id: '1:4', type: 'TEXT', text: 'Title', x: 0, y: -40, width: 50, height: 20, fontSize: 24 }],
      connectors: [],
    },
    totalCount: 4,
  };

  mockPlugin3.on('message', (data) => {
    const cmd = JSON.parse(data.toString());
    if (cmd.type === 'snapshot_board') {
      mockPlugin3.send(JSON.stringify({ id: cmd.id, success: true, data: mockSnapshot }));
    }
  });

  const snapResult = await bridge.sendCommand('snapshot_board', {});
  assert(snapResult.success === true, 'snapshot_board succeeded');
  assert(snapResult.data.version === 1, 'Snapshot has version 1');
  assert(snapResult.data.totalCount === 4, 'Snapshot has 4 elements');
  assert(snapResult.data.elements.sections.length === 1, 'Snapshot has 1 section');
  assert(snapResult.data.elements.shapes.length === 1, 'Snapshot has 1 shape');
  assert(snapResult.data.elements.stickies.length === 1, 'Snapshot has 1 sticky');
  assert(snapResult.data.elements.textNodes.length === 1, 'Snapshot has 1 text node');

  // 12. Restore snapshot command relayed with snapshot data
  console.log('\nTest: restore_snapshot command relay');
  mockPlugin3.removeAllListeners('message');

  const restoreResult = { restored: true, createdCount: 4, idMap: { '1:1': '2:1', '1:2': '2:2', '1:3': '2:3', '1:4': '2:4' } };

  mockPlugin3.on('message', (data) => {
    const cmd = JSON.parse(data.toString());
    if (cmd.type === 'restore_snapshot') {
      // Verify the snapshot data was relayed correctly
      assert(cmd.params.snapshot !== undefined, 'restore_snapshot receives snapshot param');
      assert(cmd.params.snapshot.elements.sections.length === 1, 'Relayed snapshot has sections');
      mockPlugin3.send(JSON.stringify({ id: cmd.id, success: true, data: restoreResult }));
    }
  });

  const restResult = await bridge.sendCommand('restore_snapshot', { snapshot: mockSnapshot });
  assert(restResult.success === true, 'restore_snapshot succeeded');
  assert(restResult.data.restored === true, 'Board was restored');
  assert(restResult.data.createdCount === 4, 'Restored 4 elements');
  assert(Object.keys(restResult.data.idMap).length === 4, 'ID map has 4 entries');

  // 13. Snapshot with connectors includes endpoint IDs
  console.log('\nTest: snapshot with connectors');
  mockPlugin3.removeAllListeners('message');

  const snapshotWithConnectors = {
    version: 1,
    pageName: 'Test',
    createdAt: '2026-01-01T00:00:00.000Z',
    elements: {
      sections: [],
      shapes: [
        { id: '3:1', type: 'SHAPE_WITH_TEXT', shapeType: 'ROUNDED_RECTANGLE', text: 'A', x: 0, y: 0, width: 200, height: 100, color: 'LIGHT_BLUE' },
        { id: '3:2', type: 'SHAPE_WITH_TEXT', shapeType: 'ENG_DATABASE', text: 'B', x: 400, y: 0, width: 160, height: 120, color: 'LIGHT_GREEN' },
      ],
      stickies: [],
      textNodes: [],
      connectors: [
        { id: '3:3', type: 'CONNECTOR', startElementId: '3:1', endElementId: '3:2', label: 'reads from', x: 0, y: 0, width: 0, height: 0 },
      ],
    },
    totalCount: 3,
  };

  mockPlugin3.on('message', (data) => {
    const cmd = JSON.parse(data.toString());
    if (cmd.type === 'restore_snapshot') {
      const connectors = cmd.params.snapshot.elements.connectors;
      assert(connectors.length === 1, 'Snapshot has 1 connector');
      assert(connectors[0].startElementId === '3:1', 'Connector has correct startElementId');
      assert(connectors[0].endElementId === '3:2', 'Connector has correct endElementId');
      assert(connectors[0].label === 'reads from', 'Connector has correct label');
      mockPlugin3.send(JSON.stringify({
        id: cmd.id,
        success: true,
        data: { restored: true, createdCount: 3, idMap: { '3:1': '4:1', '3:2': '4:2', '3:3': '4:3' } },
      }));
    }
  });

  const connRestResult = await bridge.sendCommand('restore_snapshot', { snapshot: snapshotWithConnectors });
  assert(connRestResult.success === true, 'restore_snapshot with connectors succeeded');
  assert(connRestResult.data.createdCount === 3, 'Restored 3 elements (2 shapes + 1 connector)');

  mockPlugin3.close();
  await sleep(100);

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
