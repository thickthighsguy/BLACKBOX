import { getAllFromStore, getRecordById, getStorageUsage, readSettings, saveSettings, STORE_DEFS, verifyAttachmentIntegrity } from '../database.js';
import { showToast } from '../components/notifications.js';
import { exportBackup } from './settings.js';
import { generateArchiveReport } from './reports.js';

const commandHistory = [];
let historyPosition = 0;
let transcript = 'E.C.H.O. operator console initialized.\nType HELP for available commands.';
let lastCommandOutput = '';

const routeAliases = {
  overview: 'dashboard',
  cases: 'investigations',
  'case files': 'investigations',
  people: 'persons',
  evidence: 'evidence',
  'evidence locker': 'evidence',
  sites: 'locations',
  events: 'timeline',
  connections: 'relationships',
  board: 'intelligence',
  signal: 'intelligence',
  'signal board': 'intelligence',
  diagnostics: 'diagnostics',
  notes: 'notes',
  settings: 'settings'
};
const validRoutes = new Set(['dashboard', 'investigations', 'evidence', 'persons', 'locations', 'timeline', 'relationships', 'intelligence', 'notes', 'terminal', 'diagnostics', 'settings']);

function tokenize(commandLine) {
  const tokens = [];
  let token = '';
  let quote = '';
  let escaped = false;
  for (const character of commandLine) {
    if (escaped) {
      token += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = '';
      else token += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      if (token) tokens.push(token);
      token = '';
    } else {
      token += character;
    }
  }
  if (escaped) token += '\\';
  if (quote) throw new Error('Unclosed quote. Close the quoted argument and try again.');
  if (token) tokens.push(token);
  return tokens;
}

function getRecordLabel(record) {
  return record.title || record.name || record.caseNumber || record.evidenceId || record.personId || record.locationId || record.eventId || record.fileName || record.id;
}

async function findRecord(store, identifier, publicKeys = []) {
  if (!identifier) return null;
  const normalized = identifier.toLowerCase();
  return (await getAllFromStore(store)).find((record) => record.id === identifier || publicKeys.some((key) => String(record[key] || '').toLowerCase() === normalized)) || null;
}

function formatRecord(record) {
  return Object.entries(record)
    .filter(([key]) => key !== 'blob')
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') || '—' : value && typeof value === 'object' ? JSON.stringify(value) : value ?? '—'}`)
    .join('\n');
}

async function listStore(store, mapper) {
  const records = await getAllFromStore(store);
  return records.length ? records.slice(0, 50).map(mapper).join('\n') + (records.length > 50 ? '\nShowing first 50 records.' : '') : `No ${store} records.`;
}

async function searchRecords(query) {
  if (!query.trim()) return 'Usage: SEARCH <words or "quoted phrase">';
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [];
  for (const store of Object.keys(STORE_DEFS)) {
    const records = await getAllFromStore(store);
    for (const record of records) {
      const searchable = Object.entries(record)
        .filter(([key, value]) => key !== 'blob' && (typeof value === 'string' || typeof value === 'number' || Array.isArray(value)))
        .map(([, value]) => Array.isArray(value) ? value.join(' ') : String(value))
        .join(' ')
        .toLowerCase();
      if (terms.every((term) => searchable.includes(term))) matches.push(`${store} | ${getRecordLabel(record)} | ${record.id}`);
    }
  }
  return matches.length ? `${matches.length} match(es):\n${matches.slice(0, 50).join('\n')}${matches.length > 50 ? '\nShowing first 50 matches.' : ''}` : `No records match "${query}".`;
}

const commandDefinitions = [
  { name: 'HELP', usage: 'HELP [command]', description: 'List commands or show details for one command.', run: async ([name]) => name ? helpText(name) : commandDefinitions.map((item) => `${item.name.padEnd(14)} ${item.description}`).join('\n') },
  { name: 'CLEAR', usage: 'CLEAR', description: 'Clear the console transcript.', run: async () => '' },
  { name: 'STATUS', usage: 'STATUS', description: 'Count records in every local store.', run: async () => {
    const counts = await Promise.all(Object.keys(STORE_DEFS).map(async (store) => [store, (await getAllFromStore(store)).length]));
    const storage = await getStorageUsage();
    const unresolved = (await getAllFromStore('events')).filter((item) => item.relationType === 'contradicts' && item.relatedEventId && !item.conflictResolved).length;
    return [...counts.map(([store, count]) => `${store}: ${count}`), `unresolved contradictions: ${unresolved}`, `storage usage: ${storage.usage ? `${(storage.usage / 1048576).toFixed(2)} MB` : 'Unavailable'}`].join('\n');
  } },
  { name: 'SEARCH', usage: 'SEARCH <words or "quoted phrase">', description: 'Search text fields across local records.', run: async (args) => searchRecords(args.join(' ')) },
  { name: 'CASE', usage: 'CASE <case number or ID>', description: 'Show a case file by case number or record ID.', run: async ([id]) => lookupOutput('investigations', id, ['caseNumber']) },
  { name: 'CASES', usage: 'CASES', description: 'List case files.', run: async () => listStore('investigations', (item) => `${item.caseNumber || item.id} | ${item.status || 'Open'} | ${item.title || 'Untitled'}`) },
  { name: 'EVIDENCE', usage: 'EVIDENCE [ID]', description: 'List evidence or inspect one record.', run: async (args) => args.length ? lookupOutput('evidence', args.join(' '), ['evidenceId']) : listStore('evidence', (item) => `${item.evidenceId || item.id} | ${item.name || 'Untitled'} | ${item.status || 'Active'}`) },
  { name: 'PERSON', usage: 'PERSON <ID>', description: 'Inspect a person record.', run: async ([id]) => lookupOutput('persons', id, ['personId', 'name']) },
  { name: 'PERSONS', usage: 'PERSONS', description: 'List people in the archive.', run: async () => listStore('persons', (item) => `${item.personId || item.id} | ${item.name || 'Unnamed'} | ${item.category || 'Other'}`) },
  { name: 'LOCATION', usage: 'LOCATION <ID>', description: 'Inspect a location record.', run: async ([id]) => lookupOutput('locations', id, ['locationId', 'name']) },
  { name: 'LOCATIONS', usage: 'LOCATIONS', description: 'List locations.', run: async () => listStore('locations', (item) => `${item.locationId || item.id} | ${item.name || 'Unnamed'} | ${item.address || 'No address'}`) },
  { name: 'EVENT', usage: 'EVENT <ID>', description: 'Inspect a timeline event.', run: async ([id]) => lookupOutput('events', id, ['eventId', 'title']) },
  { name: 'TIMELINE', usage: 'TIMELINE', description: 'List timeline events and their assessments.', run: async () => listStore('events', (item) => `${item.date || 'Undated'} | ${item.title || 'Untitled'} | ${item.relationType || item.confidence || 'Unassessed'}${item.conflictResolved ? ' · Resolved' : ''}`) },
  { name: 'CONTRADICTIONS', usage: 'CONTRADICTIONS', description: 'List unresolved and resolved contradiction assessments.', run: async () => {
    const events = (await getAllFromStore('events')).filter((item) => item.relationType === 'contradicts' && item.relatedEventId);
    return events.length ? events.map((item) => `${item.conflictResolved ? 'RESOLVED' : 'OPEN'} | ${item.title} ↔ ${item.relatedEventId} | ${item.relationNote || 'No analyst note'}`).join('\n') : 'No event contradictions recorded.';
  } },
  { name: 'CONNECTIONS', usage: 'CONNECTIONS', description: 'List intelligence and relationship-map connections.', run: async () => {
    const [intelligence, relationships] = await Promise.all([getAllFromStore('intelligenceConnections'), getAllFromStore('relationships')]);
    const lines = [...intelligence.map((item) => `Signal Board | ${item.source} -> ${item.target} | ${item.type}`), ...relationships.map((item) => `Relationship | ${item.sourceId} -> ${item.targetId} | ${item.type}`)];
    return lines.length ? lines.join('\n') : 'No connections recorded.';
  } },
  { name: 'NOTES', usage: 'NOTES', description: 'List field notes.', run: async () => listStore('notes', (item) => `${item.noteId || item.id} | ${item.title || 'Untitled'} | ${(item.tags || []).join(', ')}`) },
  { name: 'NOTE', usage: 'NOTE <ID>', description: 'Inspect a field note.', run: async ([id]) => lookupOutput('notes', id, ['noteId', 'title']) },
  { name: 'STORE', usage: 'STORE <store name>', description: 'Inspect record IDs and labels in an IndexedDB store.', run: async ([storeName]) => {
    const store = String(storeName || '').toLowerCase();
    if (!Object.hasOwn(STORE_DEFS, store)) return `Usage: STORE <${Object.keys(STORE_DEFS).join('|')}>`;
    return listStore(store, (item) => `${getRecordLabel(item)} | ${item.id}`);
  } },
  { name: 'ACTIVITY', usage: 'ACTIVITY [count]', description: 'Show the most recent archive activity entries.', run: async ([requestedCount]) => {
    const count = Math.min(50, Math.max(1, Number.parseInt(requestedCount || '15', 10) || 15));
    const items = (await getAllFromStore('activityLog')).sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp)).slice(0, count);
    return items.length ? items.map((item) => `${item.timestamp} | ${item.actionType} ${item.entityType} | ${item.description}`).join('\n') : 'No activity recorded.';
  } },
  { name: 'ATTACHMENTS', usage: 'ATTACHMENTS [record ID]', description: 'List stored file metadata, optionally for one record.', run: async ([recordId]) => {
    const items = await getAllFromStore('attachments');
    const filtered = recordId ? items.filter((item) => item.entityId === recordId) : items;
    return filtered.length ? filtered.map((item) => `${item.fileName} | ${item.entityType}:${item.entityId} | ${item.size || 0} bytes | SHA-256 ${item.sha256 || 'unavailable'}`).join('\n') : 'No matching attachments.';
  } },
  { name: 'SYSTEM', usage: 'SYSTEM', description: 'Show browser-reported runtime and network details.', run: async () => {
    const storage = await getStorageUsage();
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return [
      `Browser: ${navigator.userAgent}`,
      `Platform: ${navigator.userAgentData?.platform || navigator.platform || 'Unavailable'}`,
      `Locale: ${navigator.language}`,
      `Online hint: ${navigator.onLine ? 'online' : 'offline'}`,
      `Connection hint: ${connection?.effectiveType || 'not exposed'}`,
      `Viewport: ${window.innerWidth} × ${window.innerHeight}`,
      `Storage: ${storage.usage ? `${(storage.usage / 1048576).toFixed(2)} MB used` : 'unavailable'}`,
      `Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
    ].join('\n');
  } },
  { name: 'STORAGE', usage: 'STORAGE', description: 'Show browser storage usage and quota.', run: async () => {
    const estimate = await getStorageUsage();
    const format = (bytes) => bytes ? `${(bytes / 1048576).toFixed(2)} MB` : 'Unavailable';
    return `Usage: ${format(estimate.usage)}\nQuota: ${format(estimate.quota)}\nPercent: ${estimate.percent ? `${estimate.percent.toFixed(2)}%` : 'Unavailable'}`;
  } },
  { name: 'INTEGRITY', usage: 'INTEGRITY', description: 'Recompute attachment SHA-256 digests.', run: async () => {
    const attachments = await getAllFromStore('attachments');
    const results = await Promise.all(attachments.map(async (attachment) => ({ attachment, result: await verifyAttachmentIntegrity(attachment) })));
    const matches = results.filter(({ result }) => result.status === 'match').length;
    const mismatches = results.filter(({ result }) => result.status === 'mismatch');
    const unavailable = results.filter(({ result }) => result.status === 'unavailable').length;
    return `Verified: ${matches}\nMismatches: ${mismatches.length}${mismatches.length ? `\n${mismatches.map(({ attachment }) => attachment.fileName).join('\n')}` : ''}\nUnavailable: ${unavailable}`;
  } },
  { name: 'OPEN', usage: 'OPEN <section>', description: 'Navigate to an E.C.H.O. section.', run: async (args) => {
    const requested = args.join(' ').toLowerCase();
    const route = routeAliases[requested] || requested;
    if (!validRoutes.has(route)) return `Unknown section "${requested}". Type HELP OPEN.`;
    await window.BLACKBOX?.navigate(route);
    return `Opening ${route}.`;
  } },
  { name: 'THEME', usage: 'THEME [dark|light]', description: 'Show or change the appearance theme.', run: async ([theme]) => {
    if (!theme) return `Current theme: ${(await readSettings()).theme || 'dark'}`;
    if (!['dark', 'light'].includes(theme.toLowerCase())) return 'Usage: THEME [dark|light]';
    await window.BLACKBOX?.setTheme(theme.toLowerCase());
    return `Theme set to ${theme.toLowerCase()}.`;
  } },
  { name: 'BACKUP', usage: 'BACKUP', description: 'Download a full E.C.H.O. backup.', run: async () => { await exportBackup(); return 'Full archive backup export started.'; } },
  { name: 'REPORT', usage: 'REPORT', description: 'Generate a print-ready archive report.', run: async () => { await generateArchiveReport(); return 'Archive report export started.'; } },
  { name: 'DIAGNOSTICS', usage: 'DIAGNOSTICS', description: 'Open the system diagnostics page.', run: async () => { await window.BLACKBOX?.navigate('diagnostics'); return 'Opening System Diagnostics.'; } },
  { name: 'SETTINGS', usage: 'SETTINGS', description: 'Open system settings.', run: async () => { await window.BLACKBOX?.navigate('settings'); return 'Opening System Settings.'; } },
  { name: 'VERSION', usage: 'VERSION', description: 'Show the application version.', run: async () => 'E.C.H.O. version 1.0.0 | Electronic Cultured Home Operator' },
  { name: 'HISTORY', usage: 'HISTORY', description: 'Show commands entered in this console session.', run: async () => commandHistory.length ? commandHistory.slice(-30).reverse().map((item, index) => `${commandHistory.length - index}. ${item}`).join('\n') : 'No commands in this session.' },
  { name: 'SAVELOG', usage: 'SAVELOG', description: 'Download the current console transcript as a text file.', run: async () => {
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `echo-console-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'Console transcript download started.';
  } },
  { name: 'COPY', usage: 'COPY', description: 'Copy the last command output to the clipboard.', run: async () => {
    if (!lastCommandOutput) return 'There is no command output to copy.';
    await navigator.clipboard.writeText(lastCommandOutput);
    return 'Last command output copied.';
  } },
];

const commandMap = new Map(commandDefinitions.map((definition) => [definition.name.toLowerCase(), definition]));

function helpText(name) {
  const definition = commandMap.get(name.toLowerCase());
  return definition ? `${definition.usage}\n${definition.description}` : `No help for "${name}". Type HELP to list commands.`;
}

async function lookupOutput(store, identifier, publicKeys) {
  if (!identifier) return `Usage: ${store.toUpperCase()} <ID>`;
  const record = await findRecord(store, identifier, publicKeys);
  return record ? formatRecord(record) : `No ${store} record found for "${identifier}".`;
}

export async function renderTerminal() {
  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div class="panel-title">Operator Console</div>
        </div>
        <div class="terminal-quick-commands" aria-label="Quick commands">
          ${['HELP', 'STATUS', 'CASES', 'SEARCH ', 'CONTRADICTIONS', 'INTEGRITY'].map((command) => `<button class="secondary-button" type="button" data-terminal-command="${command}">${command.trim() || 'SEARCH'}</button>`).join('')}
        </div>
        <div class="terminal-window">
          <div id="terminal-output" class="terminal-output" role="log" aria-live="polite">${escapeHtml(transcript)}</div>
          <form id="terminal-form" class="terminal-command-row">
            <label class="terminal-prompt" for="terminal-input">echo@archive</label>
            <input id="terminal-input" type="text" autocomplete="off" spellcheck="false" aria-label="Enter operator console command" placeholder="Enter command..." list="terminal-command-list" />
            <datalist id="terminal-command-list">${commandDefinitions.map((item) => `<option value="${item.name.toLowerCase()}">${escapeHtml(item.description)}</option>`).join('')}</datalist>
            <button class="primary-button" id="terminal-submit" type="submit">Run</button>
          </form>
        </div>
      </section>
    </div>
  `;
}

export async function executeTerminalCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) return;

  const output = document.getElementById('terminal-output');
  let tokens;
  try {
    tokens = tokenize(trimmed);
  } catch (error) {
    appendTranscript(`\n> ${trimmed}\nError: ${error.message}`);
    return;
  }
  const [commandName, ...args] = tokens;
  const definition = commandMap.get(commandName.toLowerCase());
  if (commandName.toLowerCase() === 'clear') {
    transcript = '';
    if (output) output.textContent = '';
    lastCommandOutput = '';
    return;
  }

  try {
    if (!definition) {
      lastCommandOutput = `Unknown command "${commandName}". Type HELP to see available commands.`;
    } else {
      lastCommandOutput = String(await definition.run(args) ?? 'Command complete.');
    }
    appendTranscript(`\n> ${trimmed}\n${lastCommandOutput}`);
  } catch (error) {
    lastCommandOutput = `Error: ${error.message || 'Unknown console error'}`;
    appendTranscript(`\n> ${trimmed}\n${lastCommandOutput}`);
  }
}

function appendTranscript(text) {
  transcript += text;
  const output = document.getElementById('terminal-output');
  if (output) {
    output.textContent = transcript;
    output.scrollTop = output.scrollHeight;
  }
}

document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'terminal-form') return;
  event.preventDefault();
  const form = event.target;
  const input = form.querySelector('#terminal-input');
  const submitButton = form.querySelector('#terminal-submit');
  if (!input || !input.value.trim()) return;
  const command = input.value;
  commandHistory.push(command.trim());
  historyPosition = commandHistory.length;
  submitButton.disabled = true;
  await executeTerminalCommand(command);
  input.value = '';
  submitButton.disabled = false;
  input.focus();
});

document.addEventListener('click', (event) => {
  const button = event.target.closest?.('[data-terminal-command]');
  if (!button) return;
  const input = document.getElementById('terminal-input');
  if (!input) return;
  input.value = button.dataset.terminalCommand;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
});

document.addEventListener('keydown', (event) => {
  const input = document.getElementById('terminal-input');
  if (event.target !== input) return;
  if (event.key === 'ArrowUp' && commandHistory.length) {
    event.preventDefault();
    historyPosition = Math.max(0, historyPosition - 1);
    input.value = commandHistory[historyPosition];
  } else if (event.key === 'ArrowDown' && commandHistory.length) {
    event.preventDefault();
    historyPosition = Math.min(commandHistory.length, historyPosition + 1);
    input.value = commandHistory[historyPosition] || '';
  } else if (event.key === 'Tab') {
    const commandToken = input.value.trimStart().split(/\s/, 1)[0].toLowerCase();
    const matches = commandDefinitions.map((item) => item.name.toLowerCase()).filter((name) => name.startsWith(commandToken));
    if (matches.length === 1) {
      event.preventDefault();
      input.value = `${matches[0].toUpperCase()} `;
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (matches.length > 1) {
      event.preventDefault();
      appendTranscript(`\n${matches.join('  ')}`);
    }
  }
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
