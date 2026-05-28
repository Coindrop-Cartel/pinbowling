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

/**
 * Sets up a live search/filter on an input field against a data array.
 * Useful for filtering lists that are rendered manually (e.g., div lists, tables).
 * 
 * @param {HTMLInputElement} inputElement The input field to watch.
 * @param {Array} data The source data (should be updated in-place to maintain reference).
 * @param {Object} options Configuration.
 */
export function setupLiveFilter(inputElement, data, { labelKey = 'name', onFilter = null } = {}) {
  const performFilter = () => {
    const query = inputElement.value.trim().toLowerCase();
    const filtered = data.filter(item =>
      String(item[labelKey]).toLowerCase().includes(query)
    );
    if (onFilter) onFilter(filtered, query);
  };

  inputElement.addEventListener('input', performFilter);
  return { performFilter };
}