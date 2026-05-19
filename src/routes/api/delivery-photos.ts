import { createFileRoute } from "@tanstack/react-router";
import {
  cacheHeaders,
  jsonResponse,
  requireAuth,
} from "@/server/api-helpers.server";
import { frontendStorageUrl } from "@/lib/storageUrls";

const ROUTE_POINT_PHOTOS_BUCKET = "route-point-photos";

type PhotoQuery = {
  eq: (field: string, value: string) => PhotoQuery;
} & PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

export const Route = createFileRoute("/api/delivery-photos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const routePointId = url.searchParams.get("route_point_id");
        const orderId = url.searchParams.get("order_id");
        const preview = url.searchParams.get("preview") === "1";

        const fields = preview
          ? "id, route_point_id, order_id, kind, created_at"
          : "id, route_point_id, order_id, kind, file_url, bucket, path, storage_path, file_name, mime_type, created_at";

        let q = (
          auth.client.from("route_point_photos") as unknown as {
            select: (fields: string) => {
              order: (field: string, opts: { ascending: boolean }) => {
                limit: (count: number) => unknown;
              };
            };
          }
        )
          .select(fields)
          .order("created_at", { ascending: true })
          .limit(200) as PhotoQuery;
        if (routePointId) q = q.eq("route_point_id", routePointId);
        if (orderId) q = q.eq("order_id", orderId);

        const { data, error } = await q;
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        const rawRows = (data ?? []) as Array<Record<string, unknown>>;
        const rows = preview
          ? data ?? []
          : rawRows.map((row) => ({
              ...row,
              file_url:
                frontendStorageUrl(row, ROUTE_POINT_PHOTOS_BUCKET) ??
                (typeof row.file_url === "string" ? row.file_url : null),
            }));
        return jsonResponse(
          { rows },
          { headers: cacheHeaders(0) },
        );
      },
    },
  },
});
