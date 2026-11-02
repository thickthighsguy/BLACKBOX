import { state } from '../state.js';
import { navigate } from '../app.js';
import { formatDate } from '../utilities.js';

const navItems = [
  { key: 'dashboard', label: 'Operations Overview' },
  { key: 'investigations', label: 'Case Files' },
  { key: 'evidence', label: 'Artifact Register' },
  { key: 'persons', label: 'Personnel Index' },
  { key: 'locations', label: 'Site Registry' },
  { key: 'timeline', label: 'Event Chronology' },
  { key: 'relationships', label: 'Connections' },
  { key: 'intelligence', label: 'Signal Board' },
  { key: 'notes', label: 'Field Notes' },
  { key: 'terminal', label: 'Operator Console' },
  { key: 'diagnostics', label: 'System Diagnostics' },
  { key: 'settings', label: 'System Settings' }
];

export function renderNavigation() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const navButtons = navItems.map((item) => `
    <button class="nav-item ${state.route === item.key ? 'active' : ''}" data-nav="${item.key}">
      <span>
        <strong>${item.label.charAt(0)}</strong>
        ${item.label}
      </span>
      <span class="nav-badge">${item.key === 'dashboard' ? '•' : ''}</span>
    </button>
  `).join('');

  sidebar.innerHTML = `
    <div class="logo">
      <div class="logo-mark" aria-hidden="true">E</div>
      <div class="brand-lockup">
        <div class="logo-text">E.C.H.O.</div>
        <div class="brand-subtitle">Electronic Cultured Home Operator</div>
      </div>
    </div>

    <nav class="nav-section">
      ${navButtons}
    </nav>

    <div class="sidebar-footer">
      <div class="status-box">
        <div class="status-row"><span>Archive</span><strong>Online</strong></div>
        <div class="status-row"><span>Network</span><strong>Isolated</strong></div>
        <div class="status-row"><span>Access</span><strong>Operator</strong></div>
        <div class="status-row"><span>Local time</span><strong>${formatDate(new Date().toISOString())}</strong></div>
      </div>
    </div>
  `;

  sidebar.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.nav));
  });
}

export function renderTopbar() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  const labels = {
    dashboard: 'Operations Overview',
    investigations: 'Case Files',
    evidence: 'Artifact Register',
    persons: 'Personnel Index',
    locations: 'Site Registry',
    timeline: 'Event Chronology',
    relationships: 'Connections',
    intelligence: 'Signal Board',
    notes: 'Field Notes',
    terminal: 'Operator Console',
    diagnostics: 'System Diagnostics',
    settings: 'System Settings'
  };

  topbar.innerHTML = `
    <div class="topbar-left">
      <div class="global-search">
        <span>⌕</span>
        <input id="global-search-input" type="text" placeholder="Search investigations, evidence, persons, notes..." />
        <span class="search-shortcut">Ctrl+K</span>
      </div>
    </div>
    <div class="topbar-right">
      <div class="page-title">${labels[state.route] || 'Overview'}</div>
      <button class="primary-button" id="quick-create-button">Quick Create</button>
      <button class="secondary-button" id="lock-session-button" title="Lock E.C.H.O. session">Lock</button>
      <button class="icon-button" id="notification-button" aria-label="Notifications">🔔</button>
      <button class="icon-button" id="settings-button" aria-label="Settings">⚙</button>
    </div>
  `;

  const settingsBtn = document.getElementById('settings-button');
  settingsBtn?.addEventListener('click', () => navigate('settings'));

  document.getElementById('lock-session-button')?.addEventListener('click', async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.replace('/');
  });

  const quickBtn = document.getElementById('quick-create-button');
  quickBtn?.addEventListener('click', () => navigate('investigations'));

  const searchInput = document.getElementById('global-search-input');
  searchInput?.addEventListener('input', (event) => {
    state.filters.search = event.target.value.trim();
    if (state.route === 'dashboard') {
      navigate('dashboard');
    }
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      searchInput?.focus();
    }
  });
}
