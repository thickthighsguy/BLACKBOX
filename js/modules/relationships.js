import { addRecord, createActivityLog, getAllFromStore, deleteRecord } from '../database.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/notifications.js';
import { uid } from '../utilities.js';

export async function renderRelationships() {
  const relationships = await getAllFromStore('relationships');

  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div class="panel-title">Relationship mapping</div>
          <button class="primary-button" data-action="create-relationship">New relationship</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Target</th>
              <th>Confidence</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${relationships.length ? relationships.map((relation) => `
              <tr>
                <td>${relation.sourceId || 'Unknown'}</td>
                <td>${relation.type || 'Unknown association'}</td>
                <td>${relation.targetId || 'Unknown'}</td>
                <td>${relation.confidence || 'Unverified'}</td>
                <td>
                  <div class="action-row">
                    <button class="secondary-button" data-action="view-relationship" data-id="${relation.id}">View</button>
                    <button class="danger-button" data-action="delete-relationship" data-id="${relation.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="5"><div class="empty-state">No relationships recorded yet.</div></td></tr>'}
          </tbody>
        </table>
      </section>
    </div>
  `;
}

export function openRelationshipModal() {
  const body = `
    <form id="relationship-form" class="form-grid">
      <div class="field"><label>Source entity</label><input name="sourceId" required /></div>
      <div class="field"><label>Target entity</label><input name="targetId" required /></div>
      <div class="field"><label>Type</label><select name="type"><option>Family</option><option>Employment</option><option>Friendship</option><option>Communication</option><option>Business association</option><option>Witnessed event</option><option>Unknown association</option></select></div>
      <div class="field"><label>Confidence</label><select name="confidence"><option>Unverified</option><option>Low</option><option>Moderate</option><option>High</option><option>Confirmed by source</option></select></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Description</label><textarea name="description"></textarea></div>
    </form>
  `;

  const footer = `
    <button class="secondary-button" type="button" data-close-modal="true">Cancel</button>
    <button class="primary-button" type="submit" form="relationship-form">Save relationship</button>
  `;

  const modal = openModal({ title: 'Create relationship', body, footer });
  modal?.querySelector('#relationship-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const record = {
      id: uid('relationship'),
      sourceId: formData.get('sourceId') || 'Unknown source',
      targetId: formData.get('targetId') || 'Unknown target',
      type: formData.get('type') || 'Unknown association',
      description: formData.get('description') || '',
      confidence: formData.get('confidence') || 'Unverified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await addRecord('relationships', record);
    await createActivityLog('created', 'relationship', record.id, `Recorded relationship ${record.type}`);
    showToast({ type: 'success', message: 'Relationship saved.' });
    modal.remove();
    window.BLACKBOX?.navigate('relationships');
  });
}

export async function handleRelationshipAction(action, id) {
  if (action === 'view-relationship') {
    const relation = await (await import('../database.js')).getRecordById('relationships', id);
    if (!relation) return;
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="panel-grid">
        <section class="panel" style="grid-column: span 12;">
          <div class="panel-header">
            <div class="panel-title">Relationship detail</div>
            <button class="primary-button" data-action="back-to-relationships">Back</button>
          </div>
          <div class="two-col">
            <div>
              <h2>${relation.type}</h2>
              <p>${relation.description || 'No description provided.'}</p>
            </div>
            <div class="list-stack">
              <div class="list-item"><strong>Source:</strong> ${relation.sourceId}</div>
              <div class="list-item"><strong>Target:</strong> ${relation.targetId}</div>
              <div class="list-item"><strong>Confidence:</strong> ${relation.confidence || 'Unverified'}</div>
            </div>
          </div>
        </section>
      </div>
    `;
    document.querySelector('[data-action="back-to-relationships"]').addEventListener('click', () => window.BLACKBOX.navigate('relationships'));
  }

  if (action === 'delete-relationship') {
    if (window.confirm('Delete this relationship record?')) {
      await deleteRecord('relationships', id);
      showToast({ type: 'success', message: 'Relationship removed.' });
      window.BLACKBOX?.navigate('relationships');
    }
  }
}
