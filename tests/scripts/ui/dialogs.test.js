/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showDialog, showConfirm, showPrompt, showPlayerSelectionDialog } from '@ui/dialogs.js';

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

describe('Custom Dialog Modals (dialogs.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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
});

describe('showPlayerSelectionDialog', () => {
  const mockOptions = [
    { value: 1, label: 'Alice' },
    { value: 2, label: 'Bob' }
  ];

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

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
});