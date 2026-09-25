const form = document.querySelector('#auth-form');
const switchButtons = document.querySelectorAll('.auth-switch-button');
const title = document.querySelector('#form-title');
const description = document.querySelector('#form-description');
const submitButton = document.querySelector('#submit-button');
const authPanel = document.querySelector('#auth-panel');
const nameField = document.querySelector('#name-field');
const nameInput = document.querySelector('#name');
const usernameField = document.querySelector('#username-field');
const usernameInput = document.querySelector('#username');
const emailField = document.querySelector('#email-field');
const emailInput = document.querySelector('#email');
const identifierField = document.querySelector('#identifier-field');
const identifierInput = document.querySelector('#identifier');
const passwordInput = document.querySelector('#password');
const confirmPasswordField = document.querySelector('#confirm-password-field');
const confirmPasswordInput = document.querySelector('#confirm-password');
const formMessage = document.querySelector('#form-message');
const demoNote = document.querySelector('#demo-note');
const demoUsername = document.querySelector('#demo-username');
const demoPassword = document.querySelector('#demo-password');
const accountPanel = document.querySelector('#account-panel');
const accountHeading = document.querySelector('#account-heading');
const accountDetails = document.querySelector('#account-details');
const logoutButton = document.querySelector('#logout-button');

let mode = 'login';

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === 'register';

  title.textContent = registering ? 'Create your account' : 'Welcome back';
  description.textContent = registering
    ? 'Register to get started. Passwords must be at least 12 characters.'
    : 'Log in to your account.';
  submitButton.textContent = registering ? 'Register' : 'Log in';
  nameField.classList.toggle('hidden', !registering);
  nameInput.required = registering;
  usernameField.classList.toggle('hidden', !registering);
  usernameInput.required = registering;
  emailField.classList.toggle('hidden', !registering);
  emailInput.required = registering;
  identifierField.classList.toggle('hidden', registering);
  identifierInput.required = !registering;
  confirmPasswordField.classList.toggle('hidden', !registering);
  confirmPasswordInput.required = registering;
  passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
  demoNote.classList.toggle('hidden', registering || !demoUsername.textContent);
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

function showAccount(user) {
  authPanel.classList.add('hidden');
  demoNote.classList.add('hidden');
  accountPanel.classList.remove('hidden');
  title.textContent = 'You are signed in';
  description.textContent = '';
  accountHeading.textContent = `Welcome, ${user.name}`;
  accountDetails.textContent = `Username: ${user.username} · Email: ${user.email}`;
}

async function checkSession() {
  try {
    const response = await fetch('/api/auth/me');
    const result = await response.json();
    if (result.demoAccount) {
      demoUsername.textContent = result.demoAccount.username;
      demoPassword.textContent = result.demoAccount.password;
      demoNote.classList.remove('hidden');
    }
    if (result.user) {
      showAccount(result.user);
    }
  } catch {
    formMessage.textContent = 'Unable to check your login status. Please refresh the page.';
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (mode === 'register' && passwordInput.value !== confirmPasswordInput.value) {
    formMessage.textContent = 'Passwords do not match.';
    confirmPasswordInput.focus();
    return;
  }

  const payload =
    mode === 'register'
      ? {
          name: nameInput.value,
          username: usernameInput.value,
          email: emailInput.value,
          password: passwordInput.value,
        }
      : {
          identifier: identifierInput.value,
          password: passwordInput.value,
        };

  submitButton.disabled = true;
  formMessage.textContent = '';

  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      formMessage.textContent = result.error || 'Unable to complete your request.';
      return;
    }
    showAccount(result.user);
  } catch {
    formMessage.textContent = 'Unable to reach the server. Please try again.';
  } finally {
    submitButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) {
      accountDetails.textContent = 'Unable to log out. Please try again.';
      return;
    }
    window.location.reload();
  } catch {
    accountDetails.textContent = 'Unable to reach the server. Please try again.';
  } finally {
    logoutButton.disabled = false;
  }
});

checkSession();
