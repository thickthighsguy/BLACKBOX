import { addRecord, createActivityLog, getAllFromStore, getRecordById, updateRecord } from '../database.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/notifications.js';
import { uid } from '../utilities.js';

export async function renderIntelligence() {
  const [storedNodes, connections, relationships] = await Promise.all([
    getAllFromStore('intelligenceNodes'),
    getAllFromStore('intelligenceConnections'),
    getAllFromStore('relationships')
  ]);
  const nodes = storedNodes.map((node) => ({ ...node, reference: false }));
  const edges = [
    ...connections.map((connection) => ({ ...connection, sourceRef: connection.source, targetRef: connection.target, sourceType: 'intelligence' })),
    ...relationships.map((relation) => ({ ...relation, sourceRef: relation.sourceId, targetRef: relation.targetId, sourceType: 'record' }))
  ];
  const findNode = (reference) => nodes.find((node) => [node.id, node.entityId, node.name, ...(node.aliases || [])].some((value) => String(value || '').toLowerCase() === String(reference || '').toLowerCase()));
  const addReferenceNode = (reference) => {
    const existing = findNode(reference);
    if (existing) return existing;
    const node = { id: `reference-${nodes.length}`, name: String(reference || 'Unknown reference'), type: 'Unresolved reference', reference: true };
    nodes.push(node);
    return node;
  };
  const graphEdges = edges.map((edge) => ({
    ...edge,
    sourceNode: edge.sourceType === 'intelligence' ? findNode(edge.sourceRef) || addReferenceNode(edge.sourceRef) : findNode(edge.sourceRef) || addReferenceNode(edge.sourceRef),
    targetNode: edge.sourceType === 'intelligence' ? findNode(edge.targetRef) || addReferenceNode(edge.targetRef) : findNode(edge.targetRef) || addReferenceNode(edge.targetRef)
  }));

  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.5)));
  const rows = Math.max(1, Math.ceil(nodes.length / columns));
  const positions = new Map(nodes.map((node, index) => [node.id, {
    x: Number.isFinite(Number(node.x)) ? Number(node.x) : 110 + (index % columns) * 230,
    y: Number.isFinite(Number(node.y)) ? Number(node.y) : 80 + Math.floor(index / columns) * 160
  }]));
  const graphWidth = Math.max(900, ...[...positions.values()].map((position) => position.x + 250));
  const graphHeight = Math.max(460, ...[...positions.values()].map((position) => position.y + 150));

  const edgeMarkup = graphEdges.map((edge) => {
    const source = positions.get(edge.sourceNode.id);
    const target = positions.get(edge.targetNode.id);
    const edgeLabel = edge.type || 'Associated';
    const edgeStore = edge.sourceType === 'intelligence' ? 'intelligenceConnections' : 'relationships';
    return `
      <g class="intel-edge" data-source-id="${escapeHtml(edge.sourceNode.id)}" data-target-id="${escapeHtml(edge.targetNode.id)}" data-action="view-intel-connection" data-id="${escapeHtml(edge.id)}" data-connection-store="${edgeStore}" tabindex="0" role="button" aria-label="View ${escapeHtml(edgeLabel)} connection">
        <line x1="${source.x + 82}" y1="${source.y + 38}" x2="${target.x + 82}" y2="${target.y + 38}" />
        <text x="${(source.x + target.x) / 2 + 82}" y="${(source.y + target.y) / 2 + 31}">${escapeHtml(edgeLabel)}</text>
      </g>
    `;
  }).join('');

  const nodeMarkup = nodes.map((node) => {
    const position = positions.get(node.id);
    return `
      <g class="intel-node ${node.reference ? 'intel-node-reference' : ''}" transform="translate(${position.x} ${position.y})" data-x="${position.x}" data-y="${position.y}" data-action="view-intel-node" data-id="${escapeHtml(node.id)}" data-node-type="${escapeHtml(node.type || 'Custom')}" tabindex="0" role="button" aria-label="View ${escapeHtml(node.type)} ${escapeHtml(node.name)}">
        <rect x="0" y="0" width="164" height="76" rx="4" />
        <text class="intel-node-name" x="12" y="31">${escapeHtml(String(node.name || 'Untitled').slice(0, 25))}</text>
        <text class="intel-node-type" x="12" y="54">${escapeHtml(node.type || 'Custom')}</text>
      </g>
    `;
  }).join('');

  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div><div class="panel-title">Intelligence board</div><div class="muted">${nodes.length} nodes · ${graphEdges.length} connections · ${nodes.filter((node) => node.reference).length} unresolved endpoints</div></div>
          <div class="action-row">
            <button class="secondary-button" data-action="sync-intel-nodes">Sync archive records</button>
            <button class="secondary-button" data-action="attach-intel-record">Attach archive record</button>
            <button class="secondary-button" data-action="create-intel-connection" ${nodes.length < 2 ? 'disabled' : ''}>Connect nodes</button>
            <button class="secondary-button" data-action="reset-intel-layout">Reset layout</button>
            <button class="primary-button" data-action="create-intel-node">Add node</button>
          </div>
        </div>
        <div class="intel-board-toolbar">
          <div class="intel-board-filters">
            <input id="intel-node-search" type="search" aria-label="Search graph nodes" placeholder="Search nodes..." />
            <select id="intel-type-filter" aria-label="Filter graph by node type"><option value="">All node types</option>${[...new Set(nodes.map((node) => node.type || 'Custom'))].sort().map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('')}</select>
          </div>
          <span class="muted">Drag nodes to arrange the board. Select a node for details. Unresolved endpoints are dashed.</span>
          <div class="action-row">
            <button class="icon-button" data-action="intel-zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
            <button class="icon-button" data-action="intel-zoom-reset" aria-label="Reset zoom" title="Reset zoom">Fit</button>
            <button class="icon-button" data-action="intel-zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
          </div>
        </div>
        <div class="intel-canvas">
          <svg id="intelligence-graph" viewBox="0 0 ${graphWidth} ${graphHeight}" data-initial-view-box="0 0 ${graphWidth} ${graphHeight}" role="img" aria-label="Relationship graph with ${nodes.length} nodes and ${graphEdges.length} connections">
            <defs><marker id="intel-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" /></marker></defs>
            ${edgeMarkup}
            ${nodeMarkup}
            ${nodes.length ? '' : '<text x="36" y="56" class="intel-empty">No nodes yet. Sync archive records or add a custom node.</text>'}
          </svg>
        </div>
        <div class="intel-legend"><span><i class="intel-legend-node"></i> Archive entity</span><span><i class="intel-legend-node unresolved"></i> Unresolved relationship endpoint</span><span><i class="intel-legend-line"></i> Stored relationship</span></div>
      </section>
    </div>
  `;
}

export function openIntelNodeModal() {
  const body = `
    <form id="intel-form" class="form-grid">
      <div class="field"><label>Name</label><input name="name" required /></div>
      <div class="field"><label>Type</label><select name="type"><option>Organization</option><option>Custom information</option><option>Other</option></select></div>
      <div class="field"><label>Entity ID</label><input name="entityId" /></div>
    </form>
  `;

  const footer = `
    <button class="secondary-button" type="button" data-close-modal="true">Cancel</button>
    <button class="primary-button" type="submit" form="intel-form">Save node</button>
  `;

  const modal = openModal({ title: 'Add intelligence node', body, footer });
  modal?.querySelector('#intel-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const record = {
      id: uid('intel'),
      name: formData.get('name') || 'Unnamed node',
      type: formData.get('type') || 'Custom information',
      entityId: formData.get('entityId') || '',
      createdAt: new Date().toISOString()
    };

    await addRecord('intelligenceNodes', record);
    await createActivityLog('created', 'intelligenceNode', record.id, `Created intelligence node ${record.name}`);
    showToast({ type: 'success', message: 'Intelligence node created.' });
    modal.remove();
    window.BLACKBOX?.navigate('intelligence');
  });
}

export async function syncIntelligenceNodes() {
  const sources = [
    ['persons', 'Person', (item) => item.name, ['personId', 'alias']],
    ['investigations', 'Case file', (item) => item.title, ['caseNumber']],
    ['evidence', 'Evidence', (item) => item.name, ['evidenceId']],
    ['locations', 'Location', (item) => item.name, ['locationId', 'address']],
    ['events', 'Event', (item) => item.title, ['eventId', 'date']]
  ];
  const existing = await getAllFromStore('intelligenceNodes');
  let created = 0;
  let refreshed = 0;
  for (const [store, type, getName, aliasFields] of sources) {
    const records = await getAllFromStore(store);
    for (const record of records) {
      const current = existing.find((node) => node.entityStore === store && node.entityId === record.id);
      const aliases = aliasFields.map((field) => record[field]).filter(Boolean);
      const name = getName(record) || 'Unnamed record';
      if (current) {
        const changed = current.name !== name || current.type !== type || JSON.stringify(current.aliases || []) !== JSON.stringify(aliases);
        if (changed) {
          await updateRecord('intelligenceNodes', { ...current, name, type, aliases, updatedAt: new Date().toISOString() });
          refreshed += 1;
        }
        continue;
      }
      await addRecord('intelligenceNodes', {
        id: uid('intel'),
        name,
        type,
        entityStore: store,
        entityId: record.id,
        aliases,
        createdAt: new Date().toISOString()
      });
      created += 1;
    }
  }
  await createActivityLog('synced', 'intelligenceNode', 'archive', `Synced ${created} new and refreshed ${refreshed} existing archive nodes`);
  showToast({ type: 'success', message: `${created} new node${created === 1 ? '' : 's'} added; ${refreshed} refreshed.` });
  window.BLACKBOX?.navigate('intelligence');
}

export async function openIntelEntityModal() {
  const sources = [
    ['persons', 'Person', (record) => record.name, ['personId', 'alias']],
    ['investigations', 'Case file', (record) => record.title, ['caseNumber']],
    ['evidence', 'Evidence', (record) => record.name, ['evidenceId']],
    ['locations', 'Location', (record) => record.name, ['locationId', 'address']],
    ['events', 'Event', (record) => record.title, ['eventId', 'date']]
  ];
  const existingNodes = await getAllFromStore('intelligenceNodes');
  const records = [];
  for (const [store, type, getName, aliasFields] of sources) {
    const storedRecords = await getAllFromStore(store);
    for (const record of storedRecords) {
      if (existingNodes.some((node) => node.entityStore === store && node.entityId === record.id)) continue;
      records.push({ store, type, record, name: getName(record) || 'Unnamed record', aliases: aliasFields.map((field) => record[field]).filter(Boolean) });
    }
  }

  const body = records.length ? `
    <form id="intel-entity-form" class="form-grid">
      <div class="field" style="grid-column: 1 / -1;"><label>Archive record</label><select name="recordIndex" required>${records.map((item, index) => `<option value="${index}">${escapeHtml(item.type)} · ${escapeHtml(item.name)}${item.aliases[0] ? ` · ${escapeHtml(item.aliases[0])}` : ''}</option>`).join('')}</select></div>
    </form>
  ` : '<div class="empty-state">All current archive records are already on the board. Add a custom node or use Sync after more records are created.</div>';
  const footer = `${records.length ? '<button class="primary-button" type="submit" form="intel-entity-form">Attach to board</button>' : ''}<button class="secondary-button" type="button" data-close-modal="true">Close</button>`;
  const modal = openModal({ title: 'Attach archive record', body, footer });
  modal?.querySelector('#intel-entity-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const index = Number(new FormData(event.currentTarget).get('recordIndex'));
    const selected = records[index];
    if (!selected) return;
    const node = {
      id: uid('intel'),
      entityStore: selected.store,
      entityId: selected.record.id,
      aliases: selected.aliases,
      name: selected.name,
      type: selected.type,
      createdAt: new Date().toISOString()
    };
    await addRecord('intelligenceNodes', node);
    await createActivityLog('attached', 'intelligenceNode', node.id, `Attached ${node.type.toLowerCase()} ${node.name} to the intelligence board`);
    showToast({ type: 'success', message: `${node.name} attached to the board.` });
    modal.remove();
    await window.BLACKBOX?.navigate('intelligence');
  });
}

export function initializeIntelligenceBoard() {
  const search = document.getElementById('intel-node-search');
  const typeFilter = document.getElementById('intel-type-filter');
  const graph = document.getElementById('intelligence-graph');
  if (!search || !typeFilter || !graph) return;
  const applyFilter = () => {
    const query = search.value.trim().toLowerCase();
    const type = typeFilter.value;
    const visibleIds = new Set();
    document.querySelectorAll('.intel-node').forEach((node) => {
      const visible = (!type || node.dataset.nodeType === type) && (!query || node.textContent.toLowerCase().includes(query));
      node.classList.toggle('intel-filtered-out', !visible);
      if (visible) visibleIds.add(node.dataset.id);
    });
    document.querySelectorAll('.intel-edge').forEach((edge) => {
      edge.classList.toggle('intel-filtered-out', !visibleIds.has(edge.dataset.sourceId) || !visibleIds.has(edge.dataset.targetId));
    });
  };
  search.oninput = applyFilter;
  typeFilter.onchange = applyFilter;
  initializeGraphDragging(graph);
}

function initializeGraphDragging(graph) {
  let drag = null;
  const graphPoint = (event) => {
    const point = graph.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(graph.getScreenCTM().inverse());
  };
  const redrawEdges = () => {
    graph.querySelectorAll('.intel-edge').forEach((edge) => {
      const source = graph.querySelector(`.intel-node[data-id="${CSS.escape(edge.dataset.sourceId)}"]`);
      const target = graph.querySelector(`.intel-node[data-id="${CSS.escape(edge.dataset.targetId)}"]`);
      if (!source || !target) return;
      const sourceX = Number(source.dataset.x) + 82;
      const sourceY = Number(source.dataset.y) + 38;
      const targetX = Number(target.dataset.x) + 82;
      const targetY = Number(target.dataset.y) + 38;
      edge.querySelector('line')?.setAttribute('x1', sourceX);
      edge.querySelector('line')?.setAttribute('y1', sourceY);
      edge.querySelector('line')?.setAttribute('x2', targetX);
      edge.querySelector('line')?.setAttribute('y2', targetY);
      edge.querySelector('text')?.setAttribute('x', (sourceX + targetX) / 2);
      edge.querySelector('text')?.setAttribute('y', (sourceY + targetY) / 2 - 7);
    });
  };

  graph.addEventListener('pointerdown', (event) => {
    const element = event.target.closest?.('.intel-node:not(.intel-node-reference)');
    if (!element || element.hidden || element.classList.contains('intel-filtered-out')) return;
    const point = graphPoint(event);
    drag = {
      element,
      id: element.dataset.id,
      offsetX: point.x - Number(element.dataset.x),
      offsetY: point.y - Number(element.dataset.y),
      moved: false,
      pointerId: event.pointerId
    };
    graph.setPointerCapture(event.pointerId);
  });

  graph.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = graphPoint(event);
    const x = Math.max(12, point.x - drag.offsetX);
    const y = Math.max(12, point.y - drag.offsetY);
    if (Math.abs(x - Number(drag.element.dataset.x)) + Math.abs(y - Number(drag.element.dataset.y)) > 2) drag.moved = true;
    drag.element.dataset.x = String(x);
    drag.element.dataset.y = String(y);
    drag.element.setAttribute('transform', `translate(${x} ${y})`);
    redrawEdges();
  });

  graph.addEventListener('pointerup', async (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const movedNode = drag;
    drag = null;
    if (!movedNode.moved) return;
    const node = await getRecordById('intelligenceNodes', movedNode.id);
    if (!node) return;
    const x = Number(movedNode.element.dataset.x);
    const y = Number(movedNode.element.dataset.y);
    await updateRecord('intelligenceNodes', { ...node, x, y, updatedAt: new Date().toISOString() });
    await createActivityLog('positioned', 'intelligenceNode', node.id, `Repositioned intelligence node ${node.name}`);
    showToast({ type: 'success', message: 'Node position saved.' });
  });

  graph.addEventListener('pointercancel', () => { drag = null; });
}

export async function resetIntelligenceLayout() {
  const nodes = await getAllFromStore('intelligenceNodes');
  for (const node of nodes) {
    if (!Number.isFinite(Number(node.x)) && !Number.isFinite(Number(node.y))) continue;
    const resetNode = { ...node };
    delete resetNode.x;
    delete resetNode.y;
    await updateRecord('intelligenceNodes', resetNode);
  }
  showToast({ type: 'success', message: 'Signal Board layout reset.' });
  await window.BLACKBOX?.navigate('intelligence');
}

export async function openIntelConnectionModal() {
  const nodes = await getAllFromStore('intelligenceNodes');
  if (nodes.length < 2) {
    showToast({ type: 'error', message: 'Sync archive records or add at least two nodes first.' });
    return;
  }
  const nodeOptions = nodes.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.name)} · ${escapeHtml(node.type)}</option>`).join('');
  const body = `
    <form id="intel-connection-form" class="form-grid">
      <div class="field"><label>Source node</label><select name="source" required>${nodeOptions}</select></div>
      <div class="field"><label>Target node</label><select name="target" required>${nodeOptions}</select></div>
      <div class="field"><label>Relationship</label><select name="type"><option>Associated with</option><option>Communicates with</option><option>Located at</option><option>Witnessed</option><option>Corroborates</option><option>Contradicts</option><option>Other</option></select></div>
      <div class="field"><label>Confidence</label><select name="confidence"><option>Unverified</option><option>Low</option><option>Moderate</option><option>High</option><option>Confirmed by source</option></select></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Analyst note</label><textarea name="description"></textarea></div>
    </form>
  `;
  const footer = `<button class="secondary-button" type="button" data-close-modal="true">Cancel</button><button class="primary-button" type="submit" form="intel-connection-form">Save connection</button>`;
  const modal = openModal({ title: 'Connect intelligence nodes', body, footer });
  modal?.querySelector('#intel-connection-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const source = String(formData.get('source') || '');
    const target = String(formData.get('target') || '');
    if (source === target) {
      showToast({ type: 'error', message: 'Choose two different nodes.' });
      return;
    }
    const record = {
      id: uid('intel-link'),
      source,
      target,
      type: formData.get('type') || 'Associated with',
      confidence: formData.get('confidence') || 'Unverified',
      description: formData.get('description') || '',
      createdAt: new Date().toISOString()
    };
    await addRecord('intelligenceConnections', record);
    await createActivityLog('created', 'intelligenceConnection', record.id, `Connected nodes as ${record.type}`);
    showToast({ type: 'success', message: 'Intelligence connection saved.' });
    modal.remove();
    window.BLACKBOX?.navigate('intelligence');
  });
}

export async function handleIntelligenceAction(action, id) {
  if (action === 'view-intel-node') {
    const node = await getRecordById('intelligenceNodes', id);
    if (!node) return;
    const body = `
      <div class="list-stack">
        <div class="list-item"><strong>Type:</strong> ${escapeHtml(node.type || 'Custom')}</div>
        <div class="list-item"><strong>Archive store:</strong> ${escapeHtml(node.entityStore || 'Custom node')}</div>
        <div class="list-item"><strong>Entity ID:</strong> <span class="code">${escapeHtml(node.entityId || node.id)}</span></div>
        ${node.aliases?.length ? `<div class="list-item"><strong>Identifiers:</strong> ${node.aliases.map(escapeHtml).join(', ')}</div>` : ''}
      </div>
    `;
    openModal({ title: node.name || 'Intelligence node', body, footer: '<button class="primary-button" type="button" data-close-modal="true">Close</button>' });
    return;
  }

  if (action !== 'view-intel-connection') return;
  const selectedEdge = document.querySelector(`.intel-edge[data-id="${CSS.escape(id)}"]`);
  const store = selectedEdge?.dataset.connectionStore;
  if (!store) return;
  const connection = await getRecordById(store, id);
  if (!connection) return;
  const nodes = await getAllFromStore('intelligenceNodes');
  const sourceId = connection.source || connection.sourceId;
  const targetId = connection.target || connection.targetId;
  const resolveName = (reference) => nodes.find((node) => [node.id, node.entityId, node.name, ...(node.aliases || [])].some((value) => String(value || '').toLowerCase() === String(reference || '').toLowerCase()))?.name || reference || 'Unknown endpoint';
  const body = `
    <div class="list-stack">
      <div class="list-item"><strong>Source:</strong> ${escapeHtml(resolveName(sourceId))}<div class="muted code">${escapeHtml(sourceId)}</div></div>
      <div class="list-item"><strong>Target:</strong> ${escapeHtml(resolveName(targetId))}<div class="muted code">${escapeHtml(targetId)}</div></div>
      <div class="list-item"><strong>Relationship:</strong> ${escapeHtml(connection.type || 'Associated')}</div>
      <div class="list-item"><strong>Confidence:</strong> ${escapeHtml(connection.confidence || 'Unverified')}</div>
      <div class="list-item"><strong>Analyst note:</strong> ${escapeHtml(connection.description || 'No note recorded.')}</div>
    </div>
  `;
  openModal({ title: 'Connection detail', body, footer: '<button class="primary-button" type="button" data-close-modal="true">Close</button>' });
}

export function zoomIntelligenceGraph(factor) {
  const graph = document.getElementById('intelligence-graph');
  if (!graph) return;
  if (factor === 1) {
    graph.setAttribute('viewBox', graph.dataset.initialViewBox || graph.getAttribute('viewBox'));
    return;
  }
  const [x, y, width, height] = graph.getAttribute('viewBox').split(/\s+/).map(Number);
  const nextWidth = width / factor;
  const nextHeight = height / factor;
  graph.setAttribute('viewBox', `${x + (width - nextWidth) / 2} ${y + (height - nextHeight) / 2} ${nextWidth} ${nextHeight}`);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
