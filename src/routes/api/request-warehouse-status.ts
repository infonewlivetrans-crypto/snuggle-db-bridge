import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, requireAuth } from "@/server/api-helpers.server";

type Pt = { order_id: string };
type Item = { product_id: string | null; nomenclature: string; qty: number };
type Reserv = { product_id: string; qty: number };
type Bal = { product_id: string; available: number };
type DRoute = { id: string };
type DockEv = {
  status: string;
  load_plan_confirmed_at: string | null;
  loaded_at: string | null;
  departed_at: string | null;
};
type LoadedRow = { product_id: string | null; qty_loaded: number };

type RequestWarehouseStatus =
  | "awaiting_check"
  | "shortage"
  | "reserved"
  | "ready"
  | "loading"
  | "loaded"
  | "shipped";

/**
 * Серверная агрегация складского статуса транспортной заявки.
 * Объединяет route_points / order_items / stock_reservations / stock_balances /
 * delivery_routes / warehouse_dock_events / dock_loaded_items в один ответ.
 */
export const Route = createFileRoute("/api/request-warehouse-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const requestId = url.searchParams.get("request_id");
        const warehouseId = url.searchParams.get("warehouse_id");
        if (!requestId) return jsonResponse({ error: "request_id required" }, { status: 400 });

        const sb = auth.client;

        const { data: pts } = await sb
          .from("route_points")
          .select("order_id")
          .eq("route_id", requestId);
        const orderIds = Array.from(
          new Set(((pts ?? []) as Pt[]).map((p) => p.order_id).filter(Boolean)),
        );

        let items: Item[] = [];
        if (orderIds.length > 0) {
          const { data } = await sb
            .from("order_items")
            .select("product_id, nomenclature, qty")
            .in("order_id", orderIds);
          items = (data ?? []) as Item[];
        }

        const required = new Map<string, number>();
        for (const it of items) {
          if (!it.product_id) continue;
          required.set(it.product_id, (required.get(it.product_id) ?? 0) + (Number(it.qty) || 0));
        }

        const { data: reservs } = await sb
          .from("stock_reservations")
          .select("product_id, qty")
          .eq("transport_request_id", requestId)
          .eq("status", "active");
        const reservedByProduct = new Map<string, number>();
        for (const r of (reservs ?? []) as Reserv[]) {
          reservedByProduct.set(
            r.product_id,
            (reservedByProduct.get(r.product_id) ?? 0) + (Number(r.qty) || 0),
          );
        }

        const productIds = Array.from(required.keys());
        const availByProduct = new Map<string, number>();
        if (warehouseId && productIds.length > 0) {
          const { data: bals } = await sb
            .from("stock_balances")
            .select("product_id, available")
            .eq("warehouse_id", warehouseId)
            .in("product_id", productIds);
          for (const b of (bals ?? []) as Bal[]) {
            availByProduct.set(b.product_id, Number(b.available) || 0);
          }
        }

        const { data: drs } = await sb
          .from("delivery_routes")
          .select("id")
          .eq("source_request_id", requestId);
        const drIds = ((drs ?? []) as DRoute[]).map((d) => d.id);

        let dockEvents: DockEv[] = [];
        if (drIds.length > 0) {
          const { data: evs } = await sb
            .from("warehouse_dock_events")
            .select("status, load_plan_confirmed_at, loaded_at, departed_at")
            .in("delivery_route_id", drIds);
          dockEvents = (evs ?? []) as DockEv[];
        }

        let loadedRows: LoadedRow[] = [];
        if (drIds.length > 0) {
          const { data: lr } = await sb
            .from("dock_loaded_items")
            .select("product_id, qty_loaded")
            .in("delivery_route_id", drIds);
          loadedRows = (lr ?? []) as LoadedRow[];
        }
        const loadedByProduct = new Map<string, number>();
        for (const r of loadedRows) {
          if (!r.product_id) continue;
          loadedByProduct.set(
            r.product_id,
            (loadedByProduct.get(r.product_id) ?? 0) + (Number(r.qty_loaded) || 0),
          );
        }

        const requiredCount = required.size;

        const departed = dockEvents.some((e) => e.status === "departed" || !!e.departed_at);
        let status: RequestWarehouseStatus;
        let reservedFully = true;
        let anyShortage = false;

        if (departed) {
          status = "shipped";
          return jsonResponse(
            { status, requiredCount, reservedFully: true, anyShortage: false },
            { headers: cacheHeaders(10) },
          );
        }

        const allLoaded =
          requiredCount > 0 &&
          Array.from(required.entries()).every(([pid, need]) => (loadedByProduct.get(pid) ?? 0) >= need);
        const dockSaysLoaded = dockEvents.some((e) => e.status === "loaded" || !!e.loaded_at);
        if (allLoaded || dockSaysLoaded) {
          return jsonResponse(
            { status: "loaded", requiredCount, reservedFully: true, anyShortage: false },
            { headers: cacheHeaders(10) },
          );
        }

        const someLoaded = loadedRows.some((r) => Number(r.qty_loaded) > 0);
        const dockLoading = dockEvents.some((e) => e.status === "loading");
        if (someLoaded || dockLoading) {
          return jsonResponse(
            { status: "loading", requiredCount, reservedFully: true, anyShortage: false },
            { headers: cacheHeaders(10) },
          );
        }

        if (requiredCount === 0) {
          return jsonResponse(
            { status: "awaiting_check", requiredCount, reservedFully: false, anyShortage: false },
            { headers: cacheHeaders(10) },
          );
        }

        for (const [pid, need] of required) {
          const reserved = reservedByProduct.get(pid) ?? 0;
          if (reserved < need) {
            reservedFully = false;
            const stillNeed = need - reserved;
            const av = availByProduct.get(pid) ?? 0;
            if (av < stillNeed) anyShortage = true;
          }
        }

        const planConfirmed = dockEvents.some((e) => !!e.load_plan_confirmed_at);

        if (reservedFully && planConfirmed) status = "ready";
        else if (reservedFully) status = "reserved";
        else if (anyShortage) status = "shortage";
        else status = "awaiting_check";

        return jsonResponse(
          { status, requiredCount, reservedFully, anyShortage },
          { headers: cacheHeaders(10) },
        );
      },
    },
  },
});
