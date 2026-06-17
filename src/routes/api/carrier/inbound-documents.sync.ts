import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import { syncCarrierInbox } from "@/server/inbound/sync.server";

export const Route = createFileRoute("/api/carrier/inbound-documents/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        // Найти carrier_ext_id текущего пользователя (через dispatcher_carrier_users).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const link = await (auth.client.from("dispatcher_carrier_users") as any)
          .select("dispatcher_carrier_ext_id")
          .eq("user_id", auth.userId)
          .limit(1)
          .maybeSingle();
        const carrierExtId = link.data?.dispatcher_carrier_ext_id as string | undefined;
        if (!carrierExtId) {
          return jsonResponse(
            { error: "carrier_not_found", message: "Не найден перевозчик для вашего аккаунта" },
            { status: 403 },
          );
        }
        const res = await syncCarrierInbox(auth.client, carrierExtId);
        return jsonResponse(res, { status: res.ok ? 200 : 400 });
      },
    },
  },
});
