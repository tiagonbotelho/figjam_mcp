#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { exec, execSync } from 'child_process';
import { BridgeServer } from './bridge.js';

const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '3000', 10);

const bridge = new BridgeServer(BRIDGE_PORT);

const server = new McpServer({
  name: 'figjam-mcp',
  version: '0.1.0',
});

// ── Helpers ──────────────────────────────────────────────────────────
function isFigmaDesktopInstalled(): boolean {
  if (process.platform !== 'darwin') return false;
  try {
    const result = execSync(
      'mdfind "kMDItemCFBundleIdentifier == \'com.figma.Desktop\'" 2>/dev/null',
      { encoding: 'utf-8' },
    ).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

function createFigJamInDesktopApp(name?: string): void {
  // Use AppleScript to set the clipboard to a Figma URL that the desktop app's
  // internal navigation config maps to a new FigJam (whiteboard) editor, then
  // trigger "Open File URL From Clipboard" from the File menu.
  // The ?name= query param sets the board title (decoded by Figma's navigation config).
  let url = 'https://www.figma.com/board/new';
  if (name) {
    url += `?name=${encodeURIComponent(name)}`;
  }
  execSync(`osascript \
    -e 'tell application "Figma" to activate' \
    -e 'delay 0.5' \
    -e 'set the clipboard to "${url}"' \
    -e 'delay 0.2' \
    -e 'tell application "System Events"' \
    -e '  tell process "Figma"' \
    -e '    click menu item "Open File URL From Clipboard" of menu "File" of menu bar 1' \
    -e '  end tell' \
    -e 'end tell'`, { stdio: 'ignore' });
}

// ── MCP Resource: figjam://schema ────────────────────────────────────
server.resource(
  'figjam-schema',
  'figjam://schema',
  { description: 'FigJam element schema reference — shape types, color palette, sizes, and layout rules' },
  async () => ({
    contents: [{
      uri: 'figjam://schema',
      mimeType: 'text/markdown',
      text: `# FigJam Element Schema

## Shape Types
| shapeType | Use for | Suggested size |
|-----------|---------|---------------|
| ROUNDED_RECTANGLE | Services, components, modules, APIs | 200×100 |
| ENG_DATABASE | Databases, data stores, caches | 160×120 |
| ENG_QUEUE | Message queues, event buses, brokers | 160×100 |
| ENG_FILE | Files, documents, configs | 140×120 |
| ENG_FOLDER | Folders, packages, modules | 160×120 |
| DIAMOND | Decisions, conditions, branching | 160×160 |
| ELLIPSE | Start/end points, events, triggers | 160×100 |
| PARALLELOGRAM_RIGHT | Input/output, data flow | 200×100 |
| SQUARE | Generic blocks, steps | 120×120 |
| TRIANGLE_UP | Warnings, alerts, gateways | 140×140 |

## Color Palette (always prefer LIGHT_* for readability)
| Name | Hex | Best for |
|------|-----|----------|
| LIGHT_BLUE | #C2E5FF | Default shapes, services |
| LIGHT_GREEN | #CDF4D3 | Success states, databases, healthy |
| LIGHT_VIOLET | #E4CCFF | External services, third-party |
| LIGHT_YELLOW | #FFECBD | Notes, warnings, stickies |
| LIGHT_ORANGE | #FFE0C2 | Queues, async, pending |
| LIGHT_RED | #FFCDC2 | Errors, critical, alerts |
| LIGHT_PINK | #FFC2EC | User-facing, frontend |
| LIGHT_TEAL | #C6FAF6 | Networking, communication |
| LIGHT_GRAY | #D9D9D9 | Disabled, inactive, auxiliary |
| WHITE | #FFFFFF | Backgrounds, clean sections |

## Element Sizes & Spacing
- Shapes: default 200×100, resizable to any size
- Stickies: FIXED 240×240 (wide: 440×240), NOT resizable
- Sections: default 600×400, use for grouping; section header is ~40px tall
- **Minimum gap between connected elements: 80px** (so connectors have room for arrows and labels)
- Minimum gap between unconnected elements: 50px
- Place shapes inside sections with at least 40px padding from section edges (60px from top for header)
- When planning positions, always account for connector labels needing visible space between shapes

## Connectors
- Connect any two shapes/stickies by ID
- Use \`label\` for relationship annotations (e.g. "REST API", "publishes", "reads from")
- Prefer labels on connectors instead of placing stickies next to arrows

## Text Nodes (create_text)
- Use VERY SPARINGLY — prefer connector labels and shape text instead
- NEVER place a text node on top of or overlapping a shape or connector
- If you need a standalone annotation, use a sticky instead (fixed size, won't overlap)
- Text nodes are best for board titles or isolated notes far from diagram elements

## Stickies
- Use SPARINGLY — only for annotations, tradeoffs, or callouts
- Place OUTSIDE the main diagram flow to avoid overlap
- For diagram elements, use shapes instead

## Sections
- Use for grouping related elements (subsystems, layers, domains)
- No background color by default — keep clean
- Create sections FIRST, then place shapes inside their bounds
`,
    }],
  }),
);

// ── MCP Prompt: draw_diagram ─────────────────────────────────────────
server.prompt(
  'draw_diagram',
  'Step-by-step guide for creating a well-structured FigJam diagram',
  { topic: z.string().describe('What the diagram should depict (e.g. "microservices architecture", "CI/CD pipeline")') },
  ({ topic }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Create a FigJam diagram about: ${topic}

Follow this workflow:

## Step 1: Plan the layout
Before creating any elements, plan the full diagram:
- Identify all nodes (components, services, entities) and their types
- Identify all connections between nodes with labels
- Decide on logical groupings (sections)
- Plan a left-to-right or top-to-bottom flow

## Step 2: Read the schema
Call the figjam://schema resource to understand available shapes, colors, and sizes.

## Step 3: Create sections first
If the diagram has logical groupings, create sections to contain them.
Make sections large enough: width = (number_of_shapes_across × shape_width) + (gaps × 80px) + 120px padding.
Height = (number_of_rows × shape_height) + (row_gaps × 80px) + 120px padding (60px top for header).

## Step 4: Create shapes
Create all shapes using appropriate shapeType for each element:
- ROUNDED_RECTANGLE for services/components
- ENG_DATABASE for databases
- ENG_QUEUE for queues/message brokers
- DIAMOND for decisions
- ELLIPSE for start/end points
Use LIGHT_* colors. Place shapes inside their parent sections.
Size shapes to fit their text content (estimate ~8px per character width).
**CRITICAL: Space shapes at least 80px apart** so connectors between them have room for arrows and labels.
Example: if a shape is 200px wide at x=100, the next shape horizontally should start at x=380 (100+200+80).

## Step 5: Create connectors with labels
Connect shapes using create_connector. ALWAYS add a label describing the relationship.
Use labels instead of stickies for annotations on connections.

## Step 6: Add annotations (sparingly)
Only add stickies for important callouts (tradeoffs, notes, API signatures).
Place them OUTSIDE the main diagram flow.
**AVOID standalone text nodes (create_text)** — use connector labels or shape text instead.
If you must use a text node, place it far from any shapes/connectors to avoid overlap.

## Step 7: Validate layout (MANDATORY)
Call validate_layout to check for:
- Text truncated in shapes (resize the shape if so)
- Overlapping elements including text nodes (reposition to fix)
- Connectors routing through shapes (reposition shapes so connector path is clear)
- Elements bleeding outside sections (resize section or move element)
- Tight connectors (< 80px between connected elements — move elements apart)
Keep calling validate_layout until zero issues remain.

## Step 8: Final alignment
Use align_elements and distribute_elements to clean up the layout.
Use spacing >= 80 when elements have connectors between them for breathing room.
distribute_elements auto-resizes parent sections, but verify with validate_layout.
`,
      },
    }],
  }),
);

// ── Tool: connect_figjam ─────────────────────────────────────────────
server.tool(
  'connect_figjam',
  'Create a new FigJam board and wait for the plugin to connect. ' +
  'On macOS with Figma Desktop installed, creates the board directly in the desktop app. ' +
  'If the plugin is already connected, returns immediately.',
  {
    name: z
      .string()
      .optional()
      .describe('Name for the new FigJam board (optional)'),
    timeoutSeconds: z
      .number()
      .optional()
      .describe('How long to wait for the plugin to connect (default: 60)'),
  },
  async ({ name, timeoutSeconds }) => {
    // If already connected, return immediately
    if (bridge.isPluginConnected()) {
      return {
        content: [{
          type: 'text' as const,
          text: 'FigJam plugin is already connected and ready.',
        }],
      };
    }

    const hasDesktopApp = isFigmaDesktopInstalled();

    if (hasDesktopApp) {
      try {
        createFigJamInDesktopApp(name);
        console.error(`[mcp] Created new FigJam board in Figma desktop app${name ? `: ${name}` : ''}`);
      } catch (err) {
        console.error('[mcp] AppleScript failed, falling back to browser:', err);
        exec('open "https://figjam.new"');
      }
    } else {
      const openCmd = process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${openCmd} "https://figjam.new"`);
      console.error('[mcp] Opened figjam.new in browser (Figma Desktop not found)');
    }

    const timeout = (timeoutSeconds ?? 60) * 1000;
    const connected = await bridge.waitForConnection(timeout);

    if (connected) {
      return {
        content: [{
          type: 'text' as const,
          text: 'FigJam board created and plugin connected — ready to go!',
        }],
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: 'FigJam board opened but the plugin has not connected yet. ' +
          'Please activate the plugin in your FigJam board: ' +
          'Plugins → Development → FigJam MCP, then try calling connect_figjam again.',
      }],
      isError: true,
    };
  }
);

// ── Tool: create_sticky ──────────────────────────────────────────────
server.tool(
  'create_sticky',
  'Create a sticky note. USE SPARINGLY — only for annotations or callouts beside the diagram. ' +
  'Fixed size: 240×240 (or 440×240 if wide). Cannot be resized. ' +
  'See figjam://schema for color palette.',
  {
    text: z.string().describe('Text content of the sticky note — keep it brief'),
    x: z.number().optional().describe('X position (default: 0)'),
    y: z.number().optional().describe('Y position (default: 0)'),
    wide: z
      .boolean()
      .optional()
      .describe('If true, creates a wide rectangular sticky (440×240) instead of square (240×240)'),
    color: z
      .enum([
        'LIGHT_YELLOW', 'LIGHT_ORANGE', 'LIGHT_GREEN', 'LIGHT_BLUE',
        'LIGHT_VIOLET', 'LIGHT_PINK', 'LIGHT_RED', 'LIGHT_TEAL',
        'LIGHT_GRAY', 'YELLOW', 'BLUE', 'GREEN', 'VIOLET', 'RED',
        'ORANGE', 'PINK', 'TEAL', 'DARK_GRAY',
      ])
      .optional()
      .describe('Sticky note color. Prefer LIGHT_* variants for readability (default: LIGHT_YELLOW)'),
  },
  async ({ text, x, y, wide, color }) => {
    const res = await bridge.sendCommand('create_sticky', {
      text, x: x ?? 0, y: y ?? 0, wide: wide ?? false, color: color ?? 'LIGHT_YELLOW',
    });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: create_shape ───────────────────────────────────────────────
server.tool(
  'create_shape',
  'Create a shape with text — the PRIMARY building block for diagrams. ' +
  'Resizable to any size. See figjam://schema for shape types, colors, and sizing guide.',
  {
    shapeType: z
      .enum(['SQUARE', 'ELLIPSE', 'ROUNDED_RECTANGLE', 'DIAMOND', 'TRIANGLE_UP', 'TRIANGLE_DOWN', 'PARALLELOGRAM_RIGHT', 'PARALLELOGRAM_LEFT', 'ENG_DATABASE', 'ENG_QUEUE', 'ENG_FILE', 'ENG_FOLDER'])
      .describe('Shape type — pick the shape that best matches the element semantics'),
    text: z.string().optional().describe('Text inside the shape'),
    x: z.number().optional().describe('X position (default: 0)'),
    y: z.number().optional().describe('Y position (default: 0)'),
    width: z.number().optional().describe('Width in px (default: 200). Shapes are resizable to any size'),
    height: z.number().optional().describe('Height in px (default: 100). Shapes are resizable to any size'),
    color: z
      .enum([
        'LIGHT_BLUE', 'LIGHT_GREEN', 'LIGHT_VIOLET', 'LIGHT_YELLOW',
        'LIGHT_ORANGE', 'LIGHT_RED', 'LIGHT_PINK', 'LIGHT_TEAL',
        'LIGHT_GRAY', 'WHITE',
        'BLUE', 'GREEN', 'VIOLET', 'YELLOW', 'ORANGE', 'RED',
        'PINK', 'TEAL', 'GRAY', 'DARK_GRAY', 'BLACK',
      ])
      .optional()
      .describe('Shape fill color. ALWAYS prefer LIGHT_* variants for readable dark text on light background (default: LIGHT_BLUE)'),
  },
  async ({ shapeType, text, x, y, width, height, color }) => {
    const res = await bridge.sendCommand('create_shape', {
      shapeType: shapeType ?? 'ROUNDED_RECTANGLE',
      text: text ?? '',
      x: x ?? 0,
      y: y ?? 0,
      width: width ?? 200,
      height: height ?? 100,
      color: color ?? 'LIGHT_BLUE',
    });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: create_text ────────────────────────────────────────────────
server.tool(
  'create_text',
  'Create a standalone text label on the FigJam board. ' +
  'Use for titles, section headers, or annotation labels that sit outside shapes. ' +
  'For text inside diagram elements, use create_shape with a text param instead.',
  {
    text: z.string().describe('Text content'),
    x: z.number().optional().describe('X position (default: 0)'),
    y: z.number().optional().describe('Y position (default: 0)'),
    fontSize: z.number().optional().describe('Font size (default: 16)'),
  },
  async ({ text, x, y, fontSize }) => {
    const res = await bridge.sendCommand('create_text', {
      text,
      x: x ?? 0,
      y: y ?? 0,
      fontSize: fontSize ?? 16,
    });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: create_connector ───────────────────────────────────────────
server.tool(
  'create_connector',
  'Create a connector (arrow) between two elements on the FigJam board. ' +
  'Both elements must already exist. Connectors auto-route between shapes. ' +
  'Use the label param to annotate the connection (e.g. "REST API", "publishes events", "reads from"). ' +
  'Prefer labels over stickies for describing relationships between elements.',
  {
    startElementId: z.string().describe('ID of the element the connector starts from'),
    endElementId: z.string().describe('ID of the element the connector ends at'),
    label: z.string().optional().describe('Text label displayed at the midpoint of the connector (e.g. "HTTP", "gRPC", "WebSocket", "publishes")'),
    strokeColor: z.string().optional().describe('Connector stroke color — named preset or hex'),
  },
  async ({ startElementId, endElementId, label, strokeColor }) => {
    const res = await bridge.sendCommand('create_connector', {
      startElementId,
      endElementId,
      label,
      strokeColor,
    });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: create_section ─────────────────────────────────────────────
server.tool(
  'create_section',
  'Create a section (container) on the FigJam board to visually group related elements. ' +
  'Sections are large labeled containers — use them to encapsulate subsystems, layers, or logical groupings ' +
  'in architecture diagrams. Create the section FIRST, then place child shapes INSIDE its bounds ' +
  '(i.e. shape x/y must be within section x/y to x+width/y+height). ' +
  'The section name appears as a header label above the contained area. ' +
  'Sections have no background color by default — keep them clean.',
  {
    name: z.string().describe('Section title displayed as header label (e.g. "Backend Services", "Data Layer")'),
    x: z.number().optional().describe('X position (default: 0)'),
    y: z.number().optional().describe('Y position (default: 0)'),
    width: z.number().optional().describe('Width in px (default: 600). Make large enough to contain child elements with padding'),
    height: z.number().optional().describe('Height in px (default: 400). Make large enough to contain child elements with padding'),
  },
  async ({ name, x, y, width, height }) => {
    const res = await bridge.sendCommand('create_section', {
      name,
      x: x ?? 0,
      y: y ?? 0,
      width: width ?? 600,
      height: height ?? 400,
    });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: update_element ─────────────────────────────────────────────
server.tool(
  'update_element',
  'Update properties of an existing element on the FigJam board. ' +
  'Use to move, resize, recolor, or change text of shapes, sections, and text nodes. ' +
  'Shapes and sections CAN be resized by passing width/height. ' +
  'Stickies CANNOT be resized (fixed at 240×240).',
  {
    id: z.string().describe('ID of the element to update'),
    x: z.number().optional().describe('New X position'),
    y: z.number().optional().describe('New Y position'),
    width: z.number().optional().describe('New width in px (works on shapes, sections, text — NOT stickies)'),
    height: z.number().optional().describe('New height in px (works on shapes, sections, text — NOT stickies)'),
    text: z.string().optional().describe('New text content (for stickies, shapes, text nodes)'),
    color: z.string().optional().describe('New fill color — use named presets (LIGHT_BLUE, LIGHT_GREEN, etc.) or hex like "#C2E5FF". Prefer LIGHT_* variants'),
  },
  async ({ id, ...updates }) => {
    const res = await bridge.sendCommand('update_element', { id, ...updates });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: delete_element ─────────────────────────────────────────────
server.tool(
  'delete_element',
  'Delete an element from the FigJam board',
  {
    id: z.string().describe('ID of the element to delete'),
  },
  async ({ id }) => {
    const res = await bridge.sendCommand('delete_element', { id });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: query_elements ─────────────────────────────────────────────
server.tool(
  'query_elements',
  'List elements on the FigJam board, optionally filtered by type',
  {
    type: z
      .enum(['STICKY', 'SHAPE_WITH_TEXT', 'TEXT', 'CONNECTOR', 'SECTION', 'ALL'])
      .optional()
      .describe('Filter by element type (default: ALL)'),
  },
  async ({ type }) => {
    const res = await bridge.sendCommand('query_elements', { type: type ?? 'ALL' });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: validate_layout ─────────────────────────────────────────────
server.tool(
  'validate_layout',
  'MANDATORY — call after creating a diagram. Checks for: ' +
  'text truncation, overlapping elements, section bleed (elements outside section bounds), ' +
  'and tight connectors (< 80px gap between connected shapes). ' +
  'Fix each issue with update_element, then re-validate until zero issues remain.',
  {},
  async () => {
    const res = await bridge.sendCommand('validate_layout', {});
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: batch_create ────────────────────────────────────────────────
const batchElementSchema = z.object({
  type: z.enum(['shape', 'sticky', 'text', 'connector', 'section']).describe('Element type to create'),
  refId: z.string().optional().describe('Temporary reference ID for this element — use in connectors to reference elements created in the same batch'),
  // Shape params
  shapeType: z.enum(['SQUARE', 'ELLIPSE', 'ROUNDED_RECTANGLE', 'DIAMOND', 'TRIANGLE_UP', 'TRIANGLE_DOWN', 'PARALLELOGRAM_RIGHT', 'PARALLELOGRAM_LEFT', 'ENG_DATABASE', 'ENG_QUEUE', 'ENG_FILE', 'ENG_FOLDER']).optional(),
  text: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional().describe('Named color preset (LIGHT_BLUE, etc.) or hex'),
  // Sticky params
  wide: z.boolean().optional(),
  // Text params
  fontSize: z.number().optional(),
  // Connector params
  startElementId: z.string().optional().describe('ID or refId of the start element'),
  endElementId: z.string().optional().describe('ID or refId of the end element'),
  label: z.string().optional().describe('Connector label text'),
  strokeColor: z.string().optional(),
  // Section params
  name: z.string().optional().describe('Section name'),
});

server.tool(
  'batch_create',
  'Create multiple elements in a single call — ideal for building entire diagrams at once. ' +
  'Accepts an array of element specs. Use refId on elements and reference them in connector startElementId/endElementId ' +
  'to wire up connections within the same batch. Elements are created in order (create sections first, then shapes, then connectors). ' +
  'Returns all created element IDs mapped to their refIds.',
  {
    elements: z.array(batchElementSchema).describe('Array of elements to create. Order: sections first, then shapes/stickies/text, then connectors'),
  },
  async ({ elements: specs }) => {
    const refIdMap = new Map<string, string>();
    const results: Array<{ refId?: string; id: string; type: string }> = [];
    const errors: string[] = [];

    for (const spec of specs) {
      try {
        let res;
        const resolveRef = (id: string) => refIdMap.get(id) ?? id;

        switch (spec.type) {
          case 'section':
            res = await bridge.sendCommand('create_section', {
              name: spec.name ?? 'Section',
              x: spec.x ?? 0, y: spec.y ?? 0,
              width: spec.width ?? 600, height: spec.height ?? 400,
            });
            break;
          case 'shape':
            res = await bridge.sendCommand('create_shape', {
              shapeType: spec.shapeType ?? 'ROUNDED_RECTANGLE',
              text: spec.text ?? '', x: spec.x ?? 0, y: spec.y ?? 0,
              width: spec.width ?? 200, height: spec.height ?? 100,
              color: spec.color ?? 'LIGHT_BLUE',
            });
            break;
          case 'sticky':
            res = await bridge.sendCommand('create_sticky', {
              text: spec.text ?? '', x: spec.x ?? 0, y: spec.y ?? 0,
              wide: spec.wide ?? false, color: spec.color ?? 'LIGHT_YELLOW',
            });
            break;
          case 'text':
            res = await bridge.sendCommand('create_text', {
              text: spec.text ?? '', x: spec.x ?? 0, y: spec.y ?? 0,
              fontSize: spec.fontSize ?? 16,
            });
            break;
          case 'connector':
            res = await bridge.sendCommand('create_connector', {
              startElementId: resolveRef(spec.startElementId ?? ''),
              endElementId: resolveRef(spec.endElementId ?? ''),
              label: spec.label, strokeColor: spec.strokeColor,
            });
            break;
        }

        if (res?.success && res.data) {
          const created = res.data as { id: string };
          if (spec.refId) refIdMap.set(spec.refId, created.id);
          results.push({ refId: spec.refId, id: created.id, type: spec.type });
        } else {
          errors.push(`${spec.type}${spec.refId ? ` (${spec.refId})` : ''}: ${res?.error ?? 'unknown error'}`);
        }
      } catch (err: any) {
        errors.push(`${spec.type}${spec.refId ? ` (${spec.refId})` : ''}: ${err.message}`);
      }
    }

    const output = { created: results, count: results.length, errors: errors.length > 0 ? errors : undefined };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(output) }],
      isError: errors.length > 0 && results.length === 0,
    };
  }
);

// ── Tool: align_elements ─────────────────────────────────────────────
server.tool(
  'align_elements',
  'Align multiple elements along an axis. ' +
  'Also auto-resizes any parent sections to fit their children after alignment.',
  {
    elementIds: z.array(z.string()).describe('IDs of elements to align'),
    alignment: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom'])
      .describe('Alignment axis: left/center/right for horizontal, top/middle/bottom for vertical'),
  },
  async ({ elementIds, alignment }) => {
    const res = await bridge.sendCommand('align_elements', { elementIds, alignment });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: distribute_elements ────────────────────────────────────────
server.tool(
  'distribute_elements',
  'Distribute elements evenly with equal spacing. ' +
  'Enforces a minimum gap (default 60px) so elements and connectors between them are never too tight. ' +
  'Also auto-resizes any parent sections to fit their children after distribution.',
  {
    elementIds: z.array(z.string()).describe('IDs of elements to distribute (at least 3 for meaningful distribution)'),
    direction: z.enum(['horizontal', 'vertical'])
      .describe('Distribution direction'),
    spacing: z.number().optional()
      .describe('Minimum gap in pixels between elements (default: 60). Increase for diagrams with connectors that need breathing room.'),
  },
  async ({ elementIds, direction, spacing }) => {
    const res = await bridge.sendCommand('distribute_elements', { elementIds, direction, spacing });
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: clear_board ────────────────────────────────────────────────
server.tool(
  'clear_board',
  'Delete ALL elements from the FigJam board to start with a clean canvas. Use before creating a new diagram.',
  {},
  async () => {
    const res = await bridge.sendCommand('clear_board', {});
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Tool: get_board_info ─────────────────────────────────────────────
server.tool(
  'get_board_info',
  'Get metadata about the current FigJam board (page name, element count, etc.)',
  {},
  async () => {
    const res = await bridge.sendCommand('get_board_info', {});
    return {
      content: [{ type: 'text' as const, text: res.success ? JSON.stringify(res.data) : `Error: ${res.error}` }],
      isError: !res.success,
    };
  }
);

// ── Start ────────────────────────────────────────────────────────────
async function main() {
  await bridge.start();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] FigJam MCP server running (stdio)');
}

main().catch((err) => {
  console.error('[mcp] Fatal error:', err);
  process.exit(1);
});
