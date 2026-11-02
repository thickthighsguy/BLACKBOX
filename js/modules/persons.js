import { addRecord, createActivityLog, deleteAttachment, deleteRecord, getAllFromStore, getRecordById, updateRecord, getAttachmentsForEntity, buildAttachmentPreview, saveFilesForEntity } from '../database.js';
import { formatDate, uid } from '../utilities.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/notifications.js';

const repeaters = {
  emails: {
    title: 'Email addresses',
    fields: [{ key: 'label', label: 'Type', placeholder: 'Personal' }, { key: 'address', label: 'Email address', type: 'email', placeholder: 'name@example.com' }]
  },
  phoneNumbers: {
    title: 'Phone numbers',
    fields: [{ key: 'label', label: 'Type', placeholder: 'Mobile' }, { key: 'number', label: 'Number', type: 'tel', placeholder: '+1 555 0100' }]
  },
  socialAccounts: {
    title: 'Social media accounts',
    fields: [{ key: 'platform', label: 'Platform', placeholder: 'Platform' }, { key: 'username', label: 'Username / handle', placeholder: '@handle' }, { key: 'url', label: 'Profile URL', type: 'url', placeholder: 'https://' }]
  },
  vehicles: {
    title: 'Vehicles',
    fields: [
      { key: 'make', label: 'Make', placeholder: 'Make' }, { key: 'model', label: 'Model', placeholder: 'Model' },
      { key: 'year', label: 'Year', type: 'number', placeholder: 'Year' }, { key: 'color', label: 'Color', placeholder: 'Color' },
      { key: 'licensePlate', label: 'License plate', placeholder: 'Plate' }, { key: 'vin', label: 'VIN', placeholder: 'VIN' },
      { key: 'notes', label: 'Vehicle notes', placeholder: 'Notes', wide: true, type: 'textarea' }
    ]
  },
  relatives: {
    title: 'Relatives and associates',
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Name' }, { key: 'relationship', label: 'Relationship', placeholder: 'Relationship' },
      { key: 'personId', label: 'Link to personnel file', type: 'person-select', placeholder: 'No linked file', wide: true },
      { key: 'notes', label: 'Notes', placeholder: 'Context or source', wide: true, type: 'textarea' }
    ]
  }
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderRepeatRow(key, item = {}, people = []) {
  const definition = repeaters[key];
  const fields = definition.fields.map((field) => {
    const wide = field.wide ? 'person-repeat-field-wide' : '';
    if (field.type === 'person-select') {
      return `<div class="field ${wide}"><label>${field.label}</label><select data-person-value="${field.key}"><option value="">${field.placeholder}</option>${people.map((person) => `<option value="${escapeHtml(person.id)}" data-person-name="${escapeHtml(person.name)}" ${item[field.key] === person.id ? 'selected' : ''}>${escapeHtml(person.personId || person.id)} · ${escapeHtml(person.name)}</option>`).join('')}</select></div>`;
    }
    if (field.type === 'textarea') {
      return `<div class="field ${wide}"><label>${field.label}</label><textarea data-person-value="${field.key}" placeholder="${field.placeholder || ''}">${escapeHtml(item[field.key] || '')}</textarea></div>`;
    }
    return `<div class="field ${wide}"><label>${field.label}</label><input data-person-value="${field.key}" type="${field.type || 'text'}" value="${escapeHtml(item[field.key] || '')}" placeholder="${field.placeholder || ''}" /></div>`;
  }).join('');
  return `<div class="person-repeat-row" data-repeat-row="${key}">${fields}<button class="danger-button person-remove-row" type="button" data-remove-person-row="${key}" aria-label="Remove ${definition.title} entry">Remove</button></div>`;
}

function renderRepeater(key, items = [], people = []) {
  const definition = repeaters[key];
  return `<fieldset class="person-section person-repeater" data-person-repeater="${key}"><legend>${definition.title}</legend><div class="person-repeater-list">${items.map((item) => renderRepeatRow(key, item, people)).join('')}</div><button class="secondary-button person-add-row" type="button" data-add-person-row="${key}">Add ${definition.title.replace(/s$/, '').toLowerCase()}</button></fieldset>`;
}

function personSearchText(person) {
  const address = typeof person.address === 'object' && person.address ? person.address : { street: person.address || '' };
  return [
    person.name, person.alias, person.personId, person.category, person.dob, person.nationality, person.occupation, person.employer,
    ...Object.values(address), ...(person.emails || []).flatMap((item) => [item.label, item.address]),
    ...(person.phoneNumbers || []).flatMap((item) => [item.label, item.number]),
    ...(person.socialAccounts || []).flatMap((item) => [item.platform, item.username, item.url]),
    person.license?.number, person.license?.jurisdiction,
    ...(person.vehicles || []).flatMap((item) => [item.make, item.model, item.licensePlate, item.vin]),
    ...(person.relatives || []).flatMap((item) => [item.name, item.relationship, item.personId]), ...(person.tags || [])
  ].filter(Boolean).join(' ');
}

export async function renderPersons() {
  const persons = await getAllFromStore('persons');
  const categories = [...new Set(persons.map((person) => person.category).filter(Boolean))].sort();
  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div><div class="panel-title">Personnel Index</div><div class="muted">${persons.length} personnel file${persons.length === 1 ? '' : 's'}</div></div>
          <button class="primary-button" data-action="create-person">Add person</button>
        </div>
        <div class="person-index-tools">
          <input id="person-search" type="search" placeholder="Search names, contacts, vehicles, relatives, identifiers..." aria-label="Search personnel records" />
          <select id="person-category-filter" aria-label="Filter by personnel category"><option value="">All categories</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}</select>
        </div>
        <div class="table-scroll"><table class="table">
          <thead><tr><th>ID</th><th>Name</th><th>Alias</th><th>Category</th><th>Contact points</th><th>Address</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody>${persons.length ? persons.map((person) => {
            const address = typeof person.address === 'object' && person.address ? person.address : { street: person.address || '' };
            return `<tr data-person-row data-category="${escapeHtml(person.category || 'Other')}" data-search-text="${escapeHtml(personSearchText(person))}">
              <td class="code">${escapeHtml(person.personId || person.id)}</td><td>${escapeHtml(person.name)}</td><td>${escapeHtml(person.alias || '—')}</td><td>${escapeHtml(person.category || 'Other')}</td>
              <td>${(person.emails || []).length} email · ${(person.phoneNumbers || []).length} phone</td>
              <td>${escapeHtml([address.city, address.region, address.country].filter(Boolean).join(', ') || address.street || '—')}</td><td>${formatDate(person.updatedAt || person.dateCreated)}</td>
              <td><div class="action-row"><button class="secondary-button" data-action="view-person" data-id="${escapeHtml(person.id)}">Open</button><button class="secondary-button" data-action="edit-person" data-id="${escapeHtml(person.id)}">Edit</button><button class="danger-button" data-action="delete-person" data-id="${escapeHtml(person.id)}">Delete</button></div></td>
            </tr>`;
          }).join('') : '<tr><td colspan="8"><div class="empty-state">No personnel files exist.</div></td></tr>'}</tbody>
        </table></div>
        <div id="person-search-empty" class="empty-state" hidden>No personnel files match this search.</div>
      </section>
    </div>
  `;
}

export function initializePersonFilters() {
  const search = document.getElementById('person-search');
  const category = document.getElementById('person-category-filter');
  if (!search || !category) return;
  const applyFilter = () => {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('[data-person-row]').forEach((row) => {
      const matches = (!query || row.dataset.searchText.toLowerCase().includes(query)) && (!category.value || row.dataset.category === category.value);
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    const empty = document.getElementById('person-search-empty');
    if (empty) empty.hidden = visible > 0;
  };
  search.oninput = applyFilter;
  category.onchange = applyFilter;
}

export async function openPersonModal(id = '') {
  const person = id ? await getRecordById('persons', id) : null;
  if (id && !person) return;
  const people = (await getAllFromStore('persons')).filter((item) => item.id !== id);
  const address = typeof person?.address === 'object' && person.address ? person.address : { street: person?.address || '' };
  const license = person?.license || {};
  const body = `
    <form id="person-form" class="person-form-layout">
      <fieldset class="person-section"><legend>Identity</legend><div class="person-form-grid">
        <div class="field"><label>Full name</label><input name="name" required value="${escapeHtml(person?.name || '')}" /></div>
        <div class="field"><label>Known aliases</label><input name="alias" value="${escapeHtml(person?.alias || '')}" placeholder="Comma-separated names" /></div>
        <div class="field"><label>Category</label><select name="category">${['Person of interest', 'Witness', 'Reporting party', 'Subject', 'Victim', 'Investigator', 'Other'].map((value) => `<option ${person?.category === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
        <div class="field"><label>Record status</label><select name="recordStatus">${['Active', 'Unconfirmed', 'Archived', 'Protected'].map((value) => `<option ${person?.recordStatus === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
        <div class="field"><label>Date of birth</label><input name="dob" type="date" value="${escapeHtml(person?.dob || '')}" /></div>
        <div class="field"><label>Nationality</label><input name="nationality" value="${escapeHtml(person?.nationality || '')}" /></div>
        <div class="field"><label>Occupation</label><input name="occupation" value="${escapeHtml(person?.occupation || '')}" /></div>
        <div class="field"><label>Employer / organization</label><input name="employer" value="${escapeHtml(person?.employer || '')}" /></div>
        <div class="field person-form-field-wide"><label>Physical description</label><textarea name="physicalDescription">${escapeHtml(person?.physicalDescription || '')}</textarea></div>
        <div class="field person-form-field-wide"><label>Profile summary</label><textarea name="description">${escapeHtml(person?.description || '')}</textarea></div>
      </div></fieldset>
      <fieldset class="person-section"><legend>Address</legend><div class="person-form-grid">
        <div class="field person-form-field-wide"><label>Street address</label><input name="street" value="${escapeHtml(address.street || '')}" /></div>
        <div class="field"><label>City</label><input name="city" value="${escapeHtml(address.city || '')}" /></div>
        <div class="field"><label>State / region</label><input name="region" value="${escapeHtml(address.region || '')}" /></div>
        <div class="field"><label>Postal code</label><input name="postalCode" value="${escapeHtml(address.postalCode || '')}" /></div>
        <div class="field"><label>Country</label><input name="country" value="${escapeHtml(address.country || '')}" /></div>
      </div></fieldset>
      ${renderRepeater('emails', person?.emails || [], people)}
      ${renderRepeater('phoneNumbers', person?.phoneNumbers || [], people)}
      ${renderRepeater('socialAccounts', person?.socialAccounts || [], people)}
      <fieldset class="person-section"><legend>License information</legend><div class="person-form-grid">
        <div class="field"><label>License number</label><input name="licenseNumber" value="${escapeHtml(license.number || '')}" /></div>
        <div class="field"><label>Class / type</label><input name="licenseType" value="${escapeHtml(license.type || '')}" /></div>
        <div class="field"><label>Issuing authority</label><input name="licenseAuthority" value="${escapeHtml(license.issuingAuthority || '')}" /></div>
        <div class="field"><label>Jurisdiction</label><input name="licenseJurisdiction" value="${escapeHtml(license.jurisdiction || '')}" /></div>
        <div class="field"><label>Issue date</label><input name="licenseIssueDate" type="date" value="${escapeHtml(license.issueDate || '')}" /></div>
        <div class="field"><label>Expiration date</label><input name="licenseExpirationDate" type="date" value="${escapeHtml(license.expirationDate || '')}" /></div>
        <div class="field"><label>License status</label><select name="licenseStatus">${['Unknown', 'Valid', 'Expired', 'Suspended', 'Revoked'].map((value) => `<option ${license.status === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div>
      </div></fieldset>
      ${renderRepeater('vehicles', person?.vehicles || [], people)}
      ${renderRepeater('relatives', person?.relatives || [], people)}
      <fieldset class="person-section"><legend>Tags and notes</legend><div class="person-form-grid">
        <div class="field person-form-field-wide"><label>Tags</label><input name="tags" value="${escapeHtml((person?.tags || []).join(', '))}" placeholder="Comma-separated tags" /></div>
        <div class="field person-form-field-wide"><label>Additional notes</label><textarea name="notes">${escapeHtml(person?.notes || '')}</textarea></div>
      </div></fieldset>
      <fieldset class="person-section"><legend>Photos and supporting files</legend><div class="field"><label>Add photos or files</label><input name="attachments" type="file" multiple accept="image/*,.pdf,.txt,.docx,.mp4,.mp3,.wav" /></div></fieldset>
    </form>
  `;
  const footer = `<button class="secondary-button" type="button" data-close-modal="true">Cancel</button><button class="primary-button" type="submit" form="person-form">${person ? 'Save dossier' : 'Create dossier'}</button>`;
  const modal = openModal({ title: person ? `Edit personnel file · ${person.personId || person.id}` : 'Create personnel file', body, footer });
  const form = modal?.querySelector('#person-form');
  form?.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-person-row]');
    const removeButton = event.target.closest('[data-remove-person-row]');
    if (addButton) {
      const key = addButton.dataset.addPersonRow;
      form.querySelector(`[data-person-repeater="${key}"] .person-repeater-list`).insertAdjacentHTML('beforeend', renderRepeatRow(key, {}, people));
    }
    if (removeButton) removeButton.closest('.person-repeat-row')?.remove();
  });
  form?.addEventListener('change', (event) => {
    if (event.target.dataset.personValue !== 'personId') return;
    const selected = event.target.selectedOptions[0];
    const nameInput = event.target.closest('.person-repeat-row')?.querySelector('[data-person-value="name"]');
    if (nameInput && selected?.dataset.personName) nameInput.value = selected.dataset.personName;
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentForm = event.currentTarget;
    const formData = new FormData(currentForm);
    const collect = (key) => Array.from(currentForm.querySelectorAll(`[data-repeat-row="${key}"]`)).map((row) => Object.fromEntries(Array.from(row.querySelectorAll('[data-person-value]'), (input) => [input.dataset.personValue, input.value.trim()]))).filter((item) => Object.values(item).some(Boolean));
    const existing = person || {};
    const now = new Date().toISOString();
    const record = {
      ...existing,
      id: existing.id || uid('person'),
      personId: existing.personId || `PER-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      name: String(formData.get('name') || '').trim(),
      alias: String(formData.get('alias') || '').split(',').map((value) => value.trim()).filter(Boolean).join(', '),
      category: formData.get('category') || 'Other', recordStatus: formData.get('recordStatus') || 'Active',
      dob: formData.get('dob') || '', nationality: formData.get('nationality') || '', occupation: formData.get('occupation') || '',
      employer: formData.get('employer') || '', physicalDescription: formData.get('physicalDescription') || '',
      description: formData.get('description') || '', notes: formData.get('notes') || '',
      address: { street: formData.get('street') || '', city: formData.get('city') || '', region: formData.get('region') || '', postalCode: formData.get('postalCode') || '', country: formData.get('country') || '' },
      emails: collect('emails'), phoneNumbers: collect('phoneNumbers'), socialAccounts: collect('socialAccounts'),
      license: {
        number: formData.get('licenseNumber') || '', type: formData.get('licenseType') || '', issuingAuthority: formData.get('licenseAuthority') || '',
        jurisdiction: formData.get('licenseJurisdiction') || '', issueDate: formData.get('licenseIssueDate') || '',
        expirationDate: formData.get('licenseExpirationDate') || '', status: formData.get('licenseStatus') || 'Unknown'
      },
      vehicles: collect('vehicles'), relatives: collect('relatives'),
      tags: String(formData.get('tags') || '').split(',').map((tag) => tag.trim()).filter(Boolean),
      updatedAt: now, dateCreated: existing.dateCreated || now
    };
    if (existing.id) await updateRecord('persons', record);
    else await addRecord('persons', record);
    const files = Array.from(currentForm.querySelector('input[name="attachments"]')?.files || []);
    if (files.length) await saveFilesForEntity('person', record.id, files);
    await createActivityLog(existing.id ? 'updated' : 'created', 'person', record.id, `${existing.id ? 'Updated' : 'Created'} personnel file ${record.personId}`);
    showToast({ type: 'success', message: existing.id ? 'Personnel file updated.' : 'Personnel file created.' });
    modal.remove();
    if (existing.id) await renderPersonDetail(record.id);
    else await window.BLACKBOX?.navigate('persons');
  });
}

function formatAddress(addressValue) {
  const address = typeof addressValue === 'object' && addressValue ? addressValue : { street: addressValue || '' };
  return [address.street, address.city, address.region, address.postalCode, address.country].filter(Boolean).join(', ');
}

function renderValue(value) {
  return value === undefined || value === null || value === '' ? '—' : escapeHtml(value);
}

async function renderPersonDetail(personId) {
  const person = await getRecordById('persons', personId);
  if (!person) return;
  const attachments = await getAttachmentsForEntity('person', person.id);
  const attachmentMarkup = attachments.length ? attachments.map(buildAttachmentPreview).join('') : '<div class="empty-state">No photos or files attached.</div>';
  const list = (items, mapper, emptyText) => items?.length ? `<div class="person-record-list">${items.map(mapper).join('')}</div>` : `<div class="muted">${emptyText}</div>`;
  document.getElementById('content').innerHTML = `
    <div class="panel-grid person-dossier-grid">
      <section class="panel person-dossier-header" style="grid-column: span 12;">
        <div class="panel-header"><div><div class="panel-title">Personnel file · ${renderValue(person.personId || person.id)}</div><h2>${renderValue(person.name)}</h2><span class="badge">${renderValue(person.recordStatus || 'Active')}</span></div><div class="action-row"><button class="secondary-button" data-person-action="edit">Edit dossier</button><button class="secondary-button" data-person-action="back">Back to index</button></div></div>
        <div class="person-dossier-summary">${[['Category', person.category], ['Aliases', person.alias], ['Date of birth', person.dob], ['Nationality', person.nationality], ['Occupation', person.occupation], ['Employer', person.employer]].map(([label, value]) => `<div><strong>${label}</strong><span>${renderValue(value)}</span></div>`).join('')}</div>
      </section>
      <section class="panel" style="grid-column: span 6;"><div class="panel-title">Contact channels</div><h3>Address</h3><div class="person-dossier-value">${renderValue(formatAddress(person.address))}</div><h3>Email</h3>${list(person.emails, (item) => `<div class="person-detail-row"><strong>${renderValue(item.label || 'Email')}</strong><span>${renderValue(item.address)}</span></div>`, 'No email addresses recorded.')}<h3>Phone</h3>${list(person.phoneNumbers, (item) => `<div class="person-detail-row"><strong>${renderValue(item.label || 'Phone')}</strong><span>${renderValue(item.number)}</span></div>`, 'No phone numbers recorded.')}<h3>Social accounts</h3>${list(person.socialAccounts, (item) => `<div class="person-detail-row"><strong>${renderValue(item.platform)}</strong><span>${renderValue(item.username)}${item.url ? ` · ${renderValue(item.url)}` : ''}</span></div>`, 'No social accounts recorded.')}</section>
      <section class="panel" style="grid-column: span 6;"><div class="panel-title">License information</div><div class="person-dossier-value"><strong>Number:</strong> ${renderValue(person.license?.number)}</div><div class="person-dossier-value"><strong>Class / type:</strong> ${renderValue(person.license?.type)}</div><div class="person-dossier-value"><strong>Issuing authority:</strong> ${renderValue(person.license?.issuingAuthority)}</div><div class="person-dossier-value"><strong>Jurisdiction:</strong> ${renderValue(person.license?.jurisdiction)}</div><div class="person-dossier-value"><strong>Issued / expires:</strong> ${renderValue(person.license?.issueDate)} / ${renderValue(person.license?.expirationDate)}</div><div class="person-dossier-value"><strong>Status:</strong> ${renderValue(person.license?.status)}</div><h3>Physical description</h3><p>${renderValue(person.physicalDescription || person.description || 'No description recorded.')}</p></section>
      <section class="panel" style="grid-column: span 12;"><div class="panel-title">Vehicles</div>${list(person.vehicles, (item) => `<article class="person-item-card"><strong>${renderValue([item.year, item.color, item.make, item.model].filter(Boolean).join(' ') || 'Unspecified vehicle')}</strong><div>Plate: ${renderValue(item.licensePlate)} · VIN: ${renderValue(item.vin)}</div><p>${renderValue(item.notes)}</p></article>`, 'No vehicles recorded.')}</section>
      <section class="panel" style="grid-column: span 6;"><div class="panel-title">Relatives and associates</div>${list(person.relatives, (item) => `<div class="person-detail-row"><span><strong>${renderValue(item.name || 'Unnamed')}</strong> · ${renderValue(item.relationship)}<div class="muted">${renderValue(item.notes)}</div></span>${item.personId ? `<button class="secondary-button" type="button" data-open-relative="${escapeHtml(item.personId)}">Open linked file</button>` : ''}</div>`, 'No relatives or associates recorded.')}</section>
      <section class="panel" style="grid-column: span 6;"><div class="panel-title">Tags and notes</div><div class="note-tags">${(person.tags || []).map((tag) => `<span>${renderValue(tag)}</span>`).join('') || '<span>No tags</span>'}</div><p>${renderValue(person.notes)}</p><div class="muted">Created ${renderValue(formatDate(person.dateCreated))} · Updated ${renderValue(formatDate(person.updatedAt))}</div></section>
      <section class="panel" style="grid-column: span 12;"><div class="panel-header"><div class="panel-title">Photos and supporting files</div></div>${attachmentMarkup}<div class="person-file-upload"><label for="person-attachment-input-${escapeHtml(person.id)}">Attach photos or files</label><input id="person-attachment-input-${escapeHtml(person.id)}" type="file" multiple accept="image/*,.pdf,.txt,.docx,.mp4,.mp3,.wav" /><button class="primary-button" type="button" data-person-action="attach">Add attachments</button></div></section>
    </div>`;
  const content = document.getElementById('content');
  content.querySelector('[data-person-action="back"]')?.addEventListener('click', () => window.BLACKBOX.navigate('persons'));
  content.querySelector('[data-person-action="edit"]')?.addEventListener('click', () => openPersonModal(person.id));
  content.querySelector('[data-person-action="attach"]')?.addEventListener('click', async () => {
    const input = content.querySelector(`#person-attachment-input-${CSS.escape(person.id)}`);
    const files = Array.from(input?.files || []);
    if (!files.length) {
      showToast({ type: 'error', message: 'Select at least one photo or file.' });
      return;
    }
    await saveFilesForEntity('person', person.id, files);
    await createActivityLog('attached', 'person', person.id, `Attached ${files.length} file${files.length === 1 ? '' : 's'} to ${person.personId}`);
    showToast({ type: 'success', message: `${files.length} file${files.length === 1 ? '' : 's'} attached.` });
    await renderPersonDetail(person.id);
  });
  content.querySelectorAll('[data-open-relative]').forEach((button) => button.addEventListener('click', () => handlePersonAction('view-person', button.dataset.openRelative)));
}

export async function handlePersonAction(action, id) {
  if (action === 'view-person') await renderPersonDetail(id);
  if (action === 'delete-person' && window.confirm('Delete this personnel file? This cannot be undone.')) {
    const attachments = await getAttachmentsForEntity('person', id);
    for (const attachment of attachments) await deleteAttachment(attachment.id);
    await deleteRecord('persons', id);
    await createActivityLog('deleted', 'person', id, `Deleted personnel file ${id}`);
    showToast({ type: 'success', message: 'Personnel file removed.' });
    await window.BLACKBOX?.navigate('persons');
  }
}

export function filterPersons() {
  const search = document.getElementById('person-search');
  const category = document.getElementById('person-category-filter');
  if (!search || !category) return;
  const query = search.value.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll('[data-person-row]').forEach((row) => {
    const matches = (!query || row.dataset.searchText.toLowerCase().includes(query)) && (!category.value || row.dataset.category === category.value);
    row.hidden = !matches;
    if (matches) visible += 1;
  });
  document.getElementById('person-search-empty').hidden = visible > 0;
}