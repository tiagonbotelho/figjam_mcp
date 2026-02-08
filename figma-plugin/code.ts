// FigJam MCP Plugin — Main Thread
// Receives commands from the UI (WebSocket bridge) and executes Figma Plugin API calls.

figma.showUI(__html__, { width: 300, height: 320, visible: true });

interface PluginCommand {
  id: string;
  type: string;
  params: Record<string, any>;
}

interface PluginResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

function sendResponse(response: PluginResponse) {
  figma.ui.postMessage({ type: 'response', response });
}

function serializeNode(node: SceneNode): Record<string, any> {
  const base: Record<string, any> = {
    id: node.id,
    name: node.name,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };

  if ('characters' in node) {
    base.text = (node as any).characters;
  }
  if ('text' in node && node.type === 'SHAPE_WITH_TEXT') {
    base.text = (node as ShapeWithTextNode).text.characters;
  }
  if (node.type === 'CONNECTOR') {
    var connText = (node as ConnectorNode).text.characters;
    if (connText) base.label = connText;
  }

  return base;
}

function findNodeById(id: string): SceneNode | null {
  return figma.currentPage.findOne((n) => n.id === id);
}

// ── Command Handlers ──────────────────────────────────────────────────

async function handleCreateSticky(params: Record<string, any>): Promise<any> {
  var sticky = figma.createSticky();
  sticky.text.characters = params.text || '';
  sticky.x = params.x ?? 0;
  sticky.y = params.y ?? 0;

  if (params.wide) {
    sticky.isWideWidth = true;
  }

  if (params.color) {
    sticky.fills = [{ type: 'SOLID', color: resolveColor(params.color) }];
  }

  return serializeNode(sticky);
}

async function handleCreateShape(params: Record<string, any>): Promise<any> {
  var shape = figma.createShapeWithText();
  shape.shapeType = params.shapeType || 'ROUNDED_RECTANGLE';
  shape.x = params.x ?? 0;
  shape.y = params.y ?? 0;
  shape.resize(params.width ?? 200, params.height ?? 100);

  if (params.text) {
    await figma.loadFontAsync(shape.text.fontName as FontName);
    shape.text.characters = params.text;
  }

  if (params.color) {
    shape.fills = [{ type: 'SOLID', color: resolveColor(params.color) }];
  }

  return serializeNode(shape);
}

async function handleCreateText(params: Record<string, any>): Promise<any> {
  const text = figma.createText();
  await figma.loadFontAsync(text.fontName as FontName);
  text.characters = params.text || '';
  text.x = params.x ?? 0;
  text.y = params.y ?? 0;
  text.fontSize = params.fontSize ?? 16;

  return serializeNode(text);
}

async function handleCreateConnector(params: Record<string, any>): Promise<any> {
  const startNode = findNodeById(params.startElementId);
  const endNode = findNodeById(params.endElementId);

  if (!startNode) throw new Error(`Start element not found: ${params.startElementId}`);
  if (!endNode) throw new Error(`End element not found: ${params.endElementId}`);

  const connector = figma.createConnector();
  connector.connectorStart = { endpointNodeId: startNode.id, magnet: 'AUTO' };
  connector.connectorEnd = { endpointNodeId: endNode.id, magnet: 'AUTO' };

  if (params.label) {
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    connector.text.characters = params.label;
  }

  if (params.strokeColor) {
    connector.strokes = [{ type: 'SOLID', color: resolveColor(params.strokeColor) }];
  }

  return serializeNode(connector);
}

async function handleCreateSection(params: Record<string, any>): Promise<any> {
  var section = figma.createSection();
  section.name = params.name || 'Section';
  section.x = params.x ?? 0;
  section.y = params.y ?? 0;
  section.resizeWithoutConstraints(params.width ?? 600, params.height ?? 400);

  return serializeNode(section);
}

async function handleUpdateElement(params: Record<string, any>): Promise<any> {
  const node = findNodeById(params.id);
  if (!node) throw new Error(`Element not found: ${params.id}`);

  if (params.x !== undefined) node.x = params.x;
  if (params.y !== undefined) node.y = params.y;
  if (params.width !== undefined || params.height !== undefined) {
    var newW = params.width !== undefined ? params.width : node.width;
    var newH = params.height !== undefined ? params.height : node.height;
    if (node.type === 'SECTION') {
      (node as SectionNode).resizeWithoutConstraints(newW, newH);
    } else if ('resize' in node) {
      (node as any).resize(newW, newH);
    }
  }

  if (params.text !== undefined) {
    if ('characters' in node) {
      const textNode = node as TextNode;
      await figma.loadFontAsync(textNode.fontName as FontName);
      textNode.characters = params.text;
    } else if (node.type === 'SHAPE_WITH_TEXT') {
      const shapeNode = node as ShapeWithTextNode;
      await figma.loadFontAsync(shapeNode.text.fontName as FontName);
      shapeNode.text.characters = params.text;
    } else if (node.type === 'STICKY') {
      const stickyNode = node as StickyNode;
      await figma.loadFontAsync(stickyNode.text.fontName as FontName);
      stickyNode.text.characters = params.text;
    }
  }

  if (params.color !== undefined && 'fills' in node) {
    (node as GeometryMixin & SceneNode).fills = [
      { type: 'SOLID', color: resolveColor(params.color) },
    ];
  }

  return serializeNode(node);
}

async function handleDeleteElement(params: Record<string, any>): Promise<any> {
  const node = findNodeById(params.id);
  if (!node) throw new Error(`Element not found: ${params.id}`);

  const info = serializeNode(node);
  node.remove();
  return { deleted: true, ...info };
}

async function handleQueryElements(params: Record<string, any>): Promise<any> {
  const children = figma.currentPage.children;
  let nodes = Array.from(children);

  if (params.type && params.type !== 'ALL') {
    nodes = nodes.filter((n) => n.type === params.type);
  }

  return {
    elements: nodes.map(serializeNode),
    count: nodes.length,
  };
}

async function handleValidateLayout(): Promise<any> {
  var allNodes = figma.currentPage.findAll();
  var children = figma.currentPage.children;
  var issues: Array<{ type: string; elementId: string; elementName: string; details: string; suggestion: string }> = [];

  // Collect bounding boxes for overlap detection (skip connectors)
  // Use absolute coords for page-level nodes
  var boxes: Array<{ id: string; name: string; x: number; y: number; w: number; h: number; nodeType: string }> = [];

  for (var i = 0; i < children.length; i++) {
    var node = children[i];

    // Check text truncation in shapes
    if (node.type === 'SHAPE_WITH_TEXT') {
      var shape = node as ShapeWithTextNode;
      var textContent = shape.text.characters;
      if (textContent && textContent.length > 0) {
        var fontSize = 14;
        try { fontSize = (shape.text.fontSize as number) || 14; } catch (e) { /* mixed sizes */ }
        var charWidth = fontSize * 0.55;
        var padding = 40;
        var availableWidth = shape.width - padding;
        var availableHeight = shape.height - padding;
        var charsPerLine = Math.max(1, Math.floor(availableWidth / charWidth));
        var linesNeeded = Math.ceil(textContent.length / charsPerLine);
        var lineHeight = fontSize * 1.4;
        var textHeight = linesNeeded * lineHeight;

        if (textHeight > availableHeight) {
          var suggestedHeight = Math.ceil(textHeight + padding + 20);
          var suggestedWidth = shape.width;
          if (textContent.length > charsPerLine * 2) {
            suggestedWidth = Math.max(shape.width, Math.ceil(textContent.length * charWidth / 2 + padding));
          }
          issues.push({
            type: 'text_truncated',
            elementId: shape.id,
            elementName: shape.name,
            details: 'Text "' + textContent.substring(0, 40) + (textContent.length > 40 ? '...' : '') + '" likely truncated in ' + Math.round(shape.width) + 'x' + Math.round(shape.height) + ' shape',
            suggestion: 'Resize to at least ' + suggestedWidth + 'x' + suggestedHeight + ' using update_element',
          });
        }
      }
    }

    // Collect bounding box (skip connectors only — include TEXT nodes for overlap detection)
    if (node.type !== 'CONNECTOR') {
      boxes.push({
        id: node.id,
        name: node.name,
        x: node.x,
        y: node.y,
        w: node.width,
        h: node.height,
        nodeType: node.type,
      });
    }
  }

  // Check for overlaps (excluding sections which contain elements)
  for (var a = 0; a < boxes.length; a++) {
    for (var b = a + 1; b < boxes.length; b++) {
      var boxA = boxes[a];
      var boxB = boxes[b];

      if (boxA.nodeType === 'SECTION' || boxB.nodeType === 'SECTION') continue;

      var overlapX = boxA.x < boxB.x + boxB.w && boxA.x + boxA.w > boxB.x;
      var overlapY = boxA.y < boxB.y + boxB.h && boxA.y + boxA.h > boxB.y;

      if (overlapX && overlapY) {
        var ox1 = Math.max(boxA.x, boxB.x);
        var oy1 = Math.max(boxA.y, boxB.y);
        var ox2 = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
        var oy2 = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);
        var overlapArea = (ox2 - ox1) * (oy2 - oy1);
        var smallerArea = Math.min(boxA.w * boxA.h, boxB.w * boxB.h);

        if (overlapArea > smallerArea * 0.1) {
          issues.push({
            type: 'overlap',
            elementId: boxA.id,
            elementName: boxA.name + ' ↔ ' + boxB.name,
            details: '"' + boxA.name + '" overlaps "' + boxB.name + '" by ' + Math.round(overlapArea) + 'px²',
            suggestion: 'Move ' + boxB.id + ' to avoid overlap using update_element',
          });
        }
      }
    }
  }

  // Check for tight spacing between connected elements
  var MIN_CONNECTOR_GAP = 80;
  for (var ci = 0; ci < allNodes.length; ci++) {
    var cn = allNodes[ci];
    if (cn.type !== 'CONNECTOR') continue;
    var conn = cn as ConnectorNode;
    var startEnd = conn.connectorStart;
    var endEnd = conn.connectorEnd;
    if (!('endpointNodeId' in startEnd) || !('endpointNodeId' in endEnd)) continue;

    var startNode = findNodeById(startEnd.endpointNodeId);
    var endNode = findNodeById(endEnd.endpointNodeId);
    if (!startNode || !endNode) continue;

    // Calculate gap between the two connected elements
    // Horizontal distance (negative means overlap)
    var gapH: number;
    if (startNode.x + startNode.width <= endNode.x) {
      gapH = endNode.x - (startNode.x + startNode.width);
    } else if (endNode.x + endNode.width <= startNode.x) {
      gapH = startNode.x - (endNode.x + endNode.width);
    } else {
      gapH = -1; // overlapping horizontally
    }
    // Vertical distance (negative means overlap)
    var gapV: number;
    if (startNode.y + startNode.height <= endNode.y) {
      gapV = endNode.y - (startNode.y + startNode.height);
    } else if (endNode.y + endNode.height <= startNode.y) {
      gapV = startNode.y - (endNode.y + endNode.height);
    } else {
      gapV = -1; // overlapping vertically
    }

    // Determine the effective connector gap:
    // If shapes are separated on one axis, that's the connector axis
    // If separated on both axes, use the smaller gap (diagonal connector)
    // If overlapping on both axes, the shapes overlap entirely (handled by overlap check)
    var effectiveGap = -1;
    if (gapH >= 0 && gapV >= 0) {
      effectiveGap = Math.min(gapH, gapV);
    } else if (gapH >= 0) {
      effectiveGap = gapH;  // side by side horizontally
    } else if (gapV >= 0) {
      effectiveGap = gapV;  // stacked vertically
    }

    if (effectiveGap >= 0 && effectiveGap < MIN_CONNECTOR_GAP) {
      var connLabel = conn.text.characters || '(unlabeled)';
      // Include direction hint in suggestion
      var moveDir = (gapH >= 0 && (gapV < 0 || gapH <= gapV)) ? 'horizontally' : 'vertically';
      var moveAmount = MIN_CONNECTOR_GAP - effectiveGap;
      issues.push({
        type: 'tight_connector',
        elementId: conn.id,
        elementName: 'Connector: ' + connLabel,
        details: 'Only ' + Math.round(effectiveGap) + 'px gap ' + moveDir + ' between "' + startNode.name + '" and "' + endNode.name + '" — connector arrow/label compressed',
        suggestion: 'Move ' + endNode.id + ' at least ' + Math.round(moveAmount) + 'px ' + moveDir + ' to create ' + MIN_CONNECTOR_GAP + 'px gap',
      });
    }
  }

  // Check for connectors routing through intermediate shapes
  // For each connector, check if any non-endpoint shape's bounding box
  // intersects the straight line between the two connected elements' centers
  for (var ci2 = 0; ci2 < allNodes.length; ci2++) {
    var cn2 = allNodes[ci2];
    if (cn2.type !== 'CONNECTOR') continue;
    var conn2 = cn2 as ConnectorNode;
    var s2 = conn2.connectorStart;
    var e2 = conn2.connectorEnd;
    if (!('endpointNodeId' in s2) || !('endpointNodeId' in e2)) continue;

    var sn2 = findNodeById(s2.endpointNodeId);
    var en2 = findNodeById(e2.endpointNodeId);
    if (!sn2 || !en2) continue;

    // Line from center of start node to center of end node
    var lx1 = sn2.x + sn2.width / 2;
    var ly1 = sn2.y + sn2.height / 2;
    var lx2 = en2.x + en2.width / 2;
    var ly2 = en2.y + en2.height / 2;

    for (var bi = 0; bi < boxes.length; bi++) {
      var bx = boxes[bi];
      if (bx.nodeType === 'SECTION' || bx.nodeType === 'TEXT') continue;
      if (bx.id === sn2.id || bx.id === en2.id) continue;

      // Check if the line segment intersects the bounding box of this shape
      // Use Liang-Barsky line clipping algorithm
      var dx = lx2 - lx1;
      var dy = ly2 - ly1;
      var p = [-dx, dx, -dy, dy];
      var q = [lx1 - bx.x, bx.x + bx.w - lx1, ly1 - bx.y, bx.y + bx.h - ly1];
      var u1 = 0, u2 = 1;
      var intersects = true;
      for (var k = 0; k < 4; k++) {
        if (p[k] === 0) {
          if (q[k] < 0) { intersects = false; break; }
        } else {
          var t = q[k] / p[k];
          if (p[k] < 0) { if (t > u1) u1 = t; }
          else { if (t < u2) u2 = t; }
        }
      }
      if (intersects && u1 <= u2) {
        var connLabel2 = conn2.text.characters || '(unlabeled)';
        issues.push({
          type: 'connector_through_shape',
          elementId: conn2.id,
          elementName: 'Connector: ' + connLabel2,
          details: 'Connector between "' + sn2.name + '" and "' + en2.name + '" passes through "' + bx.name + '"',
          suggestion: 'Move "' + bx.name + '" (' + bx.id + ') out of the connector path, or reposition "' + sn2.name + '" or "' + en2.name + '" so the connector routes around "' + bx.name + '"',
        });
      }
    }
  }

  // Check for elements bleeding outside their parent sections
  // Two approaches: (a) actual section children (relative coords), (b) visual containment (page coords)
  for (var s = 0; s < children.length; s++) {
    var sNode = children[s];
    if (sNode.type !== 'SECTION') continue;
    var sec = sNode as SectionNode;
    var SECTION_PADDING = 40; // header height + padding

    // (a) Check actual children of the section (relative coordinates)
    var secChildren = sec.children;
    for (var sc = 0; sc < secChildren.length; sc++) {
      var sChild = secChildren[sc];
      if (sChild.type === 'CONNECTOR') continue;
      var bleeds: string[] = [];
      if (sChild.x < 0) bleeds.push('left by ' + Math.round(-sChild.x) + 'px');
      if (sChild.x + sChild.width > sec.width) bleeds.push('right by ' + Math.round(sChild.x + sChild.width - sec.width) + 'px');
      if (sChild.y < SECTION_PADDING) bleeds.push('top by ' + Math.round(SECTION_PADDING - sChild.y) + 'px');
      if (sChild.y + sChild.height > sec.height) bleeds.push('bottom by ' + Math.round(sChild.y + sChild.height - sec.height) + 'px');

      if (bleeds.length > 0) {
        issues.push({
          type: 'section_bleed',
          elementId: sChild.id,
          elementName: sChild.name,
          details: '"' + sChild.name + '" bleeds outside section "' + sec.name + '" — ' + bleeds.join(', '),
          suggestion: 'Resize section ' + sec.id + ' to at least ' + Math.ceil(Math.max(sChild.x + sChild.width + 30, sec.width)) + 'x' + Math.ceil(Math.max(sChild.y + sChild.height + 30, sec.height)) + ' or move ' + sChild.id,
        });
      }
    }

    // (b) Check page-level elements whose center falls inside this section (visual containment)
    var secRight = sec.x + sec.width;
    var secBottom = sec.y + sec.height;
    for (var c = 0; c < boxes.length; c++) {
      var child = boxes[c];
      if (child.nodeType === 'SECTION') continue;
      if (child.id === sec.id) continue;

      var childCX = child.x + child.w / 2;
      var childCY = child.y + child.h / 2;
      var insideSection = childCX > sec.x && childCX < secRight && childCY > sec.y && childCY < secBottom;

      if (insideSection) {
        var vBleeds: string[] = [];
        if (child.x < sec.x + 10) vBleeds.push('left by ' + Math.round(sec.x + 10 - child.x) + 'px');
        if (child.x + child.w > secRight - 10) vBleeds.push('right by ' + Math.round(child.x + child.w - secRight + 10) + 'px');
        if (child.y < sec.y + SECTION_PADDING) vBleeds.push('top by ' + Math.round(sec.y + SECTION_PADDING - child.y) + 'px');
        if (child.y + child.h > secBottom - 10) vBleeds.push('bottom by ' + Math.round(child.y + child.h - secBottom + 10) + 'px');

        if (vBleeds.length > 0) {
          issues.push({
            type: 'section_bleed',
            elementId: child.id,
            elementName: child.name,
            details: '"' + child.name + '" bleeds outside section "' + sec.name + '" — ' + vBleeds.join(', '),
            suggestion: 'Resize section ' + sec.id + ' to be larger or move/resize ' + child.id + ' to fit within section bounds',
          });
        }
      }
    }
  }

  return {
    issues: issues,
    issueCount: issues.length,
    summary: issues.length === 0 ? 'Layout is clean — no truncation, overlap, or spacing issues detected' : issues.length + ' issue(s) found — fix with update_element and re-validate',
  };
}

async function handleAlignElements(params: Record<string, any>): Promise<any> {
  var elementIds: string[] = params.elementIds || [];
  var alignment: string = params.alignment;
  var nodes: SceneNode[] = [];

  for (var i = 0; i < elementIds.length; i++) {
    var node = findNodeById(elementIds[i]);
    if (node) nodes.push(node);
  }

  if (nodes.length < 2) return { aligned: true, count: nodes.length };

  switch (alignment) {
    case 'left': {
      var minX = nodes[0].x;
      for (var i = 1; i < nodes.length; i++) { if (nodes[i].x < minX) minX = nodes[i].x; }
      for (var i = 0; i < nodes.length; i++) { nodes[i].x = minX; }
      break;
    }
    case 'right': {
      var maxRight = nodes[0].x + nodes[0].width;
      for (var i = 1; i < nodes.length; i++) {
        var r = nodes[i].x + nodes[i].width;
        if (r > maxRight) maxRight = r;
      }
      for (var i = 0; i < nodes.length; i++) { nodes[i].x = maxRight - nodes[i].width; }
      break;
    }
    case 'center': {
      var sumCX = 0;
      for (var i = 0; i < nodes.length; i++) { sumCX += nodes[i].x + nodes[i].width / 2; }
      var avgCX = sumCX / nodes.length;
      for (var i = 0; i < nodes.length; i++) { nodes[i].x = avgCX - nodes[i].width / 2; }
      break;
    }
    case 'top': {
      var minY = nodes[0].y;
      for (var i = 1; i < nodes.length; i++) { if (nodes[i].y < minY) minY = nodes[i].y; }
      for (var i = 0; i < nodes.length; i++) { nodes[i].y = minY; }
      break;
    }
    case 'bottom': {
      var maxBottom = nodes[0].y + nodes[0].height;
      for (var i = 1; i < nodes.length; i++) {
        var b = nodes[i].y + nodes[i].height;
        if (b > maxBottom) maxBottom = b;
      }
      for (var i = 0; i < nodes.length; i++) { nodes[i].y = maxBottom - nodes[i].height; }
      break;
    }
    case 'middle': {
      var sumCY = 0;
      for (var i = 0; i < nodes.length; i++) { sumCY += nodes[i].y + nodes[i].height / 2; }
      var avgCY = sumCY / nodes.length;
      for (var i = 0; i < nodes.length; i++) { nodes[i].y = avgCY - nodes[i].height / 2; }
      break;
    }
  }

  return { aligned: true, alignment: alignment, count: nodes.length, resizedSections: resizeParentSections(nodes) };
}

// Resize any parent sections so they wrap their children with padding
function resizeParentSections(nodes: SceneNode[]): string[] {
  var SECTION_PADDING = 40;
  var resized: string[] = [];
  var visited: Record<string, boolean> = {};

  for (var i = 0; i < nodes.length; i++) {
    var parent = nodes[i].parent;
    if (!parent || parent.type !== 'SECTION') continue;
    if (visited[parent.id]) continue;
    visited[parent.id] = true;

    var sec = parent as SectionNode;
    var children = sec.children;
    if (children.length === 0) continue;

    // Compute bounding box of all children (relative to section)
    var minX = children[0].x;
    var minY = children[0].y;
    var maxX = children[0].x + children[0].width;
    var maxY = children[0].y + children[0].height;
    for (var j = 1; j < children.length; j++) {
      var c = children[j];
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x + c.width > maxX) maxX = c.x + c.width;
      if (c.y + c.height > maxY) maxY = c.y + c.height;
    }

    // Shift children if they'd go negative relative to section origin
    var shiftX = minX < SECTION_PADDING ? SECTION_PADDING - minX : 0;
    var shiftY = minY < SECTION_PADDING ? SECTION_PADDING - minY : 0;
    if (shiftX > 0 || shiftY > 0) {
      for (var j = 0; j < children.length; j++) {
        children[j].x += shiftX;
        children[j].y += shiftY;
      }
      minX += shiftX; maxX += shiftX;
      minY += shiftY; maxY += shiftY;
    }

    var newW = maxX + SECTION_PADDING;
    var newH = maxY + SECTION_PADDING;
    if (newW > sec.width || newH > sec.height) {
      sec.resizeWithoutConstraints(
        Math.max(newW, sec.width),
        Math.max(newH, sec.height)
      );
      resized.push(sec.id);
    }
  }
  return resized;
}

async function handleDistributeElements(params: Record<string, any>): Promise<any> {
  var elementIds: string[] = params.elementIds || [];
  var direction: string = params.direction;
  var minSpacing: number = params.spacing != null ? params.spacing : 60;
  var nodes: SceneNode[] = [];

  for (var i = 0; i < elementIds.length; i++) {
    var node = findNodeById(elementIds[i]);
    if (node) nodes.push(node);
  }

  if (nodes.length < 3) return { distributed: true, count: nodes.length };

  if (direction === 'horizontal') {
    nodes.sort(function(a, b) { return a.x - b.x; });
    var firstLeft = nodes[0].x;
    var totalElementWidth = 0;
    for (var i = 0; i < nodes.length; i++) { totalElementWidth += nodes[i].width; }

    // Compute natural gap from current positions
    var lastRight = nodes[nodes.length - 1].x + nodes[nodes.length - 1].width;
    var naturalGap = ((lastRight - firstLeft) - totalElementWidth) / (nodes.length - 1);
    // Enforce minimum spacing
    var gap = Math.max(naturalGap, minSpacing);

    var currentX = firstLeft;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].x = currentX;
      currentX += nodes[i].width + gap;
    }
  } else {
    nodes.sort(function(a, b) { return a.y - b.y; });
    var firstTop = nodes[0].y;
    var totalElementHeight = 0;
    for (var i = 0; i < nodes.length; i++) { totalElementHeight += nodes[i].height; }

    var lastBottom = nodes[nodes.length - 1].y + nodes[nodes.length - 1].height;
    var naturalGapV = ((lastBottom - firstTop) - totalElementHeight) / (nodes.length - 1);
    var gapV = Math.max(naturalGapV, minSpacing);

    var currentY = firstTop;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].y = currentY;
      currentY += nodes[i].height + gapV;
    }
  }

  // Auto-resize parent sections to fit redistributed children
  var resizedSections = resizeParentSections(nodes);

  return {
    distributed: true,
    direction: direction,
    count: nodes.length,
    spacing: direction === 'horizontal' ? gap : gapV,
    resizedSections: resizedSections,
  };
}

async function handleClearBoard(): Promise<any> {
  var children = figma.currentPage.children;
  var count = children.length;
  for (var i = children.length - 1; i >= 0; i--) {
    children[i].remove();
  }
  return { cleared: true, removedCount: count };
}

async function handleGetBoardInfo(): Promise<any> {
  const page = figma.currentPage;
  const children = page.children;

  const typeCounts: Record<string, number> = {};
  for (const child of children) {
    typeCounts[child.type] = (typeCounts[child.type] || 0) + 1;
  }

  return {
    pageName: page.name,
    elementCount: children.length,
    typeCounts,
  };
}

// ── Color Presets ──────────────────────────────────────────────────────

var FIGJAM_COLORS: Record<string, string> = {
  // Light variants (preferred — readable with dark text)
  'LIGHT_BLUE':    '#C2E5FF',
  'LIGHT_GREEN':   '#CDF4D3',
  'LIGHT_VIOLET':  '#E4CCFF',
  'LIGHT_YELLOW':  '#FFECBD',
  'LIGHT_ORANGE':  '#FFE0C2',
  'LIGHT_RED':     '#FFCDC2',
  'LIGHT_PINK':    '#FFC2EC',
  'LIGHT_TEAL':    '#C6FAF6',
  'LIGHT_GRAY':    '#D9D9D9',
  // Full variants
  'BLUE':          '#3DADFF',
  'GREEN':         '#66D575',
  'VIOLET':        '#9747FF',
  'YELLOW':        '#FFC943',
  'ORANGE':        '#FF9E42',
  'RED':           '#FF7556',
  'PINK':          '#F849C1',
  'TEAL':          '#5AD8CC',
  'GRAY':          '#B3B3B3',
  'DARK_GRAY':     '#757575',
  'BLACK':         '#1E1E1E',
  'WHITE':         '#FFFFFF',
};

function resolveColor(color: string): RGB {
  var hex = FIGJAM_COLORS[color] || color;
  return hexToRgb(hex);
}

// ── Utilities ─────────────────────────────────────────────────────────

function hexToRgb(hex: string): RGB {
  var h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}

// ── Message Handler ───────────────────────────────────────────────────

figma.ui.onmessage = async (msg: { type: string; command?: PluginCommand }) => {
  if (msg.type !== 'command' || !msg.command) return;

  const { id, type, params } = msg.command;

  try {
    let data: any;

    switch (type) {
      case 'create_sticky':
        data = await handleCreateSticky(params);
        break;
      case 'create_shape':
        data = await handleCreateShape(params);
        break;
      case 'create_text':
        data = await handleCreateText(params);
        break;
      case 'create_connector':
        data = await handleCreateConnector(params);
        break;
      case 'create_section':
        data = await handleCreateSection(params);
        break;
      case 'update_element':
        data = await handleUpdateElement(params);
        break;
      case 'delete_element':
        data = await handleDeleteElement(params);
        break;
      case 'query_elements':
        data = await handleQueryElements(params);
        break;
      case 'validate_layout':
        data = await handleValidateLayout();
        break;
      case 'align_elements':
        data = await handleAlignElements(params);
        break;
      case 'distribute_elements':
        data = await handleDistributeElements(params);
        break;
      case 'clear_board':
        data = await handleClearBoard();
        break;
      case 'get_board_info':
        data = await handleGetBoardInfo();
        break;
      default:
        throw new Error(`Unknown command type: ${type}`);
    }

    sendResponse({ id, success: true, data });
  } catch (err: any) {
    sendResponse({ id, success: false, error: err.message || String(err) });
  }
};
