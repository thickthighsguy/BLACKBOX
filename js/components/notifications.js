export function showToast({ type = 'success', message = '' }) {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  root.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2800);
}
