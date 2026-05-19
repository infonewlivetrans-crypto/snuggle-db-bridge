import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAuth, cacheHeaders } from "@/server/api-helpers.server";
import {
  extractStorageObjectFromUrl,
  frontendStorageUrl,
  storageFileApiUrl,
} from "@/lib/storageUrls";

const BUCKET = "route-point-photos";

const InsertSchema = z.object({
  route_point_id: z.string().uuid(),
  order_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["qr", "signed_docs", "payment", "problem", "unloading_place"]),
  file_url: z.string().min(1).max(2000).optional(),
  storage_path: z.string().min(1).max(2000),
  bucket: z.string().min(1).max(128).optional(),
  path: z.string().min(1).max(2000).optional(),
  file_name: z.string().min(1).max(255).optional(),
  mime_type: z.string().min(1).max(255).optional(),
});

export const Route = createFileRoute("/api/route-point-photos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const ids = (url.searchParams.get("point_ids") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length === 0) return jsonResponse([], { headers: cacheHeaders(10) });
        const { data, error } = await auth.client
          .from("route_point_photos")
          .select("id, route_point_id, kind, file_url, bucket, path, storage_path")
          .in("route_point_id", ids);
        if (error) return jsonResponse([], { status: 500, headers: { "X-Error": error.message } });
        const rows = (data ?? []).map((row) => ({
          ...row,
          file_url: frontendStorageUrl(row, BUCKET) ?? row.file_url,
        }));
        return jsonResponse(rows, { headers: cacheHeaders(10) });
      },
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: unknown;
        try { body = await request.json(); } catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        const parsed = InsertSchema.safeParse(body);
        if (!parsed.success) return jsonResponse({ error: parsed.error.message }, { status: 400 });
        const legacy = extractStorageObjectFromUrl(parsed.data.file_url);
        const bucket = parsed.data.bucket ?? legacy?.bucket ?? BUCKET;
        const path = parsed.data.path ?? parsed.data.storage_path ?? legacy?.path;
        const fileUrl = storageFileApiUrl(bucket, path);
        const insertPayload = {
          ...parsed.data,
          bucket,
          path,
          storage_path: path,
          file_url: fileUrl,
          uploaded_by: auth.userId ?? null,
        };
        const { error } = await (
          auth.client.from("route_point_photos") as unknown as {
            insert: (p: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
          }
        ).insert(insertPayload);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
      DELETE: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        if (!id) return jsonResponse({ error: "id required" }, { status: 400 });
        const { data: row } = await auth.client
          .from("route_point_photos")
          .select("storage_path")
          .eq("id", id)
          .maybeSingle();
        const storagePath = (row as { storage_path?: string | null } | null)?.storage_path ?? null;
        if (storagePath) {
          await auth.client.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
        }
        const { error } = await auth.client.from("route_point_photos").delete().eq("id", id);
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        return jsonResponse({ ok: true });
      },
    },
  },
});
