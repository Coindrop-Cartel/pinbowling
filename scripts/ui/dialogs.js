import { createSearchableSelect } from './selectors.js';
import { PB_API } from '../services/api.js';

/**
 * Internal infrastructure for modal dialogs.
 * @module ui/dialogs
 */

/**
 * Creates a modal backdrop, card element, and close handler.
 * @param {string} title - The modal title displayed in the card header.
 * @param {string} contentHtml - Inner HTML for the modal body.
 * @returns {{ backdrop: HTMLDivElement, card: HTMLDivElement, close: function(*, function): void }}
 *   An object containing the backdrop element, card element, and a close function
 *   that removes the modal and resolves the parent promise.
 */
function _openModalBase(title, contentHtml) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  
  const card = document.createElement('div');
  card.className = "card modal-card";
  
  card.innerHTML = `<h2 class="mt-0">${title}</h2>${contentHtml}`;
  
  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  const close = (value, resolve) => {
    document.body.removeChild(backdrop);
    resolve(value);
  };

  return { backdrop, card, close };
}

/**
 * Displays a customizable modal dialog with confirm/cancel buttons.
 * @param {Object} options - Dialog configuration.
 * @param {string} options.title - The dialog title.
 * @param {string} options.message - The message displayed in the dialog body.
 * @param {boolean} [options.showInput=false] - Whether to show a text input field.
 * @param {boolean} [options.isPassword=true] - Whether the input field is a password field.
 * @param {string} [options.confirmText='Confirm'] - Label for the confirm button.
 * @param {string|null} [options.cancelText='Cancel'] - Label for the cancel button; null hides it.
 * @param {*} [options.cancelValue=undefined] - The value to resolve with on cancel.
 * @param {string} [options.confirmId='modal-confirm'] - HTML ID for the confirm button.
 * @param {HTMLElement|null} [options.customElement=null] - An optional DOM element to append inside the dialog.
 * @param {function(): *} [options.resolveValue=null] - Callback to determine the value to resolve with on confirm.
 * @param {function({card: HTMLElement, confirmBtn: HTMLElement, close: function}): void} [options.onReady=null] - Hook for specialized logic.
 * @returns {Promise<*|null>} Resolves with the input value (if showInput), true/false (if not), or null on cancel.
 */
export function showDialog({
  title,
  message,
  showInput = false,
  isPassword = true,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  cancelValue = undefined,
  confirmId = 'modal-confirm',
  customElement = null,
  resolveValue = null,
  onReady = null
}) {
  return new Promise((resolve) => {
    const contentHtml = `
      <p class="small-hint mb-0">${message}</p>
      <div id="modal-custom-content"></div>
      ${showInput ? `<div class="form-row mt-20"><input type="${isPassword ? 'password' : 'text'}" id="modal-input" class="modal-input" /></div>` : ''}
      <div class="modal-actions">
        <button id="${confirmId}" class="flex-1">${confirmText}</button>
        ${cancelText ? `<button id="modal-cancel" class="secondary flex-1">${cancelText}</button>` : ''}
      </div>
    `;
    const { card, close } = _openModalBase(title, contentHtml);

    if (customElement) {
      const container = card.querySelector('#modal-custom-content');
      if (container) container.appendChild(customElement);
    }

    const input = card.querySelector('#modal-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') close(input.value, resolve);
        if (e.key === 'Escape') close(null, resolve);
      });
      setTimeout(() => input.focus(), 50);
    }

    const confirmBtn = card.querySelector(`#${confirmId}`);
    confirmBtn.onclick = () => {
      if (resolveValue) return close(resolveValue(), resolve);
      close(input ? input.value : true, resolve);
    };

    const cancelBtn = card.querySelector('#modal-cancel');
    if (cancelBtn) {
      const finalCancelValue = cancelValue !== undefined ? cancelValue : (showInput ? null : false);
      cancelBtn.onclick = () => close(finalCancelValue, resolve);
    }

    if (onReady) {
      onReady({ card, confirmBtn, close: (val) => close(val, resolve) });
    }
  });
}

/**
 * Convenience wrapper around showDialog for yes/no confirmation.
 * @param {string} message - The confirmation message.
 * @param {string} [title='Confirm Action'] - The dialog title.
 * @returns {Promise<boolean|null>} Resolves with true on confirm, false/null on cancel.
 */
export const showConfirm = (message, title = 'Confirm Action') =>
  showDialog({ title, message, confirmText: 'Yes, Proceed', cancelText: 'Cancel' });

/**
 * Convenience wrapper around showDialog for password/text input prompts.
 * @param {string} message - The prompt message.
 * @param {string} [title='Admin Password'] - The dialog title.
 * @param {boolean} [isPassword=true] - Whether the input is a password field.
 * @returns {Promise<string|null>} Resolves with the entered value, or null on cancel.
 */
export const showPrompt = (message, title = 'Admin Password', isPassword = true) =>
  showDialog({ title, message, showInput: true, isPassword, confirmText: 'Submit' });

/**
 * Convenience wrapper around showDialog for simple alert notices.
 * @param {string} message - The alert message.
 * @param {string} [title='Notice'] - The dialog title.
 * @returns {Promise<boolean>} Resolves with true when dismissed.
 */
export const showAlert = (message, title = 'Notice') =>
  showDialog({ title, message, confirmText: 'OK', cancelText: null });

/**
 * Displays a dialog with a list of selectable choices (radio buttons).
 * @param {string} title - The dialog title.
 * @param {string} message - The message displayed above the choices.
 * @param {Array<{value: string, label: string, class?: string}>} choices - The available choices.
 * @param {string|null} [initialValue=null] - The value of the initially selected choice.
 * @returns {Promise<string|null>} Resolves with the selected value, or null on cancel.
 */
export const showChoiceDialog = (title, message, choices, initialValue = null) => {
  let selectedValue = initialValue;
  const container = document.createElement('div');
  container.className = 'choice-grid mt-20';

  const buttons = choices.map(choice => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `choice-btn ${choice.class || ''}`;
    btn.textContent = choice.label;
    btn.dataset.value = choice.value;

    const updateStyle = (selected) => {
      const isSelected = String(choice.value) === String(selectedValue);
      btn.style.backgroundColor = isSelected ? '#000' : '#fff';
      btn.style.color = isSelected ? '#fff' : '#000';
    };

    updateStyle(selectedValue);

    btn.onclick = () => {
      selectedValue = choice.value;
      buttons.forEach(b => {
        const isMatch = String(b.dataset.value) === String(selectedValue);
        b.style.backgroundColor = isMatch ? '#000' : '#fff';
        b.style.color = isMatch ? '#fff' : '#000';
      });
    };
    container.appendChild(btn);
    return btn;
  });

  return showDialog({
    title,
    message,
    confirmText: 'Save',
    confirmId: 'modal-save',
    cancelText: 'Cancel',
    cancelValue: null,
    customElement: container,
    resolveValue: () => selectedValue
  });
};

/**
 * Displays a password authentication dialog and validates credentials.
 * @returns {Promise<import('@scripts/types.js').User|null>} Resolves with the authenticated User, or null on cancel/failure.
 */
export const showAuthDialog = () => {
  return new Promise((resolve) => {
    let mode = 'login';
    const updateUI = (card) => {
      const isLogin = mode === 'login';
      card.querySelector('h2').textContent = isLogin ? 'Login' : 'Create Account';
      
      let nameRow = card.querySelector('#auth-name-row');
      if (isLogin && nameRow) {
        nameRow.remove();
      } else if (!isLogin && !nameRow) {
        const row = document.createElement('div');
        row.className = 'form-row';
        row.id = 'auth-name-row';
        row.innerHTML = '<label>Player Name</label><input type="text" id="auth-name" class="modal-input">';
        card.querySelector('#auth-pass').closest('.form-row').after(row);
      }

      card.querySelector('button[type="submit"]').textContent = isLogin ? 'Login' : 'Register';
      card.querySelector('#auth-switch').textContent = isLogin ? 'Create Account' : 'Back to Login';
    };

    const contentHtml = `
      <form id="auth-modal-form">
        <div class="form-row"><label>Username</label><input type="text" id="auth-username" class="modal-input" required></div>
        <div class="form-row"><label>Password</label><input type="password" id="auth-pass" class="modal-input" required></div>
        <div class="modal-actions mt-20">
          <button type="submit" class="flex-1">Login</button>
          <button type="button" id="auth-switch" class="secondary flex-1">Create Account</button>
          <button type="button" id="auth-cancel" class="secondary flex-1">Cancel</button>
        </div>
      </form>
    `;

    const { card, close } = _openModalBase('Login', contentHtml);
    const form = card.querySelector('#auth-modal-form');
    
    card.querySelector('#auth-switch').onclick = () => { mode = (mode === 'login' ? 'register' : 'login'); updateUI(card); };
    card.querySelector('#auth-cancel').onclick = () => close(null, resolve);

    form.onsubmit = async (e) => {
      e.preventDefault();
      const username = card.querySelector('#auth-username').value;
      const password = card.querySelector('#auth-pass').value;
      const playerName = card.querySelector('#auth-name')?.value;
      try {
        let user;
        if (mode === 'login') {
          user = await PB_API.login(username, password);
        } else {
          let reg = await PB_API.register({ username, password, playerName });
          if (reg.claimRequired) {
            if (await showConfirm(reg.message, 'Claim Profile')) {
              reg = await PB_API.register({ username, password, playerName, confirmClaim: true });
            } else return;
          }
          user = await PB_API.login(username, password);
        }
        close(user, resolve);
      } catch (err) { showAlert(err.message, 'Auth Failed'); }
    };
    setTimeout(() => card.querySelector('#auth-username').focus(), 50);
  });
};

export async function showPlayerSelectionDialog(title, message, options, confirmText = 'Add Player') {
  const customElement = document.createElement('div');
  customElement.className = 'form-row mt-20';
  customElement.innerHTML = `
    <input type="text" id="player-search-modal" class="modal-input" placeholder="Search players...">
    <select id="player-select-modal" class="modal-input mt-10"></select>
  `;

  return showDialog({
    title,
    message,
    confirmText,
    cancelValue: null,
    customElement,
    onReady: ({ card, confirmBtn, close }) => {
      const searchInput = card.querySelector('#player-search-modal');
      const selectElement = card.querySelector('#player-select-modal');
      confirmBtn.disabled = true;
      selectElement.innerHTML = '<option value="">-- Select Player --</option>' + options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      createSearchableSelect(searchInput, selectElement, options, {
        valueKey: 'value',
        labelKey: 'label',
        placeholder: '-- Select Player --',
        onSelect: (val) => { confirmBtn.disabled = !val; }
      });
      confirmBtn.onclick = () => close(selectElement.value);
      setTimeout(() => searchInput.focus(), 50);
    }
  });
}