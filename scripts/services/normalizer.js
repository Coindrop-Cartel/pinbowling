// Utilities to normalize API rows and build convenient maps
export function normalizeTarget(t) {
  return {
    ...t,
    eventId: t.eventId || t.event_id,
    machineId: t.machineId || t.machine_id,
    machineName: t.machineName || t.machine_name,
    orderNumber: t.orderNumber || t.order_number,
    value1: Number(t.value1 || 0),
    value2: Number(t.value2 || 0),
    values: t.values || {
      1: Number(t.score1 || 0), 2: Number(t.score2 || 0), 3: Number(t.score3 || 0),
      4: Number(t.score4 || 0), 5: Number(t.score5 || 0), 6: Number(t.score6 || 0),
      7: Number(t.score7 || 0), 8: Number(t.score8 || 0), 9: Number(t.score9 || 0), 10: Number(t.score10 || 0)
    }
  };
}

export function normalizeTargets(arr) {
  return (arr || []).map(normalizeTarget);
}

export function normalizeScore(s) {
  return {
    ...s,
    playerId: s.playerId || s.player_id,
    eventId: s.eventId || s.event_id,
    orderNumber: s.orderNumber || s.order_number,
    machineId: s.machineId || s.machine_id
  };
}

export function normalizeScores(arr) {
  return (arr || []).map(normalizeScore);
}

export function groupTargetsByEvent(targets) {
  return (targets || []).reduce((acc, t) => {
    if (!acc[t.eventId]) acc[t.eventId] = [];
    acc[t.eventId].push(t);
    return acc;
  }, {});
}

export function groupScoresByEventAndPlayer(scores) {
  return (scores || []).reduce((acc, s) => {
    if (!acc[s.eventId]) acc[s.eventId] = {};
    if (!acc[s.eventId][s.playerId]) acc[s.eventId][s.playerId] = [];
    acc[s.eventId][s.playerId].push(s);
    return acc;
  }, {});
}

export function groupScoresByPlayer(scores) {
  return (scores || []).reduce((acc, s) => {
    if (!acc[s.playerId]) acc[s.playerId] = [];
    acc[s.playerId].push(s);
    return acc;
  }, {});
}

export function buildScoreMapFromRows(rows) {
  return (rows || []).reduce((map, row) => {
    map[String(row.orderNumber)] = { ball1: Number(row.ball1), ball2: Number(row.ball2), ball3: Number(row.ball3) };
    return map;
  }, {});
}

export function buildScoreMapFromDOM(container) {
  const map = {};
  if (!container) return map;
  const rows = container.querySelectorAll('.round-row');
  rows.forEach(row => {
    const orderNum = Number(row.dataset.orderNumber);
    const ball1El = row.querySelector('[data-ball="1"]');
    const ball2El = row.querySelector('[data-ball="2"]');
    const ball3El = row.querySelector('[data-ball="3"]');
    const ball1 = ball1El ? Number(String(ball1El.value || '').replace(/\D/g, '')) || 0 : 0;
    const ball2 = ball2El ? Number(String(ball2El.value || '').replace(/\D/g, '')) || 0 : 0;
    const ball3 = ball3El ? Number(String(ball3El.value || '').replace(/\D/g, '')) || 0 : 0;
    map[orderNum] = { ball1, ball2, ball3 };
  });
  return map;
}
