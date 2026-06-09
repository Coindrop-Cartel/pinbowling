/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  showDialog,
  showConfirm,
  showPrompt,
  showAlert,
  showPlayerSelectionDialog,
  showChoiceDialog,
  showAuthDialog,
} from '@ui/dialogs.js';
import { PB_API } from '@services/api.js';

vi.hoisted(() => {
  vi.stubGlobal('location', { origin: 'http://localhost' });
  global.fetch = vi.fn();
});

vi.mock('@services/api.js', () => ({
  PB_API: {
    login: vi.fn(),
    register: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Custom Dialog Modals (dialogs.js)', () => {
  it('showConfirm resolves true when confirm button is clicked', async () => {
    const promise = showConfirm('Are you sure?', 'Test Confirm');
    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.click();
    const result = await promise;
    expect(result).toBe(true);
    expect(document.querySelector('.card')).toBeNull();
  });

  it('showPrompt resolves input value on Enter key', async () => {
    const promise = showPrompt('Enter code:', 'Admin');
    const input = document.getElementById('modal-input');
    input.value = 'secret123';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const result = await promise;
    expect(result).toBe('secret123');
  });

  it('showDialog resolves null/false on Escape key', async () => {
    const promise = showDialog({ title: 'Prompt', message: 'Wait', showInput: true });
    const input = document.getElementById('modal-input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const result = await promise;
    expect(result).toBeNull();
  });

  it('focuses the input field after a short delay', () => {
    showDialog({ title: 'Focus Test', message: 'Test', showInput: true });
    const input = document.getElementById('modal-input');
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(input);
  });

  // ── showDialog additional coverage ──────────────────────────────
  it('showDialog resolves true (no input) when confirm clicked', async () => {
    const promise = showDialog({ title: 'Test', message: 'No input' });
    document.getElementById('modal-confirm').click();
    const result = await promise;
    expect(result).toBe(true);
  });

  it('showDialog resolves false when cancel clicked (no input)', async () => {
    const promise = showDialog({ title: 'Test', message: 'Cancel test' });
    document.getElementById('modal-cancel').click();
    const result = await promise;
    expect(result).toBe(false);
  });

  it('showDialog resolves null when cancel clicked (with input)', async () => {
    const promise = showDialog({ title: 'Test', message: 'Input cancel', showInput: true });
    document.getElementById('modal-cancel').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('showDialog renders custom element when provided', async () => {
    const customEl = document.createElement('div');
    customEl.id = 'my-custom-widget';
    customEl.textContent = 'Custom Widget';
    const promise = showDialog({ title: 'Custom', message: 'With element', customElement: customEl });
    expect(document.getElementById('my-custom-widget')).not.toBeNull();
    expect(document.getElementById('my-custom-widget').textContent).toBe('Custom Widget');
    document.getElementById('modal-cancel').click();
    await promise;
  });

  it('showDialog creates text input when isPassword is false', () => {
    showDialog({ title: 'Text Input', message: 'Enter text', showInput: true, isPassword: false });
    const input = document.getElementById('modal-input');
    expect(input.type).toBe('text');
  });

  it('showDialog creates password input by default', () => {
    showDialog({ title: 'Pass Input', message: 'Enter pass', showInput: true });
    const input = document.getElementById('modal-input');
    expect(input.type).toBe('password');
  });

  it('showDialog hides cancel button when cancelText is null', () => {
    showDialog({ title: 'No Cancel', message: 'Test', cancelText: null });
    expect(document.getElementById('modal-cancel')).toBeNull();
  });

  it('showDialog uses custom confirm and cancel text', () => {
    showDialog({ title: 'Custom Text', message: 'Test', confirmText: 'Go!', cancelText: 'Stop!' });
    expect(document.getElementById('modal-confirm').textContent).toBe('Go!');
    expect(document.getElementById('modal-cancel').textContent).toBe('Stop!');
  });
});

// ── showAlert ──────────────────────────────────────────────────────
describe('showAlert', () => {

  it('should resolve true when OK button is clicked', async () => {
    const promise = showAlert('Something happened', 'Notice');
    const confirmBtn = document.getElementById('modal-confirm');
    expect(confirmBtn.textContent).toBe('OK');
    expect(document.getElementById('modal-cancel')).toBeNull(); // No cancel button
    confirmBtn.click();
    const result = await promise;
    expect(result).toBe(true);
  });

  it('should use default title when not provided', async () => {
    const promise = showAlert('Just a message');
    const heading = document.querySelector('.modal-card h2');
    expect(heading.textContent).toBe('Notice');
    document.getElementById('modal-confirm').click();
    await promise;
  });
});

// ── showChoiceDialog ───────────────────────────────────────────────
describe('showChoiceDialog', () => {

  it('should render choice buttons and resolve with selected value on Save', async () => {
    const choices = [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
      { value: 'c', label: 'Option C' },
    ];
    const promise = showChoiceDialog('Pick One', 'Choose wisely', choices);

    const choiceBtns = document.querySelectorAll('.choice-btn');
    expect(choiceBtns).toHaveLength(3);
    expect(choiceBtns[0].textContent).toBe('Option A');

    // Click Option B
    choiceBtns[1].click();

    // Save
    document.getElementById('modal-save').click();
    const result = await promise;
    expect(result).toBe('b');
  });

  it('should resolve null when Cancel is clicked', async () => {
    const choices = [{ value: 'x', label: 'X' }];
    const promise = showChoiceDialog('Pick', 'Choose', choices);
    document.getElementById('modal-cancel').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('should highlight selected choice button', () => {
    const choices = [
      { value: '1', label: 'First' },
      { value: '2', label: 'Second' },
    ];
    showChoiceDialog('Pick', 'Choose', choices);

    const choiceBtns = document.querySelectorAll('.choice-btn');
    // Click second choice
    choiceBtns[1].click();

    // Second should be selected (black bg, white text)
    expect(choiceBtns[1].style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(choiceBtns[1].style.color).toBe('rgb(255, 255, 255)');
    // First should be unselected
    expect(choiceBtns[0].style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(choiceBtns[0].style.color).toBe('rgb(0, 0, 0)');
  });

  it('should apply custom CSS class to choice buttons', () => {
    const choices = [{ value: 'a', label: 'A', class: 'custom-class' }];
    showChoiceDialog('Pick', 'Choose', choices);
    const btn = document.querySelector('.choice-btn');
    expect(btn.classList.contains('custom-class')).toBe(true);
  });

  it('should use initialValue to pre-select a choice', () => {
    const choices = [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ];
    showChoiceDialog('Pick', 'Choose', choices, 'b');

    const choiceBtns = document.querySelectorAll('.choice-btn');
    // 'b' should be pre-selected
    expect(choiceBtns[1].style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(choiceBtns[0].style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('should resolve with initialValue when saved without clicking a choice', async () => {
    const choices = [{ value: 'x', label: 'X' }];
    const promise = showChoiceDialog('Pick', 'Choose', choices, 'x');
    document.getElementById('modal-save').click();
    const result = await promise;
    expect(result).toBe('x');
  });
});

// ── showAuthDialog ─────────────────────────────────────────────────
describe('showAuthDialog', () => {

  it('should render login form by default', async () => {
    const promise = showAuthDialog();
    await vi.advanceTimersByTimeAsync(50);
    expect(document.querySelector('#auth-username')).not.toBeNull();
    expect(document.querySelector('#auth-pass')).not.toBeNull();
    expect(document.querySelector('#auth-name')).toBeNull(); // No player name in login mode
    const submitBtn = document.querySelector('#auth-modal-form button[type="submit"]');
    expect(submitBtn.textContent).toBe('Login');
    // Cancel
    document.getElementById('auth-cancel').click();
    await promise;
  });

  it('should switch to register mode when switch button is clicked', async () => {
    const promise = showAuthDialog();
    await vi.advanceTimersByTimeAsync(50);
    document.getElementById('auth-switch').click();
    // Now in register mode
    expect(document.querySelector('#auth-name')).not.toBeNull();
    const submitBtn = document.querySelector('#auth-modal-form button[type="submit"]');
    expect(submitBtn.textContent).toBe('Register');
    document.getElementById('auth-cancel').click();
    await promise;
  });

  it('should resolve with user on successful login', async () => {
    const mockUser = { id: 1, username: 'testuser' };
    PB_API.login.mockResolvedValue(mockUser);
    const promise = showAuthDialog();
    await vi.advanceTimersByTimeAsync(50);

    document.querySelector('#auth-username').value = 'testuser';
    document.querySelector('#auth-pass').value = 'password123';
    document.querySelector('#auth-modal-form').dispatchEvent(new Event('submit', { cancelable: true }));

    const result = await promise;
    expect(PB_API.login).toHaveBeenCalledWith('testuser', 'password123');
    expect(result).toEqual(mockUser);
  });

  it('should resolve null when cancel is clicked', async () => {
    const promise = showAuthDialog();
    await vi.advanceTimersByTimeAsync(50);
    document.getElementById('auth-cancel').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('should call register API on register form submit', async () => {
    PB_API.register.mockResolvedValue({});
    PB_API.login.mockResolvedValue({ id: 2, username: 'newuser' });
    const promise = showAuthDialog();
    await vi.advanceTimersByTimeAsync(50);

    // Switch to register mode
    document.getElementById('auth-switch').click();

    document.querySelector('#auth-username').value = 'newuser';
    document.querySelector('#auth-pass').value = 'pass123';
    document.querySelector('#auth-name').value = 'New Player';
    document.querySelector('#auth-modal-form').dispatchEvent(new Event('submit', { cancelable: true }));

    const result = await promise;
    expect(PB_API.register).toHaveBeenCalledWith({
      username: 'newuser',
      password: 'pass123',
      playerName: 'New Player',
    });
    expect(PB_API.login).toHaveBeenCalledWith('newuser', 'pass123');
  });

  it('should handle claimRequired flow in register', async () => {
    PB_API.register.mockResolvedValueOnce({ claimRequired: true, message: 'Claim your profile?' });
    PB_API.register.mockResolvedValueOnce({});
    PB_API.login.mockResolvedValue({ id: 3, username: 'claimer' });
    const promise = showAuthDialog();
    await vi.advanceTimersByTimeAsync(50);

    // Switch to register mode
    document.getElementById('auth-switch').click();

    document.querySelector('#auth-username').value = 'claimer';
    document.querySelector('#auth-pass').value = 'pass';
    document.querySelector('#auth-name').value = 'Claimer';
    document.querySelector('#auth-modal-form').dispatchEvent(new Event('submit', { cancelable: true }));

    // Wait for the confirm dialog to appear
    await vi.advanceTimersByTimeAsync(50);

    // The showConfirm should have been called — click confirm
      // Use a non-bubbling click to avoid re-triggering the auth form's submit handler
      const confirmBtn = document.getElementById('modal-confirm');
      if (confirmBtn) {
        confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true }));
      }

    await vi.advanceTimersByTimeAsync(50);
    const result = await promise;
    expect(PB_API.register).toHaveBeenCalledTimes(2);
    expect(PB_API.register).toHaveBeenLastCalledWith({
      username: 'claimer',
      password: 'pass',
      playerName: 'Claimer',
      confirmClaim: true,
    });
  });

  it('should show alert on authentication failure', async () => {
    PB_API.login.mockRejectedValue(new Error('Invalid credentials'));
    const promise = showAuthDialog();
    await vi.advanceTimersByTimeAsync(50);

    document.querySelector('#auth-username').value = 'baduser';
    document.querySelector('#auth-pass').value = 'badpass';
    document.querySelector('#auth-modal-form').dispatchEvent(new Event('submit', { cancelable: true }));

    await vi.advanceTimersByTimeAsync(50);

    // Should show an alert dialog (not resolve the auth promise yet)
    // The auth dialog should still be open
    expect(document.querySelector('#auth-modal-form')).not.toBeNull();

    // Cancel to clean up
    document.getElementById('auth-cancel').click();
    await promise;
  });
});

describe('showPlayerSelectionDialog', () => {
  const mockOptions = [
    { value: 1, label: 'Alice' },
    { value: 2, label: 'Bob' }
  ];

  it('renders correctly and populates player options', async () => {
    const promise = showPlayerSelectionDialog('Add Player', 'Pick someone', mockOptions);
    const select = document.getElementById('player-select-modal');
    expect(select.options.length).toBe(3);
    expect(select.innerHTML).toContain('Alice');
    document.getElementById('modal-cancel').click();
    await promise;
  });

  it('disables the confirm button until a selection is made', async () => {
    const promise = showPlayerSelectionDialog('Add Player', 'Pick someone', mockOptions);
    const confirmBtn = document.getElementById('modal-confirm');
    const select = document.getElementById('player-select-modal');
    expect(confirmBtn.disabled).toBe(true);
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    expect(confirmBtn.disabled).toBe(false);
    confirmBtn.click();
    const result = await promise;
    expect(result).toBe('2');
  });

  it('filters options when typing in the search box', async () => {
    const promise = showPlayerSelectionDialog('Search Test', 'Filter', mockOptions);
    const searchInput = document.getElementById('player-search-modal');
    const select = document.getElementById('player-select-modal');
    searchInput.value = 'Ali';
    searchInput.dispatchEvent(new Event('input'));
    expect(select.options.length).toBe(2);
    expect(select.options[1].textContent).toBe('Alice');
    document.getElementById('modal-cancel').click();
    await promise;
  });

  it('should use custom confirmText', async () => {
    const promise = showPlayerSelectionDialog('Add', 'Pick', mockOptions, 'Select Player');
    const confirmBtn = document.getElementById('modal-confirm');
    expect(confirmBtn.textContent).toBe('Select Player');
    document.getElementById('modal-cancel').click();
    await promise;
  });

  it('should resolve null when cancel is clicked', async () => {
    const promise = showPlayerSelectionDialog('Add', 'Pick', mockOptions);
    document.getElementById('modal-cancel').click();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('should focus search input after delay', () => {
    showPlayerSelectionDialog('Add', 'Pick', mockOptions);
    const searchInput = document.getElementById('player-search-modal');
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(searchInput);
  });
});