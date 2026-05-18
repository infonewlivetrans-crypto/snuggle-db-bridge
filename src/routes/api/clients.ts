import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  getBearerToken,
  jsonResponse,
  parseListParams,
  requireUser,
} from "@/server/api-helpers.server";

export const Route = createFileRoute("/api/clients")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = getBearerToken(request);
        if (!token) return jsonResponse({ error: "unauthorized" }, { status: 401 });
        const auth = await requireUser(token);
        if (!auth) return jsonResponse({ error: "unauthorized" }, { status: 401 });

        const { limit, offset, search } = parseListParams(request);
        const url = new URL(request.url);
        const nameExact = url.searchParams.get("name");
        const fieldsParam = url.searchParams.get("fields");

        // Whitelist полей. По умолчанию — *.
        const ALLOWED = new Set<string>([
          "id",
          "name",
          "phone",
          "phone_secondary",
          "address",
          "type",
          "is_active",
          "created_at",
          "updated_at",
          "comment",
          "contact_person",
        ]);
        let select = "*";
        if (fieldsParam && fieldsParam.trim().length > 0) {
          const parts = fieldsParam.split(",").map((s) => s.trim()).filter(Boolean);
          const safe = parts.filter((p) => ALLOWED.has(p));
          if (safe.length > 0) select = safe.join(", ");
        }

        let q = auth.client
          .from("clients" as never)
          .select(select, { count: "exact" })
          .order("name", { ascending: true });
        if (search) q = q.ilike("name", `%${search}%`);
        if (nameExact) q = q.eq("name", nameExact);

        const { data, error, count } = await q.range(offset, offset + limit - 1);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse(
          { rows: data ?? [], total: count ?? 0 },
          { headers: cacheHeaders(300) },
        );
      },
    },
  },
});
