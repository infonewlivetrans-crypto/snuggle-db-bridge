// Экономика варианта (одиночный груз или связка).

/**
 * @param {{
 *   loads: Array<{ price: number|null, currency?: string }>,
 *   totalKm: number, emptyKm: number, loadedKm: number,
 *   costs?: { fuelPerKm?: number, tolls?: number, commissionPct?: number, other?: number }
 * }} inp
 */
export function computeVariantEconomics(inp) {
  const totalRate = (inp.loads || []).reduce((s, l) => s + (Number(l.price) || 0), 0);
  const c = inp.costs || {};
  const fuel = (Number(c.fuelPerKm) || 0) * (inp.totalKm || 0);
  const tolls = Number(c.tolls) || 0;
  const commission = totalRate * ((Number(c.commissionPct) || 0) / 100);
  const other = Number(c.other) || 0;
  const totalCosts = fuel + tolls + commission + other;
  const profit = totalRate - totalCosts;
  const profitPct = totalRate > 0 ? Math.round((profit / totalRate) * 100) : 0;
  const ratePerKm = inp.totalKm > 0 ? Math.round(totalRate / inp.totalKm) : 0;
  return {
    totalRate,
    fuelCost: Math.round(fuel),
    tollsCost: Math.round(tolls),
    commissionCost: Math.round(commission),
    otherCost: Math.round(other),
    totalCosts: Math.round(totalCosts),
    profit: Math.round(profit),
    profitPct,
    ratePerKm,
    emptyKm: inp.emptyKm || 0,
    loadedKm: inp.loadedKm || 0,
    totalKm: inp.totalKm || 0,
  };
}
