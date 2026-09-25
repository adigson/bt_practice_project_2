const form = document.querySelector('#auth-form');
const switchButtons = document.querySelectorAll('.auth-switch-button');
const title = document.querySelector('#form-title');
const description = document.querySelector('#form-description');
const submitButton = document.querySelector('#submit-button');
const nameField = document.querySelector('#name-field');
const nameInput = document.querySelector('#name');
const passwordInput = document.querySelector('#password');
const confirmPasswordField = document.querySelector('#confirm-password-field');
const confirmPasswordInput = document.querySelector('#confirm-password');
const formMessage = document.querySelector('#form-message');

let mode = 'login';

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === 'register';

  title.textContent = registering ? 'Create your account' : 'Welcome back';
  description.textContent = registering
    ? 'Register to get started.'
    : 'Log in to your account.';
  submitButton.textContent = registering ? 'Register' : 'Log in';
  nameField.classList.toggle('hidden', !registering);
  nameInput.required = registering;
  confirmPasswordField.classList.toggle('hidden', !registering);
  confirmPasswordInput.required = registering;
  passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
  formMessage.textContent = '';

  switchButtons.forEach((button) => {
    const isActive = button.dataset.mode === mode;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

switchButtons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  if (mode === 'register' && passwordInput.value !== confirmPasswordInput.value) {
    formMessage.textContent = 'Passwords do not match.';
    confirmPasswordInput.focus();
    return;
  }

  formMessage.textContent =
    'Account login and registration are not connected to a server yet.';
});
