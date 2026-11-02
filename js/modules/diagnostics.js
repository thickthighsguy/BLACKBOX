import { getAllFromStore, getStorageUsage, STORE_DEFS } from '../database.js';

function escapeHtml(value) {
  return String(value ?? 'Unavailable')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function capability(name, available) {
  return { name, value: available ? 'Available' : 'Unavailable', available };
}

async function collectDiagnostics() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const userAgentData = navigator.userAgentData;
  let deviceHints = {};
  try {
    if (userAgentData?.getHighEntropyValues) {
      deviceHints = await userAgentData.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'uaFullVersion', 'wow64']);
    }
  } catch {
    deviceHints = {};
  }
  const storage = await getStorageUsage();
  const stores = await Promise.all(Object.keys(STORE_DEFS).map(async (name) => {
    try {
      const records = await getAllFromStore(name);
      const bytes = name === 'attachments' ? records.reduce((total, record) => total + (record.size || 0), 0) : null;
      return { name, records: records.length, bytes };
    } catch (error) {
      return { name, records: null, bytes: null, error: error.message || 'Read failed' };
    }
  }));

  let persistedStorage = 'Unavailable';
  try {
    if (navigator.storage?.persisted) persistedStorage = await navigator.storage.persisted() ? 'Persistent' : 'Best-effort';
  } catch {
    persistedStorage = 'Query failed';
  }

  let databaseNames = 'Unavailable';
  try {
    if (indexedDB.databases) {
      databaseNames = (await indexedDB.databases()).map((database) => database.name).filter(Boolean).join(', ') || 'No databases found';
    }
  } catch {
    databaseNames = 'Query failed';
  }

  const memory = performance.memory;
  const screenSize = `${screen.width} × ${screen.height}`;
  const viewportSize = `${window.innerWidth} × ${window.innerHeight}`;
  const browserBrands = userAgentData?.brands?.map((brand) => `${brand.brand} ${brand.version}`).join(', ');

  return {
    generatedAt: new Date().toISOString(),
    groups: [
      {
        title: 'Runtime',
        rows: [
          { name: 'User agent', value: navigator.userAgent },
          { name: 'Browser hints', value: browserBrands || 'Not exposed by this browser' },
          { name: 'Platform version', value: deviceHints.platformVersion || 'Not exposed' },
          { name: 'CPU architecture', value: deviceHints.architecture || 'Not exposed' },
          { name: 'Device bitness', value: deviceHints.bitness || 'Not exposed' },
          { name: 'Device model hint', value: deviceHints.model || 'Not exposed' },
          { name: '64-bit Windows compatibility mode', value: deviceHints.wow64 === undefined ? 'Not exposed' : deviceHints.wow64 ? 'Yes' : 'No' },
          { name: 'Platform', value: userAgentData?.platform || navigator.platform || 'Unavailable' },
          { name: 'Language', value: `${navigator.language}${navigator.languages?.length ? ` · ${navigator.languages.join(', ')}` : ''}` },
          { name: 'Time zone', value: Intl.DateTimeFormat().resolvedOptions().timeZone },
          { name: 'JavaScript', value: 'Enabled' },
          { name: 'Cookies enabled', value: navigator.cookieEnabled ? 'Yes (values are not read)' : 'No' },
          { name: 'Page protocol', value: location.protocol },
          { name: 'Secure context', value: window.isSecureContext ? 'Yes' : 'No' },
          { name: 'Document visibility', value: document.visibilityState },
          { name: 'Window focused', value: document.hasFocus() ? 'Yes' : 'No' },
          { name: 'Current URL', value: location.href }
        ]
      },
      {
        title: 'Device and display',
        rows: [
          { name: 'Screen dimensions', value: screenSize },
          { name: 'Available screen area', value: `${screen.availWidth} × ${screen.availHeight}` },
          { name: 'Browser viewport', value: viewportSize },
          { name: 'Pixel ratio', value: window.devicePixelRatio },
          { name: 'Color depth', value: `${screen.colorDepth}-bit` },
          { name: 'Logical processor count', value: navigator.hardwareConcurrency || 'Unavailable' },
          { name: 'Device memory hint', value: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'Not exposed' },
          { name: 'Touch points', value: navigator.maxTouchPoints ?? 'Unavailable' },
          { name: 'Display orientation', value: screen.orientation?.type || 'Not exposed' },
          { name: 'Orientation angle', value: screen.orientation?.angle === undefined ? 'Not exposed' : `${screen.orientation.angle}°` },
          { name: 'Reduced motion preference', value: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Enabled' : 'Not enabled' },
          { name: 'Color scheme preference', value: matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light or unset' }
        ]
      },
      {
        title: 'Network hints',
        rows: [
          { name: 'Browser online status', value: navigator.onLine ? 'Online hint' : 'Offline hint' },
          { name: 'Connection type', value: connection?.type || 'Not exposed' },
          { name: 'Effective connection', value: connection?.effectiveType || 'Not exposed' },
          { name: 'Estimated downlink', value: connection?.downlink ? `${connection.downlink} Mbps` : 'Not exposed' },
          { name: 'Estimated round-trip time', value: connection?.rtt ? `${connection.rtt} ms` : 'Not exposed' },
          { name: 'Data saver', value: connection?.saveData === undefined ? 'Not exposed' : connection.saveData ? 'Enabled' : 'Disabled' },
          { name: 'External connectivity test', value: 'Not performed; no external request was made' }
        ]
      },
      {
        title: 'Storage and database',
        rows: [
          { name: 'IndexedDB', value: capability('IndexedDB', 'indexedDB' in window).value },
          { name: 'Detected databases', value: databaseNames },
          { name: 'Storage used', value: formatBytes(storage.usage) },
          { name: 'Storage quota', value: formatBytes(storage.quota) },
          { name: 'Quota usage', value: storage.quota ? `${storage.percent.toFixed(2)}%` : 'Unavailable' },
          { name: 'Persistence mode', value: persistedStorage },
          { name: 'Local storage API', value: capability('localStorage', 'localStorage' in window).value },
          { name: 'Session storage API', value: capability('sessionStorage', 'sessionStorage' in window).value },
          { name: 'Cache storage API', value: capability('CacheStorage', 'caches' in window).value }
        ]
      },
      {
        title: 'Browser capabilities',
        rows: [
          capability('Web Crypto', Boolean(globalThis.crypto?.subtle)),
          capability('File API', 'File' in window && 'Blob' in window),
          capability('Clipboard API', Boolean(navigator.clipboard)),
          capability('Notifications API', 'Notification' in window),
          capability('Media devices API', Boolean(navigator.mediaDevices)),
          capability('Geolocation API', Boolean(navigator.geolocation)),
          capability('Service workers', 'serviceWorker' in navigator),
          capability('Broadcast channel', 'BroadcastChannel' in window),
          capability('WebAssembly', 'WebAssembly' in window),
          capability('WebGL API', Boolean(document.createElement('canvas').getContext('webgl')))
        ]
      },
      {
        title: 'Page diagnostics',
        rows: [
          { name: 'DOM element count', value: document.getElementsByTagName('*').length },
          { name: 'Loaded resource count', value: performance.getEntriesByType('resource').length },
          { name: 'JavaScript module count', value: document.querySelectorAll('script[type="module"]').length },
          { name: 'Document ready state', value: document.readyState },
          { name: 'Navigation type', value: performance.getEntriesByType('navigation')[0]?.type || 'Unavailable' },
          { name: 'Page load duration', value: performance.getEntriesByType('navigation')[0] ? `${Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd)} ms` : 'Unavailable' },
          { name: 'History length', value: history.length },
          { name: 'Referrer', value: document.referrer || 'None' }
        ]
      },
      {
        title: 'E.C.H.O. record stores',
        rows: stores.map((store) => ({
          name: store.name,
          value: store.records === null ? store.error : `${store.records} records${store.bytes === null ? '' : ` · ${formatBytes(store.bytes)} files`}`
        }))
      },
      ...(memory ? [{
        title: 'JavaScript memory (browser-specific)',
        rows: [
          { name: 'Heap used', value: formatBytes(memory.usedJSHeapSize) },
          { name: 'Heap allocated', value: formatBytes(memory.totalJSHeapSize) },
          { name: 'Heap limit', value: formatBytes(memory.jsHeapSizeLimit) }
        ]
      }] : [])
    ]
  };
}

function renderGroup(group) {
  return `
    <section class="panel diagnostics-panel">
      <div class="panel-header"><h2 class="panel-title">${escapeHtml(group.title)}</h2><span class="diagnostic-count">${group.rows.length} checks</span></div>
      <dl class="diagnostic-list">${group.rows.map((row) => `
        <div class="diagnostic-row"><dt>${escapeHtml(row.name)}</dt><dd class="code">${escapeHtml(row.value)}</dd></div>
      `).join('')}</dl>
    </section>
  `;
}

export async function renderDiagnostics() {
  const snapshot = await collectDiagnostics();
  const totalChecks = snapshot.groups.reduce((total, group) => total + group.rows.length, 0);
  return `
    <div class="panel-grid diagnostics-page">
      <section class="panel diagnostics-summary">
        <div>
          <div class="panel-title">System diagnostics</div>
          <p>Browser-reported system, network hints, runtime capabilities, and local archive status.</p>
          <span class="muted code">Snapshot: ${escapeHtml(new Date(snapshot.generatedAt).toLocaleString())} · ${totalChecks} checks</span>
        </div>
        <div class="action-row">
          <button class="primary-button" data-action="refresh-diagnostics">Refresh snapshot</button>
          <button class="secondary-button" data-action="export-diagnostics">Download JSON</button>
        </div>
      </section>
      ${snapshot.groups.map(renderGroup).join('')}
      <section class="panel diagnostics-notice">
        <strong>Collection limits</strong>
        <p>This snapshot uses browser-exposed values only. It does not probe external services, inspect cookies, read location, or request camera/microphone access. “Online” is the browser’s network hint, not proof that the public internet is reachable.</p>
      </section>
    </div>
  `;
}

export async function exportDiagnostics() {
  const snapshot = await collectDiagnostics();
  const blob = new Blob([JSON.stringify({ application: 'E.C.H.O.', ...snapshot }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `echo-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}