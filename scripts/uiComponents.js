/**
 * Creates a searchable selection interaction between a text input and a select dropdown.
 * 
 * @param {HTMLInputElement} searchInput The text field used for filtering.
 * @param {HTMLSelectElement} selectElement The dropdown to be filtered.
 * @param {Array} data The array of objects to search through.
 * @param {Object} options Configuration for keys, placeholders, and callbacks.
 */
export function createSearchableSelect(searchInput, selectElement, data, {
  valueKey = 'id',
  labelKey = 'name',
  placeholder = '-- Choose --',
  onSelect = null
} = {}) {
  const updateOptions = (filter = '') => {
    const currentVal = selectElement.value;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    const normalizedFilter = filter.toLowerCase();

    let matchCount = 0;
    data.forEach(item => {
      const label = String(item[labelKey]);
      if (label.toLowerCase().includes(normalizedFilter)) {
        const opt = document.createElement('option');
        opt.value = item[valueKey];
        opt.textContent = label;
        if (String(item[valueKey]) === String(currentVal)) opt.selected = true;
        selectElement.appendChild(opt);
        matchCount++;
      }
    });
    return matchCount;
  };

  searchInput.addEventListener('input', (e) => {
    const filter = e.target.value;
    const matchCount = updateOptions(filter);
    selectElement.size = filter.length > 0 ? Math.min(matchCount + 1, 5) : 1;

    const exactMatch = data.find(item => String(item[labelKey]).toLowerCase() === filter.toLowerCase());
    if (exactMatch && String(selectElement.value) !== String(exactMatch[valueKey])) {
      selectElement.value = exactMatch[valueKey];
      selectElement.size = 1;
      if (onSelect) onSelect(exactMatch[valueKey]);
    }
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => { selectElement.size = 1; }, 200);
  });

  selectElement.addEventListener('change', () => {
    const val = selectElement.value;
    const match = data.find(item => String(item[valueKey]) === String(val));
    selectElement.size = 1;
    searchInput.value = match ? match[labelKey] : '';
    if (onSelect) onSelect(val);
  });

  return { updateOptions };
}