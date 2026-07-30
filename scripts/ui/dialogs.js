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
 * @param {boolean} [options.hideCancel=false] - Whether to hide the cancel button. 
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
  hideCancel = false,
  cancelText = 'Cancel',
  cancelValue = undefined,
  confirmId = 'modal-confirm',
  customElement = null,
  resolveValue = null,
  onReady = null
}) {
  return new Promise((resolve) => {
    const cancelHtml = hideCancel ? '' : `<button id="modal-cancel" class="secondary">${cancelText}</button>`;
    const contentHtml = `
      <p class="small-hint mb-0">${message}</p>
      <div id="modal-custom-content"></div>
      ${showInput ? `<div class="form-row mt-20"><input type="${isPassword ? 'password' : 'text'}" id="modal-input" class="modal-input" /></div>` : ''}
      <div class="modal-actions">
        <button id="${confirmId}">${confirmText}</button>
        ${cancelHtml}
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
  showDialog({ title, message, confirmText: 'OK', hideCancel: true });

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

    const updateStyle = () => {
      const isSelected = String(choice.value) === String(selectedValue);
      btn.classList.toggle('is-selected', isSelected);
    };

    updateStyle();

    btn.onclick = () => {
      selectedValue = choice.value;
      buttons.forEach(b => {
        const isMatch = String(b.dataset.value) === String(selectedValue);
        b.classList.toggle('is-selected', isMatch);
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
      
      const authPassEl = card.querySelector('#auth-pass');
      let nameRow = card.querySelector('#auth-name-row');
      if (isLogin && nameRow) {
        nameRow.remove();
      } else if (!isLogin && !nameRow) {
        const row = document.createElement('div');
        row.className = 'form-row';
        row.id = 'auth-name-row';
        row.innerHTML = '<label>Player Name</label><input type="text" id="auth-name" class="modal-input">';
        authPassEl?.closest('.form-row')?.after(row);
      }

      let emailRow = card.querySelector('#auth-email-row');
      if (isLogin && emailRow) {
        emailRow.remove();
      } else if (!isLogin && !emailRow) {
        const row = document.createElement('div');
        row.className = 'form-row';
        row.id = 'auth-email-row';
        row.innerHTML = '<label>Email Address</label><input type="email" id="auth-email" class="modal-input">';
        const currentNameRow = card.querySelector('#auth-name-row');
        if (currentNameRow) {
          currentNameRow.after(row);
        } else {
          authPassEl?.closest('.form-row')?.after(row);
        }
      }

      let forgotBtn = card.querySelector('#auth-forgot');
      if (forgotBtn) {
        forgotBtn.style.display = isLogin ? 'inline-block' : 'none';
      }

      card.querySelector('button[type="submit"]').textContent = isLogin ? 'Login' : 'Register';
      card.querySelector('#auth-switch').textContent = isLogin ? 'Need an account? Register now' : 'Already have an account? Login';
    };

    const contentHtml = `
      <form id="auth-modal-form">
        <div class="form-row"><label>Username or Email</label><input type="text" id="auth-username" class="modal-input" required></div>
        <div class="form-row"><label>Password</label><input type="password" id="auth-pass" class="modal-input" required></div>
        <div class="modal-actions mt-20">
          <button type="submit">Login</button>
          <button type="button" id="auth-forgot" class="btn-link-auth">Forgot password?</button>
          <button type="button" id="auth-switch" class="btn-link-auth">Need an account? Register now</button>
          <button type="button" id="auth-cancel" class="secondary">Cancel</button>
        </div>
      </form>
    `;

    const { card, close } = _openModalBase('Login', contentHtml);
    const form = card.querySelector('#auth-modal-form');
    
    card.querySelector('#auth-switch').onclick = () => { mode = (mode === 'login' ? 'register' : 'login'); updateUI(card); };
    card.querySelector('#auth-cancel').onclick = () => close(null, resolve);
    
    const forgotBtn = card.querySelector('#auth-forgot');
    if (forgotBtn) {
      forgotBtn.onclick = async () => {
        close(null, resolve);
        const email = await showPrompt('Enter your email address to receive a password reset link:', 'Forgot Password', false);
        if (email) {
          try {
            await PB_API.auth.forgotPassword(email);
            showAlert('If that email is registered, a password reset link has been sent to it. Please check your inbox (and spam folder) or the developer logs.', 'Reset Link Sent');
          } catch (err) {
            showAlert(err.message, 'Error');
          }
        }
      };
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      const username = card.querySelector('#auth-username').value;
      const password = card.querySelector('#auth-pass').value;
      const playerName = card.querySelector('#auth-name')?.value;
      const email = card.querySelector('#auth-email')?.value || null;
      try {
        let user;
        if (mode === 'login') {
          user = await PB_API.auth.login(username, password);
        } else {
          let reg = await PB_API.auth.register({ username, password, playerName, email });
          if (reg.claimRequired) {
            if (await showConfirm(reg.message, 'Claim Profile')) {
              reg = await PB_API.auth.register({ username, password, playerName, email, confirmClaim: true });
            } else return;
          }
          user = await PB_API.auth.login(username, password);
        }
        close(user, resolve);
      } catch (err) { showAlert(err.message, 'Auth Failed'); }
    };
    setTimeout(() => card.querySelector('#auth-username').focus(), 50);
  });
};

/**
 * Displays a multi-select dialog with search, Select All / Clear All controls,
 * and a scrollable checkbox list. Returns the selected values on confirm.
 * @param {Object} options
 * @param {string} options.title - Dialog title.
 * @param {string} [options.message=''] - Optional message displayed above the list.
 * @param {Array<{value: string|number, label: string}>} options.items - Items to display.
 * @param {Array<string|number>} [options.selected=[]] - Currently selected values.
 * @param {string} [options.searchPlaceholder='Search...'] - Placeholder for the search input.
 * @returns {Promise<Array<string>|null>} Resolves with selected values array, or null on cancel.
 */
export async function showMultiSelectDialog({ title, message = '', items, selected = [], searchPlaceholder = 'Search...', showSelectAll = true }) {
  const selectedSet = new Set(selected.map(String));

  const customElement = document.createElement('div');
  customElement.className = 'multi-select-dialog';
  customElement.innerHTML = `
    ${message ? `<p class="small-hint mb-10">${message}</p>` : ''}
    <input type="text" class="modal-input" id="multi-select-search" placeholder="${searchPlaceholder}" style="width: 100%; margin-bottom: 10px; box-sizing: border-box;">
    ${showSelectAll ? `<div style="margin-bottom: 8px; display: flex; gap: 8px;">
      <button type="button" id="multi-select-all" class="btn-small">Select All</button>
      <button type="button" id="multi-select-clear" class="btn-small">Clear All</button>
    </div>` : ''}
    <div id="multi-select-list" style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 4px;">
      ${items.map(item => {
        const val = String(item.value);
        return `<label class="checkbox-label multi-select-item" data-value="${val}" style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; padding: 4px 8px; margin: 0; border-radius: 3px; white-space: nowrap; overflow: hidden;">
          <input type="checkbox" value="${val}" ${selectedSet.has(val) ? 'checked' : ''} style="width: auto; margin: 0; flex-shrink: 0;">
          <span style="overflow: hidden; text-overflow: ellipsis;">${item.label}</span>
        </label>`;
      }).join('')}
    </div>
  `;

  return showDialog({
    title,
    message: '',
    confirmText: 'Done',
    cancelValue: null,
    customElement,
    onReady: ({ card, confirmBtn, close }) => {
      const searchInput = card.querySelector('#multi-select-search');
      const list = card.querySelector('#multi-select-list');
      const selectAllBtn = card.querySelector('#multi-select-all');
      const clearAllBtn = card.querySelector('#multi-select-clear');
      const items = list.querySelectorAll('.multi-select-item');

      searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        items.forEach(item => {
          const label = item.querySelector('span').textContent.toLowerCase();
          item.style.display = label.includes(query) ? 'flex' : 'none';
        });
      });

      if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
          items.forEach(item => {
            if (item.style.display !== 'none') {
              item.querySelector('input[type="checkbox"]').checked = true;
            }
          });
        });
      }

      if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
          items.forEach(item => {
            item.querySelector('input[type="checkbox"]').checked = false;
          });
        });
      }

      confirmBtn.onclick = () => {
        const selectedValues = [];
        list.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
          selectedValues.push(cb.value);
        });
        close(selectedValues);
      };

      setTimeout(() => searchInput.focus(), 50);
    }
  });
}

export async function showPlayerSelectionDialog(title, message, options, confirmText = 'Add Player') {
  const isTeam = confirmText.toLowerCase().includes('team');
  const searchPlaceholder = isTeam ? 'Search teams...' : 'Search players...';
  const selectPlaceholder = isTeam ? '-- Select Team --' : '-- Select Player --';

  const customElement = document.createElement('div');
  customElement.className = 'form-row mt-20';
  customElement.innerHTML = `
    <input type="text" id="player-search-modal" class="modal-input" placeholder="${searchPlaceholder}">
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
      selectElement.innerHTML = `<option value="">${selectPlaceholder}</option>` + options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      createSearchableSelect(searchInput, selectElement, options, {
        valueKey: 'value',
        labelKey: 'label',
        placeholder: selectPlaceholder,
        onSelect: (val) => { confirmBtn.disabled = !val; }
      });
      confirmBtn.onclick = () => close(selectElement.value);
      setTimeout(() => searchInput.focus(), 50);
    }
  });
}

/**
 * Displays a modal dialog for setting a team's roster/member order.
 *
 * @param {Object} options
 * @param {Object} options.team Team object { id, name }.
 * @param {Array<{id: number, playerName: string}>} options.members Team members list.
 * @param {Array<{id: number, playerName: string}>} [options.currentOrder] Initial order.
 * @param {string} [options.title] Modal dialog title.
 * @param {string} [options.confirmText] Modal confirm button text.
 * @returns {Promise<Array<{id: number, playerName: string}>|null>}
 */
export async function showRosterOrderDialog({ team, members = [], currentOrder = [], title, confirmText }) {
  const memberIdSet = new Set((members || []).map(m => String(m.id)));
  const validCurrentOrder = (currentOrder || []).filter(o => memberIdSet.has(String(o.id)));

  let orderList = validCurrentOrder.length > 0
    ? [...validCurrentOrder]
    : [...members];

  // Ensure any missing members are included at the end
  members.forEach(m => {
    if (!orderList.some(o => String(o.id) === String(m.id))) {
      orderList.push(m);
    }
  });

  const customElement = document.createElement('div');
  customElement.className = 'roster-order-modal mt-15';

  const renderList = () => {
    customElement.innerHTML = `
      <p class="small-hint mb-10">Arrange the roster sequence (1st, 2nd, 3rd, etc.):</p>
      <ul class="list-group no-bullets" style="padding: 0; margin: 0;">
        ${orderList.map((m, idx) => `
          <li class="flex-between align-center p-10 mb-8" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px;">
            <div>
              <strong style="color: #2196f3; margin-right: 8px;">#${idx + 1}</strong>
              <span>${m.playerName || m.name || `Player ${m.id}`}</span>
            </div>
            <div class="flex gap-4">
              <button type="button" class="btn-row secondary move-up-btn" data-idx="${idx}" ${idx === 0 ? 'disabled' : ''}>▲</button>
              <button type="button" class="btn-row secondary move-down-btn" data-idx="${idx}" ${idx === orderList.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
          </li>
        `).join('')}
      </ul>
    `;

    customElement.querySelectorAll('.move-up-btn').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.dataset.idx);
        if (i > 0) {
          const temp = orderList[i];
          orderList[i] = orderList[i - 1];
          orderList[i - 1] = temp;
          renderList();
        }
      };
    });

    customElement.querySelectorAll('.move-down-btn').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.dataset.idx);
        if (i < orderList.length - 1) {
          const temp = orderList[i];
          orderList[i] = orderList[i + 1];
          orderList[i + 1] = temp;
          renderList();
        }
      };
    });
  };

  renderList();

  const dialogTitle = title || `Set Roster Order — ${team?.name || 'Team'}`;
  const dialogConfirmText = confirmText || 'Save Roster Order';

  return showDialog({
    title: dialogTitle,
    message: '',
    confirmText: dialogConfirmText,
    cancelValue: null,
    customElement,
    resolveValue: () => orderList
  });
}

/**
 * Displays a modal dialog for assigning segment/round roles for each machine/round.
 * Includes equal workload validation.
 *
 * @param {Object} options
 * @param {Object} options.team Team object.
 * @param {Array<{id: number, playerName: string}>} options.members Team members.
 * @param {Array<{orderNumber: number, label: string, machineName: string}>} options.machines List of round/segment slots.
 * @param {Object<string|number, number>} [options.currentAssignments] Map of `{ [orderNumber]: playerId }`.
 * @param {string} [options.roleName] Role label (e.g. "Pitcher", "Defender", "Player"). Default: "Role".
 * @param {string} [options.actionLabel] Action label (e.g. "defending", "playing"). Default: "assigned".
 * @returns {Promise<Object<string|number, number>|null>}
 */
export async function showRoleAssignmentDialog({
  team,
  members = [],
  machines = [],
  currentAssignments = {},
  roleName = 'Role',
  actionLabel = 'assigned'
}) {
  const assignments = { ...currentAssignments };

  // Default unassigned machines to member rotation
  machines.forEach((mac, idx) => {
    if (!assignments[mac.orderNumber] && members.length > 0) {
      assignments[mac.orderNumber] = members[idx % members.length].id;
    }
  });

  const customElement = document.createElement('div');
  customElement.className = 'role-assignment-modal mt-15';

  let confirmButtonEl = null;

  const updateValidation = (card) => {
    const counts = {};
    members.forEach(m => { counts[Number(m.id)] = 0; });
    Object.values(assignments).forEach(pId => {
      const idNum = Number(pId);
      if (counts[idNum] !== undefined) counts[idNum]++;
    });

    const countList = Object.values(counts);
    const minCount = countList.length > 0 ? Math.min(...countList) : 0;
    const maxCount = countList.length > 0 ? Math.max(...countList) : 0;
    const isBalanced = (maxCount - minCount) <= 1;

    const workloadBadge = card.querySelector('#workload-status');
    if (workloadBadge) {
      const summaryText = members.map(m => `${m.playerName || `Player ${m.id}`}: ${counts[Number(m.id)] || 0}`).join(' | ');
      workloadBadge.innerHTML = `
        <div style="padding: 10px; border-radius: 6px; background: ${isBalanced ? '#e8f5e9' : '#ffebee'}; border: 1px solid ${isBalanced ? '#a5d6a7' : '#ef9a9a'}; margin-bottom: 12px;">
          <strong style="color: ${isBalanced ? '#2e7d32' : '#c62828'};">
            ${isBalanced ? '✓ Workload Balanced' : `⚠️ Uneven ${roleName} Workload! Everyone on the team should play an equal amount.`}
          </strong>
          <div style="font-size: 0.85em; color: #555; margin-top: 4px;">${summaryText}</div>
        </div>
      `;
    }

    if (confirmButtonEl) {
      confirmButtonEl.disabled = !isBalanced;
    }
  };

  customElement.innerHTML = `
    <div id="workload-status"></div>
    <p class="small-hint mb-10">Assign a ${roleName.toLowerCase()} for each machine where ${team?.name || 'your team'} is ${actionLabel}:</p>
    <div class="role-rows flex-col gap-10">
      ${machines.map(mac => `
        <div class="form-row flex-between align-center p-10" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px;">
          <div>
            <strong>${mac.label || `Round ${mac.orderNumber}`}</strong>
            <div style="font-size: 0.85em; color: #666;">Machine: ${mac.machineName || 'Unknown'}</div>
          </div>
          <select class="role-select modal-input" data-order="${mac.orderNumber}" style="width: auto; min-width: 160px;">
            ${members.map(m => `<option value="${m.id}" ${String(assignments[mac.orderNumber]) === String(m.id) ? 'selected' : ''}>${m.playerName || m.name}</option>`).join('')}
          </select>
        </div>
      `).join('')}
    </div>
  `;

  return showDialog({
    title: `Assign ${roleName}s — ${team?.name || 'Team'}`,
    message: '',
    confirmText: `Save ${roleName}s`,
    cancelValue: null,
    customElement,
    resolveValue: () => assignments,
    onReady: ({ card, confirmBtn }) => {
      confirmButtonEl = confirmBtn;
      card.querySelectorAll('.role-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
          const orderNum = e.target.dataset.order;
          assignments[orderNum] = Number(e.target.value);
          updateValidation(card);
        });
      });
      updateValidation(card);
    }
  });
}

