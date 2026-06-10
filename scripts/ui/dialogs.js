import { PB_API } from '@services/api.js';
import { createSearchableSelect } from './selectors.js';

/**
 * Internal infrastructure for modal dialogs.
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

export function showDialog({ title, message, showInput = false, isPassword = true, confirmText = 'Confirm', cancelText = 'Cancel', customElement = null }) {
  return new Promise((resolve) => {
    const contentHtml = `
      <p class="small-hint mb-0">${message}</p>
      <div id="modal-custom-content"></div>
      ${showInput ? `<div class="form-row mt-20"><input type="${isPassword ? 'password' : 'text'}" id="modal-input" class="modal-input" /></div>` : ''}
      <div class="modal-actions">
        <button id="modal-confirm" class="flex-1">${confirmText}</button>
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
    card.querySelector('#modal-confirm').onclick = () => close(input ? input.value : true, resolve);
    if (card.querySelector('#modal-cancel')) {
      card.querySelector('#modal-cancel').onclick = () => close(showInput ? null : false, resolve);
    }
  });
}

export const showConfirm = (message, title = 'Confirm Action') => showDialog({ title, message, confirmText: 'Yes, Proceed', cancelText: 'Cancel' });
export const showPrompt = (message, title = 'Admin Password', isPassword = true) => showDialog({ title, message, showInput: true, isPassword, confirmText: 'Submit' });
export const showAlert = (message, title = 'Notice') => showDialog({ title, message, confirmText: 'OK', cancelText: null });

export function showChoiceDialog(title, message, choices, initialValue = null) {
  return new Promise((resolve) => {
    let selectedValue = initialValue;
    const contentHtml = `
      <p class="small-hint mb-20">${message}</p>
      <div class="modal-actions wrap">
        ${choices.map(c => `<button type="button" class="choice-btn ${c.class || ''}" data-value="${c.value}">${c.label}</button>`).join('')}
      </div>
      <div class="modal-actions border-top-separator">
        <button id="modal-save" class="flex-1">Save</button>
        <button id="modal-cancel" class="secondary flex-1">Cancel</button>
      </div>
    `;
    const { card, close } = _openModalBase(title, contentHtml);
    const updateStyles = () => {
      card.querySelectorAll('.choice-btn').forEach(btn => {
        const isSelected = String(btn.dataset.value) === String(selectedValue);
        btn.style.backgroundColor = isSelected ? '#000' : '#fff';
        btn.style.color = isSelected ? '#fff' : '#000';
      });
    };
    card.querySelectorAll('.choice-btn').forEach(btn => {
      btn.onclick = () => { selectedValue = btn.dataset.value; updateStyles(); };
    });
    updateStyles();
    card.querySelector('#modal-save').onclick = () => close(selectedValue, resolve);
    card.querySelector('#modal-cancel').onclick = () => close(null, resolve);
  });
}

export async function showAuthDialog() {
  return new Promise((resolve) => {
    const renderMode = (isRegister = false, existingBackdrop = null) => {
      const contentHtml = `
        <form id="auth-modal-form">
          <div class="form-row"><label>Username</label><input type="text" id="auth-username" required class="modal-input"></div>
          <div class="form-row"><label>Password</label><input type="password" id="auth-pass" required class="modal-input"></div>
          ${isRegister ? `<div class="form-row"><label>Player Name</label><input type="text" id="auth-name" required placeholder="e.g. John Doe" class="modal-input"></div>` : ''}
          <div class="modal-actions column">
            <button type="submit" class="btn-full-width">${isRegister ? 'Register' : 'Login'}</button>
            <button type="button" id="auth-switch" class="secondary btn-full-width btn-link">
              ${isRegister ? 'Already have an account? Sign In' : 'Need an account? Register now'}
            </button>
            <button type="button" id="auth-cancel" class="secondary btn-full-width">Cancel</button>
          </div>
        </form>
      `;

      let card, close, backdrop;
      if (existingBackdrop) {
        backdrop = existingBackdrop;
        card = backdrop.querySelector('.card');
        card.innerHTML = `<h2 class="mt-0">${isRegister ? 'Create Account' : 'Sign In'}</h2>` + contentHtml;
      } else {
        const modal = _openModalBase(isRegister ? 'Create Account' : 'Sign In', contentHtml);
        card = modal.card;
        close = modal.close;
        backdrop = modal.backdrop;
      }

      const form = card.querySelector('#auth-modal-form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const username = card.querySelector('#auth-username').value;
        const password = card.querySelector('#auth-pass').value;
        try {
          let user;
          if (isRegister) {
            const playerName = card.querySelector('#auth-name').value;
            let regResult = await PB_API.register({ username, password, playerName });
            if (regResult && regResult.claimRequired) {
              const confirmed = await showConfirm(regResult.message, 'Claim Profile');
              if (confirmed) await PB_API.register({ username, password, playerName, confirmClaim: true });
              else return;
            }
          }
          user = await PB_API.login(username, password);
          document.body.removeChild(backdrop);
          resolve(user);
        } catch (err) { showAlert(err.message, 'Authentication Failed'); }
      };

      card.querySelector('#auth-switch').onclick = () => renderMode(!isRegister, backdrop);
      card.querySelector('#auth-cancel').onclick = () => { document.body.removeChild(backdrop); resolve(null); };
    };
    renderMode(false);
  });
}

export async function showPlayerSelectionDialog(title, message, options, confirmText = 'Add Player') {
  return new Promise((resolve) => {
    const contentHtml = `
      <p class="small-hint mb-0">${message}</p>
      <div class="form-row mt-20">
        <input type="text" id="player-search-modal" class="modal-input" placeholder="Search players...">
        <select id="player-select-modal" class="modal-input mt-10"></select>
      </div>
      <div class="modal-actions">
        <button id="modal-confirm" class="flex-1">${confirmText}</button>
        <button id="modal-cancel" class="secondary flex-1">Cancel</button>
      </div>
    `;
    const { card, close } = _openModalBase(title, contentHtml);
    const searchInput = card.querySelector('#player-search-modal');
    const selectElement = card.querySelector('#player-select-modal');
    const confirmBtn = card.querySelector('#modal-confirm');

    selectElement.innerHTML = '<option value="">-- Select Player --</option>' + options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');

    createSearchableSelect(searchInput, selectElement, options, {
      valueKey: 'value',
      labelKey: 'label',
      placeholder: '-- Select Player --',
      onSelect: (val) => { confirmBtn.disabled = !val; }
    });

    confirmBtn.disabled = true;
    confirmBtn.onclick = () => close(selectElement.value, resolve);
    card.querySelector('#modal-cancel').onclick = () => close(null, resolve);
    setTimeout(() => searchInput.focus(), 50);
  });
}