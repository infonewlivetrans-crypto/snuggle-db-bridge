import { createServerFn } from "@tanstack/react-start";
import { requireCookieAuth } from "@/server/auth-middleware";
import {
  EXCLUSION_REASONS,
  excludeOrderFromRoute,
  listRouteExclusions,
  type ExclusionReason,
  type RouteExclusionRow,
} from "./route-exclusions.server";

const REASON_SET = new Set<string>(EXCLUSION_REASONS);

export const excludeOrderFromRouteFn = createServerFn({ method: "POST" })
  .middleware([requireCookieAuth])
  .inputValidator(
    (input: {
      deliveryRouteId: string;
      orderId: string;
      reason: ExclusionReason;
      comment?: string | null;
      actorName?: string | null;
    }) => {
      if (!input?.deliveryRouteId) throw new Error("deliveryRouteId обязателен");
      if (!input?.orderId) throw new Error("orderId обязателен");
      if (!REASON_SET.has(input.reason)) throw new Error("Недопустимая причина");
      if (input.comment != null && input.comment.length > 1000) {
        throw new Error("Комментарий слишком длинный (макс 1000 символов)");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await excludeOrderFromRoute({
      deliveryRouteId: data.deliveryRouteId,
      orderId: data.orderId,
      reason: data.reason,
      comment: data.comment ?? null,
      actorUserId: context.userId,
      actorName: data.actorName ?? null,
    });
    return { ok: true };
  });

export const listRouteExclusionsFn = createServerFn({ method: "GET" })
  .middleware([requireCookieAuth])
  .inputValidator((input: { deliveryRouteId: string }) => {
    if (!input?.deliveryRouteId) throw new Error("deliveryRouteId обязателен");
    return input;
  })
  .handler(async ({ data }): Promise<RouteExclusionRow[]> => {
    return listRouteExclusions(data.deliveryRouteId);
  });
