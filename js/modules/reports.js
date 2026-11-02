import { getAllFromStore } from '../database.js';
import { showToast } from '../components/notifications.js';

const reportSections = [
  {
    store: 'investigations',
    title: 'Case files',
    fields: [
      ['Case', 'caseNumber'], ['Title', 'title'], ['Status', 'status'], ['Priority', 'priority'],
      ['Investigator', 'assignedInvestigator'], ['Created', 'dateCreated'], ['Description', 'description']
    ]
  },
  {
    store: 'evidence',
    title: 'Artifact register',
    fields: [
      ['ID', 'evidenceId'], ['Name', 'name'], ['Type', 'type'], ['Status', 'status'],
      ['Source', 'source'], ['Collected', 'collectionDate'], ['Description', 'description']
    ]
  },
  {
    store: 'persons',
    title: 'Personnel index',
    fields: [['ID', 'personId'], ['Name', 'name'], ['Alias', 'alias'], ['Category', 'category'], ['Description', 'description']]
  },
  {
    store: 'locations',
    title: 'Site registry',
    fields: [['ID', 'locationId'], ['Name', 'name'], ['Category', 'category'], ['Address', 'address'], ['Notes', 'notes']]
  },
  {
    store: 'events',
    title: 'Event chronology',
    fields: [['ID', 'eventId'], ['Event', 'title'], ['Date', 'date'], ['Case', 'investigationId'], ['Assessment', 'relationType'], ['Compared event', 'relatedEventId'], ['Analysis note', 'relationNote'], ['Resolved', 'conflictResolved'], ['Description', 'description']]
  },
  {
    store: 'relationships',
    title: 'Connections',
    fields: [['Source', 'sourceId'], ['Target', 'targetId'], ['Relationship', 'type'], ['Notes', 'notes']]
  },
  {
    store: 'attachments',
    title: 'Attachment register',
    fields: [['File', 'fileName'], ['Record type', 'entityType'], ['Record ID', 'entityId'], ['Content type', 'mimeType'], ['Size (bytes)', 'size'], ['SHA-256', 'sha256']]
  }
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatValue(value) {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderSection(section, records) {
  const rows = records.length
    ? records.map((record) => `<tr>${section.fields.map(([, key]) => `<td>${escapeHtml(formatValue(record[key]))}</td>`).join('')}</tr>`).join('')
    : `<tr><td class="empty" colspan="${section.fields.length}">No records</td></tr>`;

  return `
    <section class="report-section">
      <div class="section-heading"><h2>${escapeHtml(section.title)}</h2><span>${records.length} records</span></div>
      <div class="table-wrap"><table><thead><tr>${section.fields.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    </section>
  `;
}

export async function generateArchiveReport() {
  try {
    const recordsByStore = Object.fromEntries(await Promise.all(
      reportSections.map(async (section) => [section.store, await getAllFromStore(section.store)])
    ));
    const generatedAt = new Date();
    const reportId = `ECHO-${generatedAt.toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)}`;
    const totalRecords = Object.values(recordsByStore).reduce((total, records) => total + records.length, 0);
    const sections = reportSections.map((section) => renderSection(section, recordsByStore[section.store])).join('');
    const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>E.C.H.O. Archive Report ${reportId}</title>
<style>
  :root{color-scheme:light;--ink:#1d271e;--muted:#5e6a5e;--line:#cbd2c8;--accent:#8a542b;--wash:#f2f4ef}
  *{box-sizing:border-box}body{margin:0;padding:40px;color:var(--ink);font:14px/1.5 Georgia,serif}
  header{padding:0 0 24px;border-bottom:3px solid var(--ink)}.eyebrow{color:var(--accent);font:700 11px/1.4 monospace;letter-spacing:.08em;text-transform:uppercase}
  h1{margin:9px 0 4px;font-size:30px}.subtitle{margin:0;color:var(--muted)}.metadata{display:flex;gap:28px;flex-wrap:wrap;margin-top:22px;font:12px/1.5 monospace}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;margin:26px 0;background:var(--line);border:1px solid var(--line)}
  .summary div{padding:12px;background:var(--wash)}.summary strong{display:block;font:700 21px/1.2 monospace}.summary span{color:var(--muted);font:10px/1.4 monospace;text-transform:uppercase}
  .report-section{margin:30px 0;break-inside:avoid}.section-heading{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--line)}
  h2{margin:0 0 8px;font-size:19px}.section-heading span{color:var(--muted);font:11px monospace}.table-wrap{overflow-x:auto}
  table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}
  th{background:var(--wash);font:700 10px/1.4 monospace;text-transform:uppercase}.empty{color:var(--muted);text-align:center}
  footer{margin-top:42px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font:10px monospace}
  @media(max-width:640px){body{padding:20px}h1{font-size:25px}}
  @media print{body{padding:0}header,.summary,.report-section{break-inside:avoid}.table-wrap{overflow:visible}th,td{padding:5px;font-size:9px}}
</style></head><body>
<header><div class="eyebrow">E.C.H.O. · Local Archive</div><h1>Archive Activity Report</h1><p class="subtitle">Electronic Cultured Home Operator</p>
<div class="metadata"><span>REPORT ${reportId}</span><span>GENERATED ${escapeHtml(generatedAt.toLocaleString())}</span><span>CLASSIFICATION: OPERATOR COPY</span></div></header>
<div class="summary"><div><strong>${totalRecords}</strong><span>Included records</span></div>${reportSections.map((section) => `<div><strong>${recordsByStore[section.store].length}</strong><span>${escapeHtml(section.title)}</span></div>`).join('')}</div>
${sections}<footer>Generated locally by E.C.H.O. · This report reflects records available at generation time.</footer>
</body></html>`;

    const blob = new Blob([document], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `echo-report-${generatedAt.toISOString().slice(0, 10)}.html`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast({ type: 'success', message: `Archive report generated with ${totalRecords} records.` });
  } catch (error) {
    console.error(error);
    showToast({ type: 'error', message: 'Could not generate the archive report.' });
  }
}