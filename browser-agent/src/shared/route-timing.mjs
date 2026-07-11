// Pure route timing engine для одиночных грузов и связок.
// Входные данные — маршрут из шагов (leg) и точек (loading/unloading).
// Возвращает по каждому узлу точное/расчётное/неизвестное время.

const DEFAULTS = { loadingMin: 60, unloadingMin: 60, roadReservePct: 0.1 };

function addMinutes(iso, mins) {
  const t = new Date(iso);
  t.setUTCMinutes(t.getUTCMinutes() + mins);
  return t.toISOString();
}
function maxIso(a, b) {
  return a > b ? a : b;
}

/**
 * @param {{
 *   startIso: string,
 *   nodes: Array<{
 *     type: 'depart'|'pickup'|'drop',
 *     legFromPrevKm?: number,
 *     legDurationMin?: number,
 *     windowFrom?: string|null,
 *     windowTo?: string|null,
 *     durationMin?: number,
 *     weightDeltaKg?: number,
 *     volumeDeltaM3?: number,
 *   }>,
 *   truck: { capacityKg: number, capacityM3: number },
 *   opts?: { loadingMin?: number, unloadingMin?: number, roadReservePct?: number }
 * }} plan
 */
export function computeRouteTiming(plan) {
  const opts = { ...DEFAULTS, ...(plan.opts || {}) };
  const nodes = plan.nodes || [];
  const result = [];
  let cursor = plan.startIso;
  let currentWeight = 0;
  let currentVolume = 0;
  let peakWeight = 0;
  let peakVolume = 0;
  let totalKm = 0;
  let emptyKm = 0;
  let loadedKm = 0;
  let totalWaitMin = 0;
  const warnings = [];

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    let legDuration = n.legDurationMin ?? 0;
    if (legDuration) legDuration = Math.round(legDuration * (1 + opts.roadReservePct));
    const legKm = n.legFromPrevKm ?? 0;
    totalKm += legKm;
    if (i > 0) {
      if (currentWeight > 0 || currentVolume > 0) loadedKm += legKm;
      else emptyKm += legKm;
    }
    const eta = addMinutes(cursor, legDuration);
    let arrival = eta;
    let waitMin = 0;
    if (n.windowFrom && arrival < n.windowFrom) {
      waitMin = Math.round(
        (new Date(n.windowFrom).getTime() - new Date(arrival).getTime()) / 60000,
      );
      arrival = n.windowFrom;
    }
    totalWaitMin += waitMin;
    const opMin =
      n.durationMin ??
      (n.type === "pickup" ? opts.loadingMin : n.type === "drop" ? opts.unloadingMin : 0);
    const departure = addMinutes(arrival, opMin);
    let unreachable = false;
    if (n.windowTo && arrival > n.windowTo) {
      unreachable = true;
      warnings.push({ nodeIndex: i, code: "window_unreachable" });
    }
    if (n.type === "pickup") {
      currentWeight += n.weightDeltaKg ?? 0;
      currentVolume += n.volumeDeltaM3 ?? 0;
    } else if (n.type === "drop") {
      currentWeight += n.weightDeltaKg ?? 0; // отрицательные
      currentVolume += n.volumeDeltaM3 ?? 0;
    }
    if (currentWeight > peakWeight) peakWeight = currentWeight;
    if (currentVolume > peakVolume) peakVolume = currentVolume;
    if (
      currentWeight > plan.truck.capacityKg + 1 ||
      currentVolume > plan.truck.capacityM3 + 0.01
    ) {
      warnings.push({ nodeIndex: i, code: "capacity_exceeded" });
    }
    result.push({
      index: i,
      type: n.type,
      etaIso: eta,
      arrivalIso: arrival,
      departureIso: departure,
      waitMin,
      operationMin: opMin,
      legKm,
      legDurationMin: legDuration,
      currentWeightKg: currentWeight,
      currentVolumeM3: currentVolume,
      unreachable,
      accuracy: n.windowFrom || n.windowTo ? "estimated" : "estimated",
    });
    cursor = maxIso(departure, arrival);
  }

  const first = result[0]?.arrivalIso ?? plan.startIso;
  const last = result[result.length - 1]?.departureIso ?? plan.startIso;
  const totalMinutes = Math.round(
    (new Date(last).getTime() - new Date(first).getTime()) / 60000,
  );

  return {
    nodes: result,
    summary: {
      totalKm,
      emptyKm,
      loadedKm,
      totalWaitMin,
      totalMinutes,
      peakWeightKg: peakWeight,
      peakVolumeM3: peakVolume,
      warnings,
      feasible: warnings.every((w) => w.code !== "capacity_exceeded"),
    },
  };
}
