import { addRecord, createActivityLog, deleteRecord, generateCaseNumber, getAllFromStore, getRecordById, updateRecord, getAttachmentsForEntity, buildAttachmentPreview, saveFilesForEntity } from '../database.js';
import { formatDate, uid } from '../utilities.js';
import { state } from '../state.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/notifications.js';

export async function renderInvestigations() {
  const investigations = await getAllFromStore('investigations');

  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div class="panel-title">Investigations</div>
          <button class="primary-button" data-action="create-investigation">New investigation</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Case</th>
              <th>Title</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${investigations.length ? investigations.map((item) => `
              <tr>
                <td class="code">${item.caseNumber}</td>
                <td>${item.title}</td>
                <td><span class="badge">${item.status || 'Open'}</span></td>
                <td>${item.priority || 'Normal'}</td>
                <td>${formatDate(item.updatedAt || item.dateCreated)}</td>
                <td>
                  <div class="action-row">
                    <button class="secondary-button" data-action="view-case" data-id="${item.id}">Open</button>
                    <button class="danger-button" data-action="delete-case" data-id="${item.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="6"><div class="empty-state">No investigations stored yet.</div></td></tr>'}
          </tbody>
        </table>
      </section>
    </div>
  `;
}

export function openInvestigationModal() {
  const body = `
    <form id="investigation-form" class="form-grid">
      <div class="field"><label>Title</label><input name="title" required /></div>
      <div class="field"><label>Category</label><input name="category" value="General" /></div>
      <div class="field"><label>Priority</label><select name="priority"><option>Low</option><option selected>Normal</option><option>High</option><option>Critical</option></select></div>
      <div class="field"><label>Status</label><select name="status"><option>Open</option><option>Active</option><option>Pending</option><option>Suspended</option><option>Closed</option><option>Archived</option></select></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Description</label><textarea name="description"></textarea></div>
      <div class="field"><label>Assigned investigator</label><input name="assignedInvestigator" value="Unassigned" /></div>
      <div class="field"><label>Case number</label><input name="caseNumber" value="Auto-generated" readonly /></div>
    </form>
  `;

  const footer = `
    <button class="secondary-button" type="button" data-close-modal="true">Cancel</button>
    <button class="primary-button" type="submit" form="investigation-form">Save investigation</button>
  `;

  const modal = openModal({ title: 'Create investigation', body, footer });
  modal?.querySelector('#investigation-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const caseNumber = await generateCaseNumber();
    const record = {
      id: uid('case'),
      caseNumber,
      title: formData.get('title') || 'Untitled investigation',
      description: formData.get('description') || '',
      category: formData.get('category') || 'General',
      priority: formData.get('priority') || 'Normal',
      status: formData.get('status') || 'Open',
      dateCreated: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedInvestigator: formData.get('assignedInvestigator') || 'Unassigned',
      relevantLocations: [],
      associatedPersons: [],
      associatedEvidence: [],
      associatedEvents: [],
      notes: []
    };

    await addRecord('investigations', record);
    await createActivityLog('created', 'investigation', record.id, `Created investigation ${record.caseNumber}`);
    showToast({ type: 'success', message: `Investigation ${record.caseNumber} created.` });
    modal.remove();
    window.BLACKBOX?.navigate('investigations');
  });
}

const caseAssociations = [
  { key: 'associatedPersons', store: 'persons', title: 'People', label: (item) => `${item.name || 'Unnamed'} · ${item.personId || item.id}` },
  { key: 'associatedEvidence', store: 'evidence', title: 'Evidence', label: (item) => `${item.name || 'Untitled'} · ${item.evidenceId || item.id}` },
  { key: 'associatedEvents', store: 'events', title: 'Events', label: (item) => `${item.title || 'Untitled event'} · ${item.eventId || item.id}` },
  { key: 'relevantLocations', store: 'locations', title: 'Locations', label: (item) => `${item.name || 'Unnamed'} · ${item.locationId || item.id}` }
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderAssociationGroup(association, records, linkedIds) {
  const linkedItems = linkedIds.map((id) => records.find((item) => item.id === id) || { id, name: 'Missing record' });
  const availableItems = records.filter((item) => !linkedIds.includes(item.id));
  return `
    <section class="case-association-group">
      <div class="case-association-heading"><h3>${association.title}</h3><span class="muted code">${linkedItems.length} linked</span></div>
      <div class="case-linked-list">${linkedItems.length ? linkedItems.map((item) => `
        <div class="case-linked-row"><span>${escapeHtml(association.label(item))}</span><button class="danger-button" type="button" data-remove-association="${association.key}" data-related-id="${escapeHtml(item.id)}" aria-label="Unlink ${escapeHtml(association.label(item))}">Unlink</button></div>
      `).join('') : '<div class="muted">No linked records.</div>'}</div>
      <div class="case-association-add">
        <select id="association-select-${association.key}" aria-label="Select ${escapeHtml(association.title.toLowerCase())} to link">
          <option value="">Select a record</option>
          ${availableItems.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(association.label(item))}</option>`).join('')}
        </select>
        <button class="secondary-button" type="button" data-add-association="${association.key}" ${availableItems.length ? '' : 'disabled'}>Link record</button>
      </div>
    </section>
  `;
}

async function renderCaseWorkspace(id, activeTab = 'overview') {
  const record = await getRecordById('investigations', id);
  if (!record) return;
  const [attachments, activity, ...relatedRecords] = await Promise.all([
    getAttachmentsForEntity('investigation', record.id),
    getAllFromStore('activityLog').then((items) => items.filter((item) => item.entityType === 'investigation' && item.entityId === record.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))),
    ...caseAssociations.map((association) => getAllFromStore(association.store))
  ]);
  const recordsByAssociation = Object.fromEntries(caseAssociations.map((association, index) => [association.key, relatedRecords[index]]));
  const attachmentMarkup = attachments.length
    ? attachments.map(buildAttachmentPreview).join('')
    : '<div class="empty-state">No files are attached to this case yet.</div>';
  const activityMarkup = activity.length
    ? activity.map((item) => `<div class="list-item"><strong>${escapeHtml(item.actionType)}</strong><div>${escapeHtml(item.description)}</div><div class="muted code">${escapeHtml(formatDate(item.timestamp))}</div></div>`).join('')
    : '<div class="empty-state">No case-specific activity yet.</div>';

  document.getElementById('content').innerHTML = `
    <div class="panel-grid case-workspace-grid">
      <section class="panel case-overview" style="grid-column: span 12;">
        <div class="panel-header">
          <div><div class="panel-title">${escapeHtml(record.caseNumber)}</div><h2>${escapeHtml(record.title)}</h2></div>
          <button class="secondary-button" data-action="back-to-list">Back to case files</button>
        </div>
        <div class="case-overview-grid">
          <p>${escapeHtml(record.description || 'No case summary recorded.')}</p>
          <dl class="case-meta">
            <div><dt>Status</dt><dd>${escapeHtml(record.status || 'Open')}</dd></div>
            <div><dt>Priority</dt><dd>${escapeHtml(record.priority || 'Normal')}</dd></div>
            <div><dt>Investigator</dt><dd>${escapeHtml(record.assignedInvestigator || 'Unassigned')}</dd></div>
            <div><dt>Created</dt><dd>${escapeHtml(formatDate(record.dateCreated))}</dd></div>
          </dl>
        </div>
      </section>

      <div class="case-workspace" style="grid-column: span 12;">
        <nav class="case-tabs" role="tablist" aria-label="Case workspace sections">
          <button class="case-tab ${activeTab === 'overview' ? 'active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'overview'}" data-case-tab="overview">Overview</button>
          <button class="case-tab ${activeTab === 'links' ? 'active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'links'}" data-case-tab="links">Linked records</button>
          <button class="case-tab ${activeTab === 'files' ? 'active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'files'}" data-case-tab="files">Attachments</button>
          <button class="case-tab ${activeTab === 'activity' ? 'active' : ''}" type="button" role="tab" aria-selected="${activeTab === 'activity'}" data-case-tab="activity">Case activity</button>
        </nav>

        <section class="case-tab-panel" role="tabpanel" data-case-panel="overview" ${activeTab === 'overview' ? '' : 'hidden'}>
          <div class="case-summary-strip">
            <div><strong>${(record.associatedPersons || []).length}</strong><span>People</span></div>
            <div><strong>${(record.associatedEvidence || []).length}</strong><span>Evidence</span></div>
            <div><strong>${(record.associatedEvents || []).length}</strong><span>Events</span></div>
            <div><strong>${(record.relevantLocations || []).length}</strong><span>Locations</span></div>
            <div><strong>${attachments.length}</strong><span>Attachments</span></div>
          </div>
          <p class="muted">Use Linked records to connect this case with existing people, evidence, events, and locations.</p>
        </section>

        <section class="case-tab-panel" role="tabpanel" data-case-panel="links" ${activeTab === 'links' ? '' : 'hidden'}>
          <div class="case-associations">${caseAssociations.map((association) => renderAssociationGroup(association, recordsByAssociation[association.key], record[association.key] || [])).join('')}</div>
        </section>

        <section class="case-tab-panel" role="tabpanel" data-case-panel="files" ${activeTab === 'files' ? '' : 'hidden'}>
          ${attachmentMarkup}
          <div class="case-file-upload">
            <label for="attachment-input-${escapeHtml(record.id)}">Attach files or images</label>
            <input id="attachment-input-${escapeHtml(record.id)}" type="file" multiple accept="image/*,.pdf,.txt,.docx,.mp4,.mp3,.wav" />
            <button class="primary-button" type="button" data-action="attach-files" data-entity="investigation" data-id="${escapeHtml(record.id)}">Add attachments</button>
          </div>
        </section>

        <section class="case-tab-panel" role="tabpanel" data-case-panel="activity" ${activeTab === 'activity' ? '' : 'hidden'}>
          <div class="list-stack">${activityMarkup}</div>
        </section>
      </div>
    </div>
  `;

  const content = document.getElementById('content');
  content.querySelector('[data-action="back-to-list"]')?.addEventListener('click', () => window.BLACKBOX.navigate('investigations'));
  content.querySelector('[data-action="attach-files"]')?.addEventListener('click', async () => {
    const input = content.querySelector(`#attachment-input-${CSS.escape(id)}`);
    const files = input?.files ? Array.from(input.files) : [];
    if (!files.length) {
      showToast({ type: 'error', message: 'Select at least one file to attach.' });
      return;
    }
    await saveFilesForEntity('investigation', id, files);
    await createActivityLog('attached', 'investigation', id, `Attached ${files.length} file${files.length === 1 ? '' : 's'} to ${record.caseNumber}`);
    showToast({ type: 'success', message: `Attached ${files.length} file${files.length === 1 ? '' : 's'} to case.` });
    await renderCaseWorkspace(id, 'files');
  });
  content.querySelectorAll('[data-case-tab]').forEach((tab) => tab.addEventListener('click', () => renderCaseWorkspace(id, tab.dataset.caseTab)));
  content.querySelectorAll('[data-add-association]').forEach((button) => button.addEventListener('click', async () => {
    const association = caseAssociations.find((item) => item.key === button.dataset.addAssociation);
    const select = content.querySelector(`#association-select-${association.key}`);
    const relatedId = select?.value;
    if (!relatedId) return;
    const latest = await getRecordById('investigations', id);
    const currentIds = latest[association.key] || [];
    if (currentIds.includes(relatedId)) return;
    const updated = { ...latest, [association.key]: [...currentIds, relatedId], updatedAt: new Date().toISOString() };
    await updateRecord('investigations', updated);
    await createActivityLog('linked', 'investigation', id, `Linked ${association.title.toLowerCase()} record ${relatedId}`);
    showToast({ type: 'success', message: `${association.title} record linked to case.` });
    await renderCaseWorkspace(id, 'links');
  }));
  content.querySelectorAll('[data-remove-association]').forEach((button) => button.addEventListener('click', async () => {
    const association = caseAssociations.find((item) => item.key === button.dataset.removeAssociation);
    const latest = await getRecordById('investigations', id);
    const updated = { ...latest, [association.key]: (latest[association.key] || []).filter((relatedId) => relatedId !== button.dataset.relatedId), updatedAt: new Date().toISOString() };
    await updateRecord('investigations', updated);
    await createActivityLog('unlinked', 'investigation', id, `Unlinked ${association.title.toLowerCase()} record ${button.dataset.relatedId}`);
    showToast({ type: 'success', message: 'Record unlinked from case.' });
    await renderCaseWorkspace(id, 'links');
  }));
}

export async function handleInvestigationAction(action, id) {
  if (action === 'view-case') {
    await renderCaseWorkspace(id);
  }

  if (action === 'delete-case') {
    if (window.confirm('Delete this investigation?')) {
      await deleteRecord('investigations', id);
      showToast({ type: 'success', message: 'Investigation removed.' });
      window.BLACKBOX?.navigate('investigations');
    }
  }
}
