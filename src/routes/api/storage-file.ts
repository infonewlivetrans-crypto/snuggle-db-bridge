import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

// Список публичных bucket, для которых разрешено проксирование файлов
// без service_role. Достаточно anon ключа для чтения.
const ALLOWED_BUCKETS = new Set([
  "route-point-photos",
  "carrier-documents",
  "order-return-photos",
]);

function getSupabaseUrl(): string {
  return (
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    ""
  );
}

function guessContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

export const Route = createFileRoute("/api/storage-file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Требуем авторизацию: файлы маршрутов не должны раздаваться публично
        // через наш домен.
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const url = new URL(request.url);
        const bucket = url.searchParams.get("bucket") ?? "";
        const path = url.searchParams.get("path") ?? "";

        if (!bucket || !path) {
          return jsonResponse({ error: "bucket and path required" }, { status: 400 });
        }
        if (!ALLOWED_BUCKETS.has(bucket)) {
          return jsonResponse({ error: "bucket not allowed" }, { status: 400 });
        }
        // Защита от ../ и абсолютных путей
        if (path.includes("..") || path.startsWith("/")) {
          return jsonResponse({ error: "invalid path" }, { status: 400 });
        }

        const base = getSupabaseUrl();
        if (!base) {
          return jsonResponse({ error: "storage not configured" }, { status: 500 });
        }

        const upstream = `${base}/storage/v1/object/public/${bucket}/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`;

        try {
          const resp = await fetch(upstream);
          if (!resp.ok || !resp.body) {
            return new Response("Not found", {
              status: 404,
              headers: { "cache-control": "no-store" },
            });
          }
          const contentType = resp.headers.get("content-type") ?? guessContentType(path);
          return new Response(resp.body, {
            status: 200,
            headers: {
              "content-type": contentType,
              "cache-control": "private, max-age=300",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
