import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const TABLE = "dispatcher_tasks";
const ALLOWED_ROLES = ["admin", "dispatcher"];

type Candidate = {
  task_type: string;
  title: string;
  description?: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  related_entity_type:
    | "carrier"
    | "driver"
    | "vehicle"
    | "freight"
    | "deal"
    | "commission"
    | "none";
  related_entity_id: string | null;
  dispatcher_carrier_ext_id?: string | null;
  dispatcher_driver_ext_id?: string | null;
  dispatcher_vehicle_ext_id?: string | null;
  dispatcher_freight_id?: string | null;
  dispatcher_deal_id?: string | null;
  action_url?: string | null;
  due_date: string;
};

export const Route = createFileRoute("/api/dispatcher/tasks/generate-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c: any = auth.client;

        const today = new Date().toISOString().slice(0, 10);

        // Load source data in parallel
        const [vehicles, freights, deals, drivers, carriers, existingToday] =
          await Promise.all([
            c
              .from("dispatcher_vehicle_ext")
              .select("id, vehicle_kind, home_city, dispatcher_status")
              .in("dispatcher_status", ["available", "waiting_freight", "new"]),
            c
              .from("dispatcher_freights")
              .select("id, title, loading_city, unloading_city, dispatcher_status")
              .in("dispatcher_status", ["new", "checking", "suitable"]),
            c
              .from("dispatcher_deals")
              .select(
                "id, deal_number, vehicle_id, main_freight_id, loading_date, unloading_date, " +
                  "deal_status, payment_status, commission_status, expected_payment_date",
              ),
            c
              .from("dispatcher_driver_ext")
              .select("id, full_name, docs_verified")
              .eq("docs_verified", false),
            c
              .from("dispatcher_carrier_ext")
              .select("id, name, verification_status")
              .in("verification_status", ["new", "on_check", "missing_docs"]),
            c
              .from(TABLE)
              .select("task_type, related_entity_type, related_entity_id, task_status, due_date")
              .in("task_status", ["open", "in_progress"])
              .eq("due_date", today),
          ]);

        const allDeals = (deals.data ?? []) as Array<{
          id: string;
          deal_number: string | null;
          vehicle_id: string | null;
          main_freight_id: string | null;
          loading_date: string | null;
          unloading_date: string | null;
          deal_status: string;
          payment_status: string;
          commission_status: string;
          expected_payment_date: string | null;
        }>;

        const activeDealsByVehicle = new Set(
          allDeals
            .filter(
              (d) =>
                d.vehicle_id &&
                !["archived", "cancelled", "closed"].includes(d.deal_status),
            )
            .map((d) => d.vehicle_id as string),
        );
        const dealsByFreight = new Set(
          allDeals
            .filter((d) => d.main_freight_id)
            .map((d) => d.main_freight_id as string),
        );

        const existingKey = new Set<string>(
          ((existingToday.data ?? []) as Array<{
            task_type: string;
            related_entity_type: string | null;
            related_entity_id: string | null;
          }>).map(
            (t) => `${t.task_type}::${t.related_entity_type ?? ""}::${t.related_entity_id ?? ""}`,
          ),
        );

        const candidates: Candidate[] = [];

        // 1. Free vehicles without active deals → find_freight
        for (const v of (vehicles.data ?? []) as Array<{
          id: string;
          vehicle_kind: string | null;
          home_city: string | null;
        }>) {
          if (activeDealsByVehicle.has(v.id)) continue;
          candidates.push({
            task_type: "find_freight",
            title: `Найти груз для машины${v.vehicle_kind ? ` ${v.vehicle_kind}` : ""}${
              v.home_city ? ` (${v.home_city})` : ""
            }`,
            priority: "high",
            related_entity_type: "vehicle",
            related_entity_id: v.id,
            dispatcher_vehicle_ext_id: v.id,
            action_url: "/dispatcher/freights",
            due_date: today,
          });
        }

        // 2. New freights without deals → check_freight_matches
        for (const f of (freights.data ?? []) as Array<{
          id: string;
          title: string | null;
          loading_city: string | null;
          unloading_city: string | null;
        }>) {
          if (dealsByFreight.has(f.id)) continue;
          const label =
            f.title ??
            [f.loading_city, f.unloading_city].filter(Boolean).join(" → ") ??
            "груза";
          candidates.push({
            task_type: "check_freight_matches",
            title: `Проверить машины под груз: ${label}`,
            priority: "high",
            related_entity_type: "freight",
            related_entity_id: f.id,
            dispatcher_freight_id: f.id,
            action_url: "/dispatcher/freights",
            due_date: today,
          });
        }

        // 3-7. Deal-based tasks
        for (const d of allDeals) {
          if (["archived", "cancelled"].includes(d.deal_status)) continue;

          // 3. Loading today
          if (
            d.loading_date === today &&
            ["agreed", "documents_sent"].includes(d.deal_status)
          ) {
            candidates.push({
              task_type: "check_loading",
              title: `Проверить загрузку: ${d.deal_number ?? d.id.slice(0, 8)}`,
              priority: "high",
              related_entity_type: "deal",
              related_entity_id: d.id,
              dispatcher_deal_id: d.id,
              action_url: "/dispatcher/deals",
              due_date: today,
            });
          }

          // 4. Unloading today
          if (
            d.unloading_date === today &&
            ["in_transit", "unloading"].includes(d.deal_status)
          ) {
            candidates.push({
              task_type: "check_unloading",
              title: `Проверить выгрузку: ${d.deal_number ?? d.id.slice(0, 8)}`,
              priority: "high",
              related_entity_type: "deal",
              related_entity_id: d.id,
              dispatcher_deal_id: d.id,
              action_url: "/dispatcher/deals",
              due_date: today,
            });
          }

          // 5. Waiting customer payment
          if (d.payment_status === "waiting_customer_payment") {
            const overduePayment =
              d.expected_payment_date && d.expected_payment_date <= today;
            candidates.push({
              task_type: "check_customer_payment",
              title: `Проверить оплату: ${d.deal_number ?? d.id.slice(0, 8)}`,
              priority: overduePayment ? "high" : "normal",
              related_entity_type: "deal",
              related_entity_id: d.id,
              dispatcher_deal_id: d.id,
              action_url: "/dispatcher/commissions",
              due_date: today,
            });
          }

          // 6. Waiting commission
          if (d.commission_status === "waiting_commission") {
            candidates.push({
              task_type: "remind_commission",
              title: `Напомнить про комиссию: ${d.deal_number ?? d.id.slice(0, 8)}`,
              priority: "high",
              related_entity_type: "deal",
              related_entity_id: d.id,
              dispatcher_deal_id: d.id,
              action_url: "/dispatcher/commissions",
              due_date: today,
            });
          }

          // 7. Overdue commission
          if (
            d.expected_payment_date &&
            d.expected_payment_date < today &&
            d.commission_status !== "commission_paid"
          ) {
            candidates.push({
              task_type: "overdue_commission",
              title: `Просрочена комиссия: ${d.deal_number ?? d.id.slice(0, 8)}`,
              priority: "urgent",
              related_entity_type: "deal",
              related_entity_id: d.id,
              dispatcher_deal_id: d.id,
              action_url: "/dispatcher/commissions",
              due_date: today,
            });
          }
        }

        // 8. Documents not verified
        for (const dr of (drivers.data ?? []) as Array<{
          id: string;
          full_name: string | null;
        }>) {
          candidates.push({
            task_type: "check_documents",
            title: `Проверить документы водителя${dr.full_name ? `: ${dr.full_name}` : ""}`,
            priority: "normal",
            related_entity_type: "driver",
            related_entity_id: dr.id,
            dispatcher_driver_ext_id: dr.id,
            action_url: "/dispatcher/drivers",
            due_date: today,
          });
        }
        for (const cr of (carriers.data ?? []) as Array<{
          id: string;
          name: string | null;
        }>) {
          candidates.push({
            task_type: "check_documents",
            title: `Проверить документы перевозчика${cr.name ? `: ${cr.name}` : ""}`,
            priority: "normal",
            related_entity_type: "carrier",
            related_entity_id: cr.id,
            dispatcher_carrier_ext_id: cr.id,
            action_url: "/dispatcher/carriers",
            due_date: today,
          });
        }

        // Dedupe vs existing open/in_progress for today
        const toInsert: Candidate[] = [];
        const seenInBatch = new Set<string>();
        for (const cand of candidates) {
          const key = `${cand.task_type}::${cand.related_entity_type}::${cand.related_entity_id ?? ""}`;
          if (existingKey.has(key) || seenInBatch.has(key)) continue;
          seenInBatch.add(key);
          toInsert.push(cand);
        }

        let created = 0;
        if (toInsert.length > 0) {
          const payload = toInsert.map((t) => ({
            ...t,
            task_status: "open",
            created_by: auth.userId,
          }));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await (c.from(TABLE as never) as any)
            .insert(payload as unknown as never)
            .select("id");
          if (error) return jsonResponse({ error: error.message }, { status: 500 });
          created = (data ?? []).length;
        }

        return jsonResponse({
          created,
          total: candidates.length,
          today,
        });
      },
    },
  },
});
