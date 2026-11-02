const form = document.getElementById('login-form');
const passwordInput = document.getElementById('operator-password');
const errorMessage = document.getElementById('login-error');
const accessButton = document.getElementById('access-button');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.textContent = '';
  accessButton.disabled = true;

  try {
    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password: passwordInput.value })
    });
    const result = await response.json();

    if (!response.ok) {
      errorMessage.textContent = result.error || 'Access denied.';
      passwordInput.select();
      return;
    }

    window.location.replace('/');
  } catch {
    errorMessage.textContent = 'Authentication service unavailable.';
  } finally {
    accessButton.disabled = false;
  }
});
