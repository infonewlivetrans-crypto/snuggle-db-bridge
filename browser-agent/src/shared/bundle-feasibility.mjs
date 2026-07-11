// Проверка допустимости связки. Возвращает список причин исключения.

export function checkBundleFeasibility({ timing, truck, options = {} }) {
  const reasons = [];
  const maxDetourKm = options.maxDetourKm ?? Infinity;
  const minProfit = options.minProfit ?? -Infinity;
  const profit = options.profit ?? 0;

  for (const n of timing.nodes) {
    if (n.currentWeightKg > truck.capacityKg + 1) reasons.push("weight_exceeded");
    if (n.currentVolumeM3 > truck.capacityM3 + 0.01) reasons.push("volume_exceeded");
    if (n.unreachable) reasons.push("window_unreachable");
  }
  if ((timing.summary.emptyKm || 0) > maxDetourKm) reasons.push("detour_exceeded");
  if (profit < minProfit) reasons.push("profit_below_minimum");
  if (options.ratingNegative) reasons.push("rating_negative");
  if (options.bodyIncompatible) reasons.push("body_incompatible");
  if (options.loadingIncompatible) reasons.push("loading_incompatible");
  if (options.cargoIncompatible) reasons.push("cargo_incompatible");

  return { feasible: reasons.length === 0, reasons: Array.from(new Set(reasons)) };
}
