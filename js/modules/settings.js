import { getAllFromStore, getStats, getStorageUsage, readSettings, resetDatabase, restoreBackupStores, saveSettings, STORE_DEFS } from '../database.js';
import { showToast } from '../components/notifications.js';

export async function renderSettings() {
  const settings = await readSettings();
  const stats = await getStats();
  const storage = await getStorageUsage();

  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 6;">
        <div class="panel-header">
          <div class="panel-title">Appearance</div>
        </div>
        <div class="field">
          <label>Theme</label>
          <select id="theme-select">
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark theme</option>
            <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>Lighter dark theme</option>
          </select>
        </div>
        <div class="field">
          <label>Compact mode</label>
          <select id="compact-mode">
            <option value="false" ${!settings.compactMode ? 'selected' : ''}>Off</option>
            <option value="true" ${settings.compactMode ? 'selected' : ''}>On</option>
          </select>
        </div>
      </section>

      <section class="panel" style="grid-column: span 6;">
        <div class="panel-header">
          <div class="panel-title">Database</div>
        </div>
        <div class="list-stack">
          <div class="list-item">Records: ${stats.totalInvestigations + stats.totalEvidence + stats.totalPersons}</div>
          <div class="list-item">Usage: ${storage.percent ? `${storage.percent.toFixed(1)}%` : 'Unavailable'}</div>
          <div class="action-row">
            <button class="primary-button" data-action="export-backup">Export backup</button>
            <button class="secondary-button" data-action="import-backup">Restore backup</button>
            <button class="secondary-button" data-action="merge-backup">Merge backup</button>
          </div>
          <div class="muted" style="margin-top: 0.6rem; font-size: 0.78rem;">Restore replaces local records. Merge adds new IDs and skips matching IDs without overwriting local data.</div>
        </div>
      </section>

      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div class="panel-title">Application</div>
        </div>
        <div class="list-stack">
          <div class="list-item">E.C.H.O. system version: 1.0.0</div>
          <div class="list-item">Keyboard shortcuts: Ctrl+K for global search</div>
          <div class="list-item">Privacy: local-only, no telemetry, no external services</div>
          <div class="action-row">
            <button class="danger-button" data-action="clear-database">Clear application data</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

export async function applySettings() {
  const theme = document.getElementById('theme-select')?.value || 'dark';
  const compactMode = document.getElementById('compact-mode')?.value === 'true';
  await saveSettings({ theme, compactMode });
  showToast({ type: 'success', message: 'Settings updated.' });
}

export async function exportBackup() {
  const data = {
    format: 'ECHO_BACKUP',
    version: '1.1.0',
    exportedAt: new Date().toISOString(),
    stores: {}
  };

  for (const storeName of Object.keys(STORE_DEFS)) {
    const records = await getAllFromStore(storeName);
    data.stores[storeName] = storeName === 'attachments'
      ? await Promise.all(records.map(serializeAttachment))
      : records;
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `echo-archive-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast({ type: 'success', message: 'Backup exported.' });
}

async function serializeAttachment(attachment) {
  const { blob, ...record } = attachment;
  if (!(blob instanceof Blob)) return record;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return { ...record, blobData: btoa(binary), blobType: blob.type || attachment.mimeType || '' };
}

function deserializeAttachment(attachment) {
  if (typeof attachment.blobData === 'string') {
    const binary = atob(attachment.blobData);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const { blobData, blobType, ...record } = attachment;
    return { ...record, blob: new Blob([bytes], { type: blobType || attachment.mimeType || '' }) };
  }

  const { blob, ...record } = attachment;
  return blob instanceof Blob ? { ...record, blob } : record;
}

export function importBackup(mode = 'replace') {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'application/json,.json';
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file) return;
    if (file.size > 250 * 1024 * 1024) {
      showToast({ type: 'error', message: 'Backup exceeds the 250 MB restore limit.' });
      return;
    }

    try {
      const backup = JSON.parse(await file.text());
      if (!backup || typeof backup !== 'object' || !backup.stores || typeof backup.stores !== 'object') {
        throw new Error('This file is not a valid E.C.H.O. backup.');
      }

      const stores = {};
      for (const storeName of Object.keys(STORE_DEFS)) {
        const records = backup.stores[storeName] ?? [];
        if (!Array.isArray(records)) throw new Error(`Invalid ${storeName} data in backup.`);
        stores[storeName] = storeName === 'attachments' ? records.map(deserializeAttachment) : records;
      }

      const recordCount = Object.values(stores).reduce((total, records) => total + records.length, 0);
      const merge = mode === 'merge';
      const prompt = merge
        ? `Merge ${recordCount} records? Existing matching IDs will be skipped; local records will not be overwritten.`
        : `Restore ${recordCount} records from this backup? All current local records will be replaced.`;
      if (!window.confirm(prompt)) return;

      const result = await restoreBackupStores(stores, { merge });
      const message = merge
        ? `Merged ${result.added} records; skipped ${result.skipped} matching IDs.`
        : `Restored ${recordCount} records from backup.`;
      showToast({ type: 'success', message });
      window.location.reload();
    } catch (error) {
      showToast({ type: 'error', message: error.message || 'Could not restore this backup.' });
    }
  });
  picker.click();
}

export async function clearDatabase() {
  if (window.confirm('Clear all local BLACKBOX data? This cannot be undone.')) {
    await resetDatabase();
    showToast({ type: 'success', message: 'Application database cleared.' });
    window.location.reload();
  }
}
