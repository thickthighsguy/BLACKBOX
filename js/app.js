import { ensureDefaultSettings, getStorageUsage, openDatabase, readSettings, saveSettings, saveFilesForEntity } from './database.js';
import { state, setRoute } from './state.js';
import { renderNavigation, renderTopbar } from './components/navigation.js';
import { showToast } from './components/notifications.js';
import { renderDashboard } from './modules/dashboard.js';
import { renderInvestigations, openInvestigationModal, handleInvestigationAction } from './modules/investigations.js';
import { renderEvidence, openEvidenceModal, handleEvidenceAction } from './modules/evidence.js';
import { renderPersons, openPersonModal, handlePersonAction, initializePersonFilters } from './modules/persons.js';
import { renderLocations, openLocationModal, handleLocationAction } from './modules/locations.js';
import { renderNotes, saveNoteFromEditor, openNote, filterNotes, deleteNote, startNewNote, hasUnsavedNote, initializeNoteEditor } from './modules/notes.js';
import { renderTimeline, openEventModal, handleTimelineAction } from './modules/timeline.js';
import { renderRelationships, openRelationshipModal, handleRelationshipAction } from './modules/relationships.js';
import { renderIntelligence, openIntelNodeModal, openIntelEntityModal, openIntelConnectionModal, syncIntelligenceNodes, handleIntelligenceAction, zoomIntelligenceGraph, resetIntelligenceLayout, initializeIntelligenceBoard } from './modules/intelligence.js';
import { applySettings, clearDatabase, exportBackup, importBackup, renderSettings } from './modules/settings.js';
import { renderTerminal } from './modules/terminal.js';
import { generateArchiveReport } from './modules/reports.js';
import { renderDiagnostics, exportDiagnostics } from './modules/diagnostics.js';

const routeMap = {
  dashboard: renderDashboard,
  investigations: renderInvestigations,
  evidence: renderEvidence,
  persons: renderPersons,
  locations: renderLocations,
  timeline: renderTimeline,
  relationships: renderRelationships,
  intelligence: renderIntelligence,
  notes: renderNotes,
  settings: renderSettings,
  terminal: renderTerminal,
  diagnostics: renderDiagnostics
};

export async function initializeApp() {
  try {
    state.db = await openDatabase();
    await ensureDefaultSettings();
    const settings = await readSettings();
    state.settings = { ...state.settings, ...settings };
    renderShell();
    setRoute('dashboard');
    renderCurrentView();
    showToast({ type: 'success', message: 'E.C.H.O. archive initialized.' });
  } catch (error) {
    console.error(error);
    showToast({ type: 'error', message: 'Database initialization failed.' });
  }
}

export function renderShell() {
  renderNavigation();
  renderTopbar();
}

export async function renderCurrentView() {
  const content = document.getElementById('content');
  const renderFn = routeMap[state.route] || renderDashboard;
  if (content) {
    content.innerHTML = '<div class="empty-state">Loading...</div>';
    const result = await renderFn();
    if (result) {
      content.innerHTML = result;
    }
  }
  renderNavigation();
  renderTopbar();
  bindActionHandlers();
}

function bindActionHandlers() {
  const content = document.getElementById('content');
  if (!content) return;

  content.querySelectorAll('[data-action]').forEach((button) => {
    button.onclick = async () => {
      const action = button.dataset.action;
      const id = button.dataset.id;

      switch (action) {
        case 'create-investigation':
          openInvestigationModal();
          break;
        case 'create-evidence':
          openEvidenceModal();
          break;
        case 'create-person':
          await openPersonModal();
          break;
        case 'edit-person':
          await openPersonModal(id);
          break;
        case 'create-location':
          openLocationModal();
          break;
        case 'create-note':
          if (state.route !== 'notes') await navigate('notes');
          startNewNote();
          break;
        case 'create-event':
          await openEventModal();
          break;
        case 'create-relationship':
          openRelationshipModal();
          break;
        case 'create-intel-node':
          openIntelNodeModal();
          break;
        case 'attach-intel-record':
          await openIntelEntityModal();
          break;
        case 'create-intel-connection':
          await openIntelConnectionModal();
          break;
        case 'sync-intel-nodes':
          await syncIntelligenceNodes();
          break;
        case 'view-intel-node':
          await handleIntelligenceAction(action, id);
          break;
        case 'view-intel-connection':
          await handleIntelligenceAction(action, id);
          break;
        case 'intel-zoom-in':
          zoomIntelligenceGraph(1.25);
          break;
        case 'intel-zoom-out':
          zoomIntelligenceGraph(0.8);
          break;
        case 'intel-zoom-reset':
          zoomIntelligenceGraph(1);
          break;
        case 'reset-intel-layout':
          await resetIntelligenceLayout();
          break;
        case 'save-note':
          await saveNoteFromEditor();
          break;
        case 'open-note':
          await openNote(id);
          break;
        case 'delete-note':
          await deleteNote(id);
          break;
        case 'view-case':
          await handleInvestigationAction('view-case', id);
          break;
        case 'view-event':
          await handleTimelineAction('view-event', id);
          break;
        case 'resolve-event-conflict':
          await handleTimelineAction('resolve-event-conflict', id);
          break;
        case 'delete-event':
          await handleTimelineAction('delete-event', id);
          break;
        case 'view-relationship':
          await handleRelationshipAction('view-relationship', id);
          break;
        case 'delete-relationship':
          await handleRelationshipAction('delete-relationship', id);
          break;
        case 'delete-case':
          await handleInvestigationAction('delete-case', id);
          break;
        case 'view-evidence':
          await handleEvidenceAction('view-evidence', id);
          break;
        case 'delete-evidence':
          await handleEvidenceAction('delete-evidence', id);
          break;
        case 'view-person':
          await handlePersonAction('view-person', id);
          break;
        case 'delete-person':
          await handlePersonAction('delete-person', id);
          break;
        case 'view-location':
          await handleLocationAction('view-location', id);
          break;
        case 'delete-location':
          await handleLocationAction('delete-location', id);
          break;
        case 'apply-settings':
          await applySettings();
          break;
        case 'export-backup':
          await exportBackup();
          break;
        case 'clear-database':
          await clearDatabase();
          break;
        case 'back-to-list':
          navigate('investigations');
          break;
        case 'back-to-evidence':
          navigate('evidence');
          break;
        case 'back-to-persons':
          navigate('persons');
          break;
        case 'back-to-locations':
          navigate('locations');
          break;
        case 'back-to-notes':
          navigate('notes');
          break;
        case 'back-to-timeline':
          navigate('timeline');
          break;
        case 'back-to-relationships':
          navigate('relationships');
          break;
        case 'generate-report':
          await generateArchiveReport();
          break;
        case 'refresh-diagnostics':
          await navigate('diagnostics');
          break;
        case 'export-diagnostics':
          await exportDiagnostics();
          break;
        case 'import-backup':
          importBackup('replace');
          break;
        case 'merge-backup':
          importBackup('merge');
          break;
        case 'attach-files': {
          const entity = button.dataset.entity || 'evidence';
          const entityId = button.dataset.id;
          const input = document.getElementById(`attachment-input-${entityId}`);
          const files = input && input.files ? Array.from(input.files) : [];

          if (!entityId || !files.length) {
            showToast({ type: 'error', message: 'Select at least one file to attach.' });
            break;
          }

          await saveFilesForEntity(entity, entityId, files);
          showToast({ type: 'success', message: 'Attachment saved.' });
          window.BLACKBOX?.navigate(window.BLACKBOX.state.route || 'dashboard');
          break;
        }
        default:
          break;
      }
    };
  });

  const noteFilter = document.getElementById('note-filter');
  if (noteFilter) noteFilter.oninput = () => filterNotes(noteFilter.value);
  if (state.route === 'notes') initializeNoteEditor();
  if (state.route === 'persons') initializePersonFilters();
  if (state.route === 'intelligence') initializeIntelligenceBoard();
}

export function navigate(view) {
  if (state.route === 'notes' && view !== 'notes' && hasUnsavedNote() && !window.confirm('Discard unsaved note changes and leave Field Notes?')) {
    return Promise.resolve(false);
  }
  setRoute(view);
  return renderCurrentView();
}

export async function refreshAll() {
  const settings = await readSettings();
  state.settings = { ...state.settings, ...settings };
  renderShell();
  renderCurrentView();
}

export async function setTheme(theme) {
  state.settings.theme = theme;
  await saveSettings(state.settings);
  document.body.dataset.theme = theme;
}

export async function getCurrentUsage() {
  return getStorageUsage();
}

window.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

window.BLACKBOX = {
  navigate,
  refreshAll,
  setTheme,
  getCurrentUsage,
  state
};
