import { createFileRoute } from "@tanstack/react-router";
import { cacheHeaders, jsonResponse, parseListParams, requireAdmin } from "@/server/api-helpers.server";
import { adminCreateInvite, adminListInvites, type InviteRole } from "@/server/invites.server";

const ROLES: InviteRole[] = ["admin", "logist", "manager", "driver"];

export const Route = createFileRoute("/api/invites")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const { limit, offset } = parseListParams(request);
          const all = await adminListInvites(auth.client);
          const rows = all.slice(offset, offset + limit);
          return jsonResponse(rows, { headers: { ...cacheHeaders(30), "X-Total-Count": String(all.length) } });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        const auth = await requireAdmin(request);
        if (auth instanceof Response) return auth;
        try {
          const body = (await request.json()) as { fullName?: string; phone?: string | null; role?: InviteRole; comment?: string | null; driverId?: string | null; managerName?: string | null };
          if (!body.fullName?.trim()) return jsonResponse({ error: "Укажите ФИО" }, { status: 400 });
          if (!body.role || !ROLES.includes(body.role)) return jsonResponse({ error: "Недопустимая роль" }, { status: 400 });
          const row = await adminCreateInvite({ ...body, fullName: body.fullName.trim(), role: body.role, createdBy: auth.userId });
          return jsonResponse(row);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});