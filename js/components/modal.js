export function openModal({ title = 'Dialog', body = '', footer = '' }) {
  const root = document.getElementById('modal-root');
  if (!root) return null;

  const modalBackdrop = document.createElement('div');
  modalBackdrop.className = 'modal-backdrop';
  modalBackdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="icon-button" data-close-modal="true" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-footer">${footer}</div>
    </div>
  `;

  root.appendChild(modalBackdrop);
  modalBackdrop.querySelector('[data-close-modal]').addEventListener('click', () => modalBackdrop.remove());

  return modalBackdrop;
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = '';
}
