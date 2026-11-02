export function formatDate(value) {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatShortDate(value) {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function sanitizeText(value) {
  if (!value && value !== 0) return '';
  return String(value).replace(/[<>]/g, '');
}

export function getStatusTone(status) {
  const map = {
    Open: 'success',
    Active: 'success',
    Pending: 'warning',
    Suspended: 'warning',
    Closed: 'muted',
    Archived: 'muted',
    High: 'warning',
    Critical: 'danger',
    Normal: 'success',
    Low: 'muted'
  };
  return map[status] || 'muted';
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .trim();
}

export function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function prettyJSON(value) {
  return JSON.stringify(value, null, 2);
}
