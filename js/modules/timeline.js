import { addRecord, createActivityLog, getAllFromStore, deleteRecord, getRecordById, updateRecord } from '../database.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/notifications.js';
import { uid } from '../utilities.js';

export async function renderTimeline() {
  const events = await getAllFromStore('events');
  const sorted = [...events].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
  const contradictions = events.filter((event) => event.relationType === 'contradicts' && event.relatedEventId);
  const unresolvedContradictions = contradictions.filter((event) => !event.conflictResolved);

  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div class="panel-title">Timeline</div>
          <button class="primary-button" data-action="create-event">Record event</button>
        </div>
        <div class="timeline-analysis-summary">
          <div><strong>${events.length}</strong><span>Recorded events</span></div>
          <div><strong>${contradictions.length}</strong><span>Contradiction links</span></div>
          <div><strong>${unresolvedContradictions.length}</strong><span>Unresolved</span></div>
        </div>
        <div class="timeline-table-wrap"><table class="table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Date</th>
              <th>Case</th>
              <th>Location</th>
              <th>Source</th>
              <th>Assessment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.length ? sorted.map((event) => `
              <tr>
                <td>${event.title}</td>
                <td class="code">${event.date || 'Unknown'}</td>
                <td class="code">${event.investigationId || 'Unassigned'}</td>
                <td>${event.location || 'Unknown'}</td>
                <td>${event.source || 'Unknown'}</td>
                <td>${event.relationType ? `<span class="badge">${event.relationType}${event.relationType === 'contradicts' ? event.conflictResolved ? ' · Resolved' : ' · Open' : ''}</span>` : event.confidence || 'Unverified'}</td>
                <td>
                  <div class="action-row">
                    <button class="secondary-button" data-action="view-event" data-id="${event.id}">View</button>
                    <button class="danger-button" data-action="delete-event" data-id="${event.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="7"><div class="empty-state">No timeline events recorded yet.</div></td></tr>'}
          </tbody>
        </table></div>
      </section>
    </div>
  `;
}

export async function openEventModal() {
  const [events, investigations] = await Promise.all([getAllFromStore('events'), getAllFromStore('investigations')]);
  const body = `
    <form id="event-form" class="form-grid">
      <div class="field"><label>Event title</label><input name="title" required /></div>
      <div class="field"><label>Date</label><input name="date" type="date" /></div>
      <div class="field"><label>Time</label><input name="time" type="time" /></div>
      <div class="field"><label>Location</label><input name="location" /></div>
      <div class="field"><label>Source</label><input name="source" /></div>
      <div class="field"><label>Confidence</label><select name="confidence"><option>Unverified</option><option>Low</option><option>Moderate</option><option>High</option><option>Confirmed by source</option></select></div>
      <div class="field"><label>Case file</label><select name="investigationId"><option value="">Unassigned</option>${investigations.map((item) => `<option value="${item.id}">${item.caseNumber} · ${item.title}</option>`).join('')}</select></div>
      <div class="field"><label>Assessment against another event</label><select name="relationType"><option value="">No comparison</option><option value="corroborates">Corroborates</option><option value="contradicts">Contradicts</option><option value="context">Contextual link</option></select></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Compare with event</label><select name="relatedEventId"><option value="">No linked event</option>${events.map((item) => `<option value="${item.id}">${item.eventId || item.id} · ${item.title}</option>`).join('')}</select></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Analyst comparison note</label><textarea name="relationNote" placeholder="Explain why these events corroborate, contradict, or relate..."></textarea></div>
      <div class="field" style="grid-column: 1 / -1;"><label>Description</label><textarea name="description"></textarea></div>
    </form>
  `;

  const footer = `
    <button class="secondary-button" type="button" data-close-modal="true">Cancel</button>
    <button class="primary-button" type="submit" form="event-form">Save event</button>
  `;

  const modal = openModal({ title: 'Record timeline event', body, footer });
  modal?.querySelector('#event-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const relatedEventId = String(formData.get('relatedEventId') || '');
    const relationType = String(formData.get('relationType') || '');
    if (Boolean(relatedEventId) !== Boolean(relationType)) {
      showToast({ type: 'error', message: 'Choose both an assessment and an event to compare, or leave both blank.' });
      return;
    }
    const record = {
      id: uid('event'),
      eventId: `EVT-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      title: formData.get('title') || 'Untitled event',
      description: formData.get('description') || '',
      date: formData.get('date') || '',
      time: formData.get('time') || '',
      location: formData.get('location') || '',
      source: formData.get('source') || '',
      confidence: formData.get('confidence') || 'Unverified',
      investigationId: formData.get('investigationId') || '',
      relatedEventId,
      relationType,
      relationNote: formData.get('relationNote') || '',
      conflictResolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await addRecord('events', record);
    await createActivityLog('created', 'event', record.id, `Recorded timeline event ${record.title}`);
    if (record.investigationId) {
      const investigation = await getRecordById('investigations', record.investigationId);
      if (investigation) {
        await updateRecord('investigations', {
          ...investigation,
          associatedEvents: [...new Set([...(investigation.associatedEvents || []), record.id])],
          updatedAt: new Date().toISOString()
        });
        await createActivityLog('linked', 'investigation', investigation.id, `Linked timeline event ${record.eventId}`);
      }
    }
    if (record.relationType === 'contradicts') await createActivityLog('flagged', 'event', record.id, `Contradiction recorded against ${record.relatedEventId}`);
    showToast({ type: 'success', message: 'Timeline event saved.' });
    modal.remove();
    window.BLACKBOX?.navigate('timeline');
  });
}

export async function handleTimelineAction(action, id) {
  if (action === 'view-event') {
    const event = await (await import('../database.js')).getRecordById('events', id);
    if (!event) return;
    const relatedEvent = event.relatedEventId ? await getRecordById('events', event.relatedEventId) : null;
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="panel-grid">
        <section class="panel" style="grid-column: span 12;">
          <div class="panel-header">
            <div class="panel-title">Event detail</div>
            <button class="primary-button" data-action="back-to-timeline">Back</button>
          </div>
          <div class="two-col">
            <div>
              <h2>${event.title}</h2>
              <p>${event.description || 'No description recorded.'}</p>
            </div>
            <div class="list-stack">
              <div class="list-item"><strong>Date:</strong> ${event.date || 'Unknown'}</div>
              <div class="list-item"><strong>Time:</strong> ${event.time || 'Unknown'}</div>
              <div class="list-item"><strong>Location:</strong> ${event.location || 'Unknown'}</div>
              <div class="list-item"><strong>Source:</strong> ${event.source || 'Unknown'}</div>
              <div class="list-item"><strong>Confidence:</strong> ${event.confidence || 'Unverified'}</div>
              <div class="list-item"><strong>Case file:</strong> ${event.investigationId || 'Unassigned'}</div>
            </div>
          </div>
          ${relatedEvent ? `<div class="timeline-relation-detail"><strong>${event.relationType === 'contradicts' ? 'Contradiction' : event.relationType === 'corroborates' ? 'Corroboration' : 'Contextual link'}:</strong> ${relatedEvent.eventId || relatedEvent.id} · ${relatedEvent.title}<p>${event.relationNote || 'No analyst comparison note.'}</p><div class="muted">Resolution: ${event.relationType === 'contradicts' ? event.conflictResolved ? 'Resolved' : 'Open' : 'Not applicable'}</div>${event.relationType === 'contradicts' && !event.conflictResolved ? `<button class="secondary-button" data-action="resolve-event-conflict" data-id="${event.id}">Mark resolved</button>` : ''}</div>` : ''}
        </section>
      </div>
    `;
    document.querySelector('[data-action="back-to-timeline"]').addEventListener('click', () => window.BLACKBOX.navigate('timeline'));
    document.querySelector('[data-action="resolve-event-conflict"]')?.addEventListener('click', async () => {
      await handleTimelineAction('resolve-event-conflict', event.id);
    });
  }

  if (action === 'resolve-event-conflict') {
    const event = await getRecordById('events', id);
    if (!event || event.relationType !== 'contradicts') return;
    await updateRecord('events', { ...event, conflictResolved: true, updatedAt: new Date().toISOString() });
    await createActivityLog('resolved', 'event', id, `Resolved contradiction against ${event.relatedEventId}`);
    showToast({ type: 'success', message: 'Timeline contradiction marked resolved.' });
    if (window.BLACKBOX?.state.route === 'timeline') await window.BLACKBOX.navigate('timeline');
    else await handleTimelineAction('view-event', id);
  }

  if (action === 'delete-event') {
    if (window.confirm('Delete this timeline event?')) {
      await deleteRecord('events', id);
      showToast({ type: 'success', message: 'Timeline event removed.' });
      window.BLACKBOX?.navigate('timeline');
    }
  }
}
