import { createServerFn } from "@tanstack/react-start";
import {
  assignDriverToRoute,
  backfillDriverInvites,
  listDriverAccessStatus,
  type DriverAccessStatus,
} from "./driver-access.server";

export type { DriverAccessStatus };

export const listDriverAccessStatusFn = createServerFn({ method: "GET" }).handler(async () => {
  return listDriverAccessStatus();
});

export const backfillDriverInvitesFn = createServerFn({ method: "POST" }).handler(async () => {
  return backfillDriverInvites();
});

export const assignDriverToRouteFn = createServerFn({ method: "POST" })
  .inputValidator((input: { deliveryRouteId: string; driverId: string }) => {
    if (!input?.deliveryRouteId) throw new Error("deliveryRouteId обязателен");
    if (!input?.driverId) throw new Error("driverId обязателен");
    return input;
  })
  .handler(async ({ data }) => {
    return assignDriverToRoute(data);
  });