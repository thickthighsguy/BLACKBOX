import { getAllFromStore, getStats, getStorageUsage } from '../database.js';
import { state } from '../state.js';
import { formatDate, formatShortDate } from '../utilities.js';

export async function renderDashboard() {
  const [stats, activity, investigations, storage] = await Promise.all([
    getStats(),
    getAllFromStore('activityLog'),
    getAllFromStore('investigations'),
    getStorageUsage()
  ]);

  const recentActivity = [...activity].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 6);
  const recentInvestigations = [...investigations].sort((a, b) => new Date(b.updatedAt || b.dateCreated) - new Date(a.updatedAt || a.dateCreated)).slice(0, 4);

  return `
    <div class="panel-grid">
      <section class="panel" style="grid-column: span 12;">
        <div class="panel-header">
          <div class="panel-title">Operational overview</div>
        </div>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-label">Total investigations</div><div class="stat-value">${stats.totalInvestigations}</div></div>
          <div class="stat-card"><div class="stat-label">Active investigations</div><div class="stat-value">${stats.activeInvestigations}</div></div>
          <div class="stat-card"><div class="stat-label">Closed investigations</div><div class="stat-value">${stats.closedInvestigations}</div></div>
          <div class="stat-card"><div class="stat-label">Evidence records</div><div class="stat-value">${stats.totalEvidence}</div></div>
          <div class="stat-card"><div class="stat-label">Persons of interest</div><div class="stat-value">${stats.totalPersons}</div></div>
          <div class="stat-card"><div class="stat-label">Recorded events</div><div class="stat-value">${stats.totalEvents}</div></div>
          <div class="stat-card"><div class="stat-label">Unresolved contradictions</div><div class="stat-value">${stats.unresolvedContradictions}</div></div>
          <div class="stat-card"><div class="stat-label">Activity log</div><div class="stat-value">${stats.totalActivity}</div></div>
        </div>
      </section>

      <section class="panel" style="grid-column: span 7;">
        <div class="panel-header">
          <div class="panel-title">Recent activity</div>
        </div>
        <div class="activity-list">
          ${recentActivity.length ? recentActivity.map((item) => `
            <div class="activity-item">
              <div><strong>${item.actionType}</strong> · ${item.entityType}</div>
              <div class="muted">${item.description}</div>
              <div class="muted code">${formatDate(item.timestamp)}</div>
            </div>
          `).join('') : '<div class="empty-state">No activity recorded yet.</div>'}
        </div>
      </section>

      <section class="panel" style="grid-column: span 5;">
        <div class="panel-header">
          <div class="panel-title">Quick actions</div>
        </div>
        <div class="action-row">
          <button class="primary-button" data-action="create-investigation">Create investigation</button>
          <button class="secondary-button" data-action="create-evidence">Add evidence</button>
          <button class="secondary-button" data-action="create-person">Add person</button>
          <button class="secondary-button" data-action="create-note">Create note</button>
          <button class="secondary-button" data-action="generate-report">Generate report</button>
        </div>
      </section>

      <section class="panel" style="grid-column: span 7;">
        <div class="panel-header">
          <div class="panel-title">Recent investigations</div>
        </div>
        <div class="list-stack">
          ${recentInvestigations.length ? recentInvestigations.map((item) => `
            <div class="list-item">
              <div class="inline-span">
                <strong>${item.caseNumber}</strong>
                <span class="badge">${item.status || 'Open'}</span>
              </div>
              <div>${item.title}</div>
              <div class="muted">Priority: ${item.priority || 'Normal'} · Last modified: ${formatShortDate(item.updatedAt || item.dateCreated)}</div>
            </div>
          `).join('') : '<div class="empty-state">No investigations created yet.</div>'}
        </div>
      </section>

      <section class="panel" style="grid-column: span 5;">
        <div class="panel-header">
          <div class="panel-title">System information</div>
        </div>
        <div class="list-stack">
          <div class="list-item"><strong>Database status:</strong> <span class="muted">Connected</span></div>
          <div class="list-item"><strong>Record count:</strong> <span class="muted">${stats.totalInvestigations + stats.totalEvidence + stats.totalPersons}</span></div>
          <div class="list-item"><strong>Storage:</strong> <span class="muted">${storage.percent ? `${storage.percent.toFixed(1)}%` : 'Not available'}</span></div>
          <div class="list-item"><strong>Last backup:</strong> <span class="muted">Unavailable</span></div>
          <div class="list-item"><strong>Application version:</strong> <span class="muted">1.0.0</span></div>
        </div>
      </section>
    </div>
  `;
}
