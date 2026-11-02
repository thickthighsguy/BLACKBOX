import { addRecord, createActivityLog, deleteRecord, getAllFromStore, getAttachmentsForEntity, buildAttachmentPreview } from '../database.js';
import { formatDate, uid } from '../utilities.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/notifications.js';

export async function renderLocations() {
  const locations = await getAllFromStore('locations');

  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div class="panel-title">Locations</div>
          <button class="primary-button" data-action="create-location">Add location</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${locations.length ? locations.map((item) => `
              <tr>
                <td class="code">${item.locationId || item.id}</td>
                <td>${item.name}</td>
                <td>${item.category || 'Unknown'}</td>
                <td>${item.notes || '—'}</td>
                <td>
                  <div class="action-row">
                    <button class="secondary-button" data-action="view-location" data-id="${item.id}">Open</button>
                    <button class="danger-button" data-action="delete-location" data-id="${item.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="5"><div class="empty-state">No location records exist.</div></td></tr>'}
          </tbody>
        </table>
      </section>
    </div>
  `;
}

export function openLocationModal() {
  const body = `
    <form id="location-form" class="form-grid">
      <div class="field"><label>Name</label><input name="name" required /></div>
      <div class="field"><label>Category</label><select name="category"><option>Residence</option><option>Business</option><option>Public location</option><option>Road</option><option>Building</option><option>Unknown</option><option>Other</option></select></div>
      <div class="field"><label>Address</label><input name="address" /></div>
      <div class="field"><label>Latitude</label><input name="latitude" /></div>
      <div class="field"><label>Longitude</label><input name="longitude" /></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Notes</label><textarea name="notes"></textarea></div>
    </form>
  `;

  const footer = `
    <button class="secondary-button" type="button" data-close-modal="true">Cancel</button>
    <button class="primary-button" type="submit" form="location-form">Save location</button>
  `;

  const modal = openModal({ title: 'Add location', body, footer });
  modal?.querySelector('#location-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const record = {
      id: uid('location'),
      locationId: `LOC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      name: formData.get('name') || 'Unknown location',
      category: formData.get('category') || 'Unknown',
      address: formData.get('address') || '',
      latitude: formData.get('latitude') || '',
      longitude: formData.get('longitude') || '',
      notes: formData.get('notes') || '',
      updatedAt: new Date().toISOString(),
      dateCreated: new Date().toISOString()
    };

    await addRecord('locations', record);
    await createActivityLog('created', 'location', record.id, `Created location ${record.name}`);
    showToast({ type: 'success', message: 'Location saved.' });
    modal.remove();
    window.BLACKBOX?.navigate('locations');
  });
}

export async function handleLocationAction(action, id) {
  if (action === 'view-location') {
    const location = await (await import('../database.js')).getRecordById('locations', id);
    if (!location) return;
    const attachments = await getAttachmentsForEntity('location', location.id);
    const attachmentMarkup = attachments.length ? attachments.map((item) => buildAttachmentPreview(item)).join('') : '<div class="empty-state">No attachments saved for this location.</div>';
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="panel-grid">
        <section class="panel" style="grid-column: span 12;">
          <div class="panel-header">
            <div class="panel-title">Location detail</div>
            <button class="primary-button" data-action="back-to-locations">Back</button>
          </div>
          <div class="two-col">
            <div>
              <h2>${location.name}</h2>
              <div class="code muted">${location.locationId}</div>
              <p>${location.notes || 'No notes recorded.'}</p>
            </div>
            <div class="list-stack">
              <div class="list-item"><strong>Category:</strong> ${location.category}</div>
              <div class="list-item"><strong>Address:</strong> ${location.address || 'Unknown'}</div>
              <div class="list-item"><strong>Latitude:</strong> ${location.latitude || 'Unknown'}</div>
              <div class="list-item"><strong>Longitude:</strong> ${location.longitude || 'Unknown'}</div>
            </div>
          </div>
        </section>

        <section class="panel" style="grid-column: span 12;">
          <div class="panel-header"><div class="panel-title">Attachments</div></div>
          ${attachmentMarkup}
          <div class="field" style="margin-top: 1rem;">
            <label>Attach files or images</label>
            <input id="attachment-input-${location.id}" type="file" multiple accept="image/*,.pdf,.txt,.docx,.mp4,.mp3,.wav" />
          </div>
          <div class="action-row" style="margin-top: 0.75rem;">
            <button class="primary-button" data-action="attach-files" data-entity="location" data-id="${location.id}">Attach files</button>
          </div>
        </section>
      </div>
    `;
    document.querySelector('[data-action="back-to-locations"]').addEventListener('click', () => window.BLACKBOX.navigate('locations'));
  }

  if (action === 'delete-location') {
    if (window.confirm('Delete this location record?')) {
      await deleteRecord('locations', id);
      showToast({ type: 'success', message: 'Location removed.' });
      window.BLACKBOX?.navigate('locations');
    }
  }
}
