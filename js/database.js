import { uid } from './utilities.js';

const DB_NAME = 'BLACKBOX_DB';
const DB_VERSION = 1;

export const STORE_DEFS = {
  investigations: ['id', 'caseNumber', 'title', 'status', 'priority', 'updatedAt'],
  evidence: ['id', 'evidenceId', 'title', 'caseId', 'personId', 'status'],
  persons: ['id', 'personId', 'name', 'category'],
  locations: ['id', 'locationId', 'name', 'category'],
  events: ['id', 'eventId', 'title', 'date', 'investigationId'],
  notes: ['id', 'noteId', 'title', 'updatedAt'],
  relationships: ['id', 'sourceId', 'targetId', 'type'],
  intelligenceNodes: ['id', 'type', 'entityId'],
  intelligenceConnections: ['id', 'source', 'target', 'type'],
  attachments: ['id', 'entityType', 'entityId', 'name'],
  activityLog: ['id', 'entityType', 'entityId', 'timestamp'],
  settings: ['id', 'key']
};

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      Object.entries(STORE_DEFS).forEach(([storeName, indexes]) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          indexes.forEach((indexName) => store.createIndex(indexName, indexName, { unique: false }));
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllFromStore(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function restoreBackupStores(stores, { merge = false } = {}) {
  const storeNames = Object.keys(STORE_DEFS);
  for (const storeName of storeNames) {
    const records = stores[storeName] ?? [];
    if (!Array.isArray(records) || records.some((record) => !record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id)) {
      throw new Error(`Backup contains invalid records in ${storeName}.`);
    }
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, 'readwrite');
    let added = 0;
    let skipped = 0;
    transaction.oncomplete = () => resolve({ added, skipped, merged: merge });
    transaction.onerror = () => reject(transaction.error || new Error('Backup restore failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Backup restore was cancelled.'));

    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName);
      const incoming = stores[storeName] ?? [];
      if (!merge) {
        store.clear();
        for (const record of incoming) store.put(record);
        added += incoming.length;
        continue;
      }

      const request = store.getAll();
      request.onsuccess = () => {
        const existingIds = new Set(request.result.map((record) => record.id));
        for (const record of incoming) {
          if (existingIds.has(record.id)) {
            skipped += 1;
            continue;
          }
          existingIds.add(record.id);
          store.put(record);
          added += 1;
        }
      };
    }
  });
}

export async function addRecord(storeName, record) {
  const db = await openDatabase();
  const payload = { ...record, id: record.id || uid('rec') };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(payload);
    request.onsuccess = () => resolve(payload);
    request.onerror = () => reject(request.error);
  });
}

export async function updateRecord(storeName, record) {
  return addRecord(storeName, record);
}

export async function getRecordById(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteRecord(storeName, id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function generateCaseNumber() {
  const prefix = 'BB';
  const year = new Date().getFullYear();
  const list = await getAllFromStore('investigations');
  const count = list.length + 1;
  const padded = String(count).padStart(6, '0');
  return `${prefix}-${year}-${padded}`;
}

export async function getStats() {
  const [investigations, evidence, persons, events, notes, activityLog] = await Promise.all([
    getAllFromStore('investigations'),
    getAllFromStore('evidence'),
    getAllFromStore('persons'),
    getAllFromStore('events'),
    getAllFromStore('notes'),
    getAllFromStore('activityLog')
  ]);

  return {
    totalInvestigations: investigations.length,
    activeInvestigations: investigations.filter((item) => ['Open', 'Active', 'Pending'].includes(item.status)).length,
    closedInvestigations: investigations.filter((item) => ['Closed', 'Archived'].includes(item.status)).length,
    totalEvidence: evidence.length,
    totalPersons: persons.length,
    totalEvents: events.length,
    totalNotes: notes.length,
    unresolvedContradictions: events.filter((item) => item.relationType === 'contradicts' && item.relatedEventId && !item.conflictResolved).length,
    totalActivity: activityLog.length
  };
}

export async function createActivityLog(actionType, entityType, entityId, description) {
  const record = {
    id: uid('activity'),
    actionType,
    entityType,
    entityId,
    description,
    timestamp: new Date().toISOString()
  };
  await addRecord('activityLog', record);
  return record;
}

export function getStorageUsage() {
  return new Promise((resolve) => {
    const nav = navigator.storage;
    if (!nav || !nav.estimate) {
      resolve({ usage: 0, quota: 0, percent: 0 });
      return;
    }

    nav.estimate().then(({ usage, quota }) => {
      resolve({
        usage: usage || 0,
        quota: quota || 0,
        percent: quota ? Math.min((usage / quota) * 100, 100) : 0
      });
    }).catch(() => resolve({ usage: 0, quota: 0, percent: 0 }));
  });
}

export async function ensureDefaultSettings() {
  const existing = await getAllFromStore('settings');
  if (existing.length === 0) {
    await addRecord('settings', {
      id: 'app-settings',
      key: 'app-settings',
      theme: 'dark',
      compactMode: false,
      sidebarCollapsed: false,
      fontSize: 1,
      animation: true,
      version: '1.0.0',
      createdAt: new Date().toISOString()
    });
  }
}

export async function readSettings() {
  const all = await getAllFromStore('settings');
  return all[0] || {
    id: 'app-settings',
    key: 'app-settings',
    theme: 'dark',
    compactMode: false,
    sidebarCollapsed: false,
    fontSize: 1,
    animation: true,
    version: '1.0.0'
  };
}

export async function saveSettings(nextSettings) {
  const existing = await readSettings();
  const merged = { ...existing, ...nextSettings, id: 'app-settings', key: 'app-settings' };
  await addRecord('settings', merged);
  return merged;
}

export async function resetDatabase() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve(false);
  });
}

export async function saveFilesForEntity(entityType, entityId, files) {
  const fileList = Array.isArray(files) ? files : [files].filter(Boolean);
  const saved = [];

  for (const file of fileList) {
    if (!file) continue;
    const sha256 = await calculateSha256(file);
    const attachment = {
      id: uid('attachment'),
      entityType,
      entityId,
      fileName: file.name || 'unnamed-file',
      mimeType: file.type || 'application/octet-stream',
      size: file.size || 0,
      createdAt: new Date().toISOString(),
      blob: file,
      hashAlgorithm: sha256 ? 'SHA-256' : '',
      sha256,
      kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file'
    };
    const savedRecord = await addRecord('attachments', attachment);
    saved.push(savedRecord);
  }

  return saved;
}

async function calculateSha256(blob) {
  if (!globalThis.crypto?.subtle) return '';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyAttachmentIntegrity(attachment) {
  if (!attachment.sha256) return { status: 'unavailable', expected: '', actual: '' };
  const actual = await calculateSha256(attachment.blob);
  if (!actual) return { status: 'unavailable', expected: attachment.sha256, actual: '' };
  return {
    status: actual === attachment.sha256 ? 'match' : 'mismatch',
    expected: attachment.sha256,
    actual
  };
}

export async function getAttachmentsForEntity(entityType, entityId) {
  const all = await getAllFromStore('attachments');
  return all.filter((item) => item.entityType === entityType && item.entityId === entityId);
}

export async function deleteAttachment(id) {
  await deleteRecord('attachments', id);
}

export function buildAttachmentPreview(attachment) {
  const mediaUrl = attachment.blob ? URL.createObjectURL(attachment.blob) : '';
  const safeName = (attachment.fileName || 'attachment').replace(/</g, '&lt;');
  const hashMarkup = attachment.sha256 ? `<div class="muted code">SHA-256: ${attachment.sha256}</div>` : '<div class="muted">SHA-256 unavailable</div>';

  if (attachment.mimeType?.startsWith('image/')) {
    return `<div class="list-item"><strong>${safeName}</strong>${hashMarkup}<br><img src="${mediaUrl}" alt="${safeName}" style="max-width:200px;max-height:160px;border-radius:8px;border:1px solid var(--border);margin-top:0.5rem;" /></div>`;
  }

  if (attachment.mimeType?.startsWith('video/')) {
    return `<div class="list-item"><strong>${safeName}</strong>${hashMarkup}<br><video controls src="${mediaUrl}" style="max-width:100%;max-height:200px;margin-top:0.5rem;"></video></div>`;
  }

  if (attachment.mimeType?.startsWith('audio/')) {
    return `<div class="list-item"><strong>${safeName}</strong>${hashMarkup}<br><audio controls src="${mediaUrl}" style="width:100%;margin-top:0.5rem;"></audio></div>`;
  }

  if (attachment.mimeType === 'application/pdf') {
    return `<div class="list-item"><strong>${safeName}</strong>${hashMarkup}<br><embed src="${mediaUrl}" type="application/pdf" style="width:100%;min-height:220px;margin-top:0.5rem;" /></div>`;
  }

  return `<div class="list-item"><strong>${safeName}</strong><div class="muted">${attachment.mimeType || 'Unknown file type'} · ${(attachment.size || 0) / 1024} KB</div>${hashMarkup}<a href="${mediaUrl}" target="_blank" rel="noopener noreferrer" class="secondary-button" style="display:inline-block;margin-top:0.5rem;">Open file</a></div>`;
}
