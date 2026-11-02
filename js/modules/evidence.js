import { addRecord, createActivityLog, deleteRecord, getAllFromStore, saveFilesForEntity, getAttachmentsForEntity, buildAttachmentPreview, verifyAttachmentIntegrity } from '../database.js';
import { showToast } from '../components/notifications.js';
import { openModal } from '../components/modal.js';
import { formatDate, uid } from '../utilities.js';

export async function renderEvidence() {
  const evidence = await getAllFromStore('evidence');

  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div class="panel-title">Evidence Locker</div>
          <button class="primary-button" data-action="create-evidence">Add evidence</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Source</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${evidence.length ? evidence.map((item) => `
              <tr>
                <td class="code">${item.evidenceId || item.id}</td>
                <td>${item.name}</td>
                <td>${item.type || 'Document'}</td>
                <td>${item.source || 'Unknown'}</td>
                <td><span class="badge">${item.status || 'Active'}</span></td>
                <td>
                  <div class="action-row">
                    <button class="secondary-button" data-action="view-evidence" data-id="${item.id}">View</button>
                    <button class="danger-button" data-action="delete-evidence" data-id="${item.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="6"><div class="empty-state">No evidence records found.</div></td></tr>'}
          </tbody>
        </table>
      </section>
    </div>
  `;
}

export function openEvidenceModal() {
  const body = `
    <form id="evidence-form" class="form-grid">
      <div class="field"><label>Name</label><input name="name" required /></div>
      <div class="field"><label>Type</label><select name="type"><option>Photograph</option><option>Video</option><option>Audio</option><option>Document</option><option>Physical object</option><option>Digital record</option><option>Communication</option><option>Financial record</option><option>Other</option></select></div>
      <div class="field"><label>Source</label><input name="source" value="Unknown" /></div>
      <div class="field"><label>Status</label><select name="status"><option>Active</option><option>Archived</option><option>Pending review</option></select></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Description</label><textarea name="description"></textarea></div>
      <div class="field"><label>Collection location</label><input name="collectionLocation" /></div>
      <div class="field"><label>Associated person</label><input name="associatedPerson" /></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Tags</label><input name="tags" placeholder="comma separated tags" /></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Attach files or images</label><input type="file" multiple accept="image/*,.pdf,.txt,.docx,.mp4,.mp3,.wav" /></div>
    </form>
  `;

  const footer = `
    <button class="secondary-button" type="button" data-close-modal="true">Cancel</button>
    <button class="primary-button" type="submit" form="evidence-form">Save evidence</button>
  `;

  const modal = openModal({ title: 'Add evidence record', body, footer });
  modal?.querySelector('#evidence-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const fileInput = form.querySelector('input[type="file"]');
    const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
    const record = {
      id: uid('evidence'),
      evidenceId: `EVD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      name: formData.get('name') || 'Unnamed evidence',
      type: formData.get('type') || 'Document',
      description: formData.get('description') || '',
      source: formData.get('source') || 'Unknown',
      collectionLocation: formData.get('collectionLocation') || '',
      associatedPerson: formData.get('associatedPerson') || '',
      tags: String(formData.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean),
      status: formData.get('status') || 'Active',
      collectionDate: new Date().toISOString(),
      fileAttachments: [],
      notes: ''
    };

    await addRecord('evidence', record);

    if (files.length) {
      await saveFilesForEntity('evidence', record.id, files);
    }

    await createActivityLog('created', 'evidence', record.id, `Added evidence ${record.evidenceId}`);
    showToast({ type: 'success', message: 'Evidence record saved.' });
    modal.remove();
    window.BLACKBOX?.navigate('evidence');
  });
}

export async function handleEvidenceAction(action, id) {
  if (action === 'view-evidence') {
    const evidence = await (await import('../database.js')).getRecordById('evidence', id);
    if (!evidence) return;
    const attachments = await getAttachmentsForEntity('evidence', evidence.id);
    const content = document.getElementById('content');
    const attachmentMarkup = attachments.length ? attachments.map((item) => buildAttachmentPreview(item)).join('') : '<div class="empty-state">No attachments uploaded yet.</div>';

    content.innerHTML = `
      <div class="panel-grid">
        <section class="panel" style="grid-column: span 12;">
          <div class="panel-header">
            <div class="panel-title">Evidence detail</div>
            <button class="primary-button" data-action="back-to-evidence">Back</button>
          </div>
          <div class="two-col">
            <div>
              <h2>${evidence.name}</h2>
              <p class="muted code">${evidence.evidenceId}</p>
              <p>${evidence.description || 'No description recorded.'}</p>
            </div>
            <div class="list-stack">
              <div class="list-item"><strong>Type:</strong> ${evidence.type}</div>
              <div class="list-item"><strong>Source:</strong> ${evidence.source}</div>
              <div class="list-item"><strong>Status:</strong> ${evidence.status}</div>
              <div class="list-item"><strong>Collected:</strong> ${formatDate(evidence.collectionDate)}</div>
            </div>
          </div>
        </section>

        <section class="panel" style="grid-column: span 12;">
          <div class="panel-header">
            <div class="panel-title">Attachments</div>
          </div>
          ${attachmentMarkup}
          <div class="field" style="margin-top: 1rem;">
            <label>Attach files or images</label>
            <input id="attachment-input-${evidence.id}" type="file" multiple accept="image/*,.pdf,.txt,.docx,.mp4,.mp3,.wav" />
          </div>
          <div class="action-row" style="margin-top: 0.75rem;">
            <button class="primary-button" data-action="attach-files" data-entity="evidence" data-id="${evidence.id}">Attach files</button>
            <button class="secondary-button" id="verify-evidence-integrity">Verify file integrity</button>
          </div>
          <div class="muted" id="integrity-result" role="status" aria-live="polite"></div>
        </section>
      </div>
    `;
    document.querySelector('[data-action="back-to-evidence"]').addEventListener('click', () => window.BLACKBOX.navigate('evidence'));
    document.getElementById('verify-evidence-integrity')?.addEventListener('click', async () => {
      const result = document.getElementById('integrity-result');
      const checks = await Promise.all(attachments.map(async (attachment) => ({
        fileName: attachment.fileName,
        ...(await verifyAttachmentIntegrity(attachment))
      })));
      const unavailable = checks.filter((check) => check.status === 'unavailable');
      const mismatches = checks.filter((check) => check.status === 'mismatch');
      if (!checks.length) {
        result.textContent = 'No files to verify.';
      } else if (mismatches.length) {
        result.textContent = `Integrity mismatch: ${mismatches.map((check) => check.fileName).join(', ')}`;
      } else if (unavailable.length) {
        result.textContent = `${checks.length - unavailable.length} verified; ${unavailable.length} unavailable (legacy file or Web Crypto unavailable).`;
      } else {
        result.textContent = `Integrity verified for ${checks.length} file${checks.length === 1 ? '' : 's'}.`;
      }
    });
  }

  if (action === 'delete-evidence') {
    if (window.confirm('Delete this evidence record?')) {
      await deleteRecord('evidence', id);
      showToast({ type: 'success', message: 'Evidence record removed.' });
      window.BLACKBOX?.navigate('evidence');
    }
  }
}
