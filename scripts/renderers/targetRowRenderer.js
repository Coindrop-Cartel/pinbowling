import { formatNumber, applyScoreFormatting, parseFormattedNumber, renderThresholdGrid, detectScalingFromValues } from '../utils.js';
import { createSearchableSelect } from '../ui/selectors.js';

/**
 * Wires up interactive behaviors on an expandable target/frame row.
 *
 * @param {HTMLElement} row - The row DOM element
 * @param {Object} frame - The target/frame data object (mutated in place)
 * @param {Object} options - Configuration and callbacks
 * @param {Object} options.engine - The active scoring engine format
 * @param {Array} options.machines - Suggested/current list of machines
 * @param {Function} options.onUpdate - Callback triggered when input values change
 * @param {Function} [options.getMachineTargets] - Optional custom lookup for quick fills
 * @param {Function} [options.onSelectMachine] - Callback when a machine is selected
 * @param {Function} [options.afterSelectMachine] - Callback after machine selection UI updates
 * @param {Function} [options.afterQFill] - Callback after quick-fill difficulty updates
 * @param {Function} [options.afterScalingChange] - Callback after scaling change updates
 * @param {boolean} [options.clearSearchOnFocus] - Whether to clear the search input on focus
 * @param {boolean} [options.focusSearchOnExpand] - Whether to focus the search input automatically
 */
export function wireTargetRow(row, frame, options) {
  const engine = options.engine;
  const s10 = row.querySelector('.score10-input');
  const s1 = row.querySelector('.score1-input');

  if (s1) {
    s1.dataset.allowDecimal = engine.getValue2AllowsDecimal?.() === true ? 'true' : 'false';
  }

  if (s10) applyScoreFormatting(s10);
  if (s1) applyScoreFormatting(s1);

  let scaling = frame.scaling;
  if (!scaling && frame.values) {
    scaling = detectScalingFromValues(frame.values);
    frame.scaling = scaling;
  }
  if (!scaling) {
    scaling = 'curved';
    frame.scaling = scaling;
  }

  const updateValues = () => {
    if (s10) frame.value1 = parseFormattedNumber(s10.value);
    if (s1) frame.value2 = parseFormattedNumber(s1.value, engine.getValue2AllowsDecimal?.() === true);
    frame.values = engine.buildRoundValues(frame.value1, frame.value2, frame.scaling);

    const container = row.querySelector('.preview-values-container');
    if (container) {
      container.innerHTML = renderThresholdGrid(engine.filterThresholds(frame.values), formatNumber, engine, frame.value1, frame.value2);
    }
    if (options.onUpdate) {
      options.onUpdate(frame);
    }
  };

  if (s10) s10.oninput = updateValues;
  if (s1) s1.oninput = updateValues;

  const mSearch = row.querySelector('.row-machine-search');
  const mSelect = row.querySelector('.row-machine-select');

  if (mSearch && mSelect) {
    const mSearchInstance = createSearchableSelect(mSearch, mSelect, options.machines, {
      valueKey: 'machineId',
      labelKey: 'machineName',
      placeholder: '-- Select Machine --',
      onSelect: (val) => {
        const match = options.machines.find(m => String(m.machineId || m.id) === String(val));
        if (match) {
          frame.machineName = match.machineName;
          frame.machineId = Number(match.machineId || match.id);
          if (options.onSelectMachine) {
            options.onSelectMachine(frame, match);
          }
          updateValues();
          if (options.afterSelectMachine) {
            options.afterSelectMachine(frame);
          }
        }
      }
    });

    mSearchInstance.updateOptions('');
    if (frame.machineId) {
      mSelect.value = String(frame.machineId);
      mSearch.value = options.clearSearchOnFocus ? '' : (frame.machineName || '');
    }
    mSearch.addEventListener('focus', (e) => e.target.select());
    if (options.focusSearchOnExpand) {
      setTimeout(() => mSearch.focus(), 50);
    }
  }

  row.querySelectorAll('.qfill').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      let val;
      if (options.getMachineTargets) {
        const targets = options.getMachineTargets(frame.machineId);
        val = targets ? targets[type] : null;
      } else {
        val = frame.targets?.[type];
      }
      if (val) {
        const { value1, value2 } = engine.getInitialValues(val);
        frame.value1 = value1;
        frame.value2 = value2;
        if (s10) {
          const v1 = formatNumber(frame.value1);
          s10.value = v1;
          s10.setAttribute('value', v1);
        }
        if (s1) {
          const v2 = formatNumber(frame.value2);
          s1.value = v2;
          s1.setAttribute('value', v2);
        }
        updateValues();
        if (options.afterQFill) {
          options.afterQFill(frame);
        }
      }
    };
  });

  row.querySelectorAll('.scaling-btn').forEach(btn => {
    btn.onclick = () => {
      const newScale = btn.dataset.scale;
      if (frame.scaling !== newScale) {
        frame.scaling = newScale;

        row.querySelectorAll('.scaling-btn').forEach(b => {
          b.classList.toggle('btn-standard', b.dataset.scale === newScale);
          b.classList.toggle('secondary', b.dataset.scale !== newScale);
        });

        updateValues();
        if (options.afterScalingChange) {
          options.afterScalingChange(frame);
        }
      }
    };
  });
}
