import { addRecord, createActivityLog, deleteRecord, getAllFromStore, getRecordById, updateRecord } from '../database.js';
import { uid } from '../utilities.js';
import { showToast } from '../components/notifications.js';

let savedDraft = '';

function readDraft() {
  return JSON.stringify({
    title: document.getElementById('note-title')?.value || '',
    content: document.getElementById('note-content')?.value || '',
    tags: document.getElementById('note-tags')?.value || ''
  });
}

export function hasUnsavedNote() {
  return Boolean(document.getElementById('note-form')) && readDraft() !== savedDraft;
}

export function initializeNoteEditor() {
  const form = document.getElementById('note-form');
  if (!form || form.dataset.id) return;
  savedDraft = readDraft();
  const status = document.getElementById('note-save-status');
  if (status) status.textContent = 'New note · not saved';
}

export async function renderNotes() {
  const notes = (await getAllFromStore('notes')).sort((first, second) => new Date(second.updatedAt || second.createdAt) - new Date(first.updatedAt || first.createdAt));

  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div class="panel-title">Field Notes</div>
          <button class="primary-button" data-action="create-note">New note</button>
        </div>
        <div class="notes-layout">
          <div class="notes-list-pane">
            <div class="field notes-filter">
              <label for="note-filter">Find a note</label>
              <input id="note-filter" type="search" placeholder="Search titles, notes, tags..." />
            </div>
            <div id="notes-list" class="list-stack">
            ${notes.length ? notes.map((note) => `
              <article class="list-item note-list-item" data-note-id="${escapeHtml(note.id)}">
                <strong>${escapeHtml(note.title || 'Untitled note')}</strong>
                <div class="muted">${escapeHtml(new Date(note.updatedAt || note.createdAt).toLocaleString())}</div>
                <p class="note-preview">${escapeHtml(note.content || 'No note text yet.')}</p>
                ${note.tags?.length ? `<div class="note-tags">${note.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                <div class="action-row">
                  <button class="secondary-button" data-action="open-note" data-id="${note.id}">Open</button>
                  <button class="danger-button" data-action="delete-note" data-id="${note.id}">Delete</button>
                </div>
              </article>
            `).join('') : '<div class="empty-state">No notes yet.</div>'}
            </div>
          </div>
          <form id="note-form" class="note-editor-pane">
            <div class="field">
              <label for="note-title">Title</label>
              <input id="note-title" name="title" placeholder="New field note" required />
            </div>
            <div class="field">
              <label for="note-content">Note</label>
              <textarea id="note-content" class="note-editor" name="content" placeholder="Record observations, leads, or follow-up actions..."></textarea>
            </div>
            <div class="field">
              <label for="note-tags">Tags</label>
              <input id="note-tags" name="tags" placeholder="Comma-separated tags" />
            </div>
            <div class="note-editor-footer">
              <span id="note-save-status" class="muted" role="status" aria-live="polite">Unsaved note</span>
              <div class="action-row">
                <button class="danger-button" id="note-delete-button" type="button" data-action="delete-note" hidden>Delete note</button>
                <button class="primary-button" id="note-save-button" type="button" data-action="save-note">Save note</button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  `;
}

export async function saveNoteFromEditor() {
  const form = document.getElementById('note-form');
  const titleInput = document.getElementById('note-title');
  const contentInput = document.getElementById('note-content');

  if (!form || !titleInput || !contentInput || !titleInput.value.trim()) {
    titleInput?.focus();
    showToast({ type: 'error', message: 'Enter a title before saving this note.' });
    return;
  }

  const existingId = form.dataset.id;
  const existing = existingId ? await getRecordById('notes', existingId) : null;
  const record = {
    id: existing?.id || uid('note'),
    noteId: existing?.noteId || `NOTE-${Date.now()}`,
    title: titleInput.value.trim(),
    content: contentInput.value,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: String(document.getElementById('note-tags')?.value || '').split(',').map((tag) => tag.trim()).filter(Boolean)
  };

  if (existing) await updateRecord('notes', record);
  else await addRecord('notes', record);
  savedDraft = readDraft();
  await createActivityLog(existing ? 'updated' : 'created', 'note', record.id, `${existing ? 'Updated' : 'Saved'} note ${record.title}`);
  showToast({ type: 'success', message: existing ? 'Note updated.' : 'Note saved.' });
  await window.BLACKBOX?.navigate('notes');
  await openNote(record.id);
}

export async function openNote(id) {
  const note = await getRecordById('notes', id);
  if (!note) return;

  const form = document.getElementById('note-form');
  const titleInput = document.getElementById('note-title');
  const contentInput = document.getElementById('note-content');
  if (!form || !titleInput || !contentInput) return;
  if (form.dataset.id !== note.id && hasUnsavedNote() && !window.confirm('Discard unsaved changes and open another note?')) return;
  form.dataset.id = note.id;
  titleInput.value = note.title || '';
  contentInput.value = note.content || '';
  document.getElementById('note-tags').value = (note.tags || []).join(', ');
  document.getElementById('note-save-button').textContent = 'Save changes';
  document.getElementById('note-save-status').textContent = `Last saved ${new Date(note.updatedAt || note.createdAt).toLocaleString()}`;
  savedDraft = readDraft();
  document.querySelectorAll('.note-list-item').forEach((item) => item.classList.toggle('active', item.dataset.noteId === note.id));
  const deleteButton = document.getElementById('note-delete-button');
  deleteButton.hidden = false;
  deleteButton.dataset.id = note.id;
}

export function startNewNote() {
  const form = document.getElementById('note-form');
  if (!form) return;
  if (hasUnsavedNote() && !window.confirm('Discard the current unsaved note and start a new one?')) return;
  form.dataset.id = '';
  document.getElementById('note-title').value = '';
  document.getElementById('note-content').value = '';
  document.getElementById('note-tags').value = '';
  document.getElementById('note-save-button').textContent = 'Save note';
  document.getElementById('note-save-status').textContent = 'New note · not saved';
  document.getElementById('note-delete-button').hidden = true;
  document.querySelectorAll('.note-list-item').forEach((item) => item.classList.remove('active'));
  savedDraft = readDraft();
  document.getElementById('note-title').focus();
}

export function filterNotes(query) {
  const normalized = query.trim().toLowerCase();
  document.querySelectorAll('.note-list-item').forEach((item) => {
    item.hidden = !item.textContent.toLowerCase().includes(normalized);
  });
}

export async function deleteNote(id) {
  if (!id || !window.confirm('Delete this note? This cannot be undone.')) return;
  const note = await getRecordById('notes', id);
  if (!note) return;
  await deleteRecord('notes', id);
  await createActivityLog('deleted', 'note', id, `Deleted note ${note.title}`);
  showToast({ type: 'success', message: 'Note deleted.' });
  await window.BLACKBOX?.navigate('notes');
}

document.addEventListener('input', (event) => {
  if (!event.target.closest?.('#note-form')) return;
  const status = document.getElementById('note-save-status');
  if (status) status.textContent = hasUnsavedNote() ? 'Unsaved changes' : 'All changes saved';
});

document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's' || !document.getElementById('note-form')) return;
  event.preventDefault();
  document.getElementById('note-save-button')?.click();
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
