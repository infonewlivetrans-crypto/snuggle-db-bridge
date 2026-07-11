import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRouteTiming } from "../src/shared/route-timing.mjs";
import { computeVariantEconomics } from "../src/shared/bundle-economics.mjs";
import { checkBundleFeasibility } from "../src/shared/bundle-feasibility.mjs";

const truck = { capacityKg: 20000, capacityM3: 82 };

test("single load: pickup then drop with default durations", () => {
  const plan = {
    startIso: "2026-07-11T08:00:00.000Z",
    truck,
    nodes: [
      { type: "depart" },
      { type: "pickup", legFromPrevKm: 100, legDurationMin: 90, weightDeltaKg: 5000, volumeDeltaM3: 20 },
      { type: "drop", legFromPrevKm: 200, legDurationMin: 180, weightDeltaKg: -5000, volumeDeltaM3: -20 },
    ],
  };
  const r = computeRouteTiming(plan);
  assert.equal(r.summary.totalKm, 300);
  assert.equal(r.summary.emptyKm, 100);
  assert.equal(r.summary.loadedKm, 200);
  assert.equal(r.summary.peakWeightKg, 5000);
  assert.ok(r.summary.feasible);
});

test("window unreachable produces warning", () => {
  const plan = {
    startIso: "2026-07-11T08:00:00.000Z",
    truck,
    nodes: [
      { type: "depart" },
      {
        type: "pickup",
        legFromPrevKm: 100,
        legDurationMin: 120,
        windowTo: "2026-07-11T08:30:00.000Z",
        weightDeltaKg: 1000,
      },
    ],
  };
  const r = computeRouteTiming(plan);
  assert.ok(r.summary.warnings.some((w) => w.code === "window_unreachable"));
});

test("capacity exceeded flags infeasible", () => {
  const plan = {
    startIso: "2026-07-11T08:00:00.000Z",
    truck: { capacityKg: 1000, capacityM3: 10 },
    nodes: [
      { type: "depart" },
      { type: "pickup", legFromPrevKm: 10, legDurationMin: 10, weightDeltaKg: 2000 },
    ],
  };
  const r = computeRouteTiming(plan);
  assert.ok(r.summary.warnings.some((w) => w.code === "capacity_exceeded"));
  assert.equal(r.summary.feasible, false);
});

test("waiting for window increases wait time", () => {
  const plan = {
    startIso: "2026-07-11T08:00:00.000Z",
    truck,
    nodes: [
      { type: "depart" },
      {
        type: "pickup",
        legFromPrevKm: 10,
        legDurationMin: 10,
        windowFrom: "2026-07-11T12:00:00.000Z",
        weightDeltaKg: 1000,
      },
    ],
  };
  const r = computeRouteTiming(plan);
  assert.ok(r.summary.totalWaitMin > 200);
});

test("economics: rate/km and profit", () => {
  const e = computeVariantEconomics({
    loads: [{ price: 30000 }, { price: 20000 }],
    totalKm: 500,
    emptyKm: 100,
    loadedKm: 400,
    costs: { fuelPerKm: 20, tolls: 500, commissionPct: 5, other: 1000 },
  });
  assert.equal(e.totalRate, 50000);
  assert.equal(e.ratePerKm, 100);
  assert.equal(e.commissionCost, 2500);
  assert.equal(e.fuelCost, 10000);
  assert.equal(e.profit, 50000 - (10000 + 500 + 2500 + 1000));
});

test("feasibility rejects overweight bundle", () => {
  const timing = {
    nodes: [{ currentWeightKg: 25000, currentVolumeM3: 10, unreachable: false }],
    summary: { emptyKm: 0 },
  };
  const f = checkBundleFeasibility({ timing, truck: { capacityKg: 20000, capacityM3: 82 } });
  assert.equal(f.feasible, false);
  assert.ok(f.reasons.includes("weight_exceeded"));
});
