import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";

const BUCKET = "dispatcher-documents";
const ALLOWED_ROLES = ["admin", "dispatcher"];

function guessContentType(name: string, fallback: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return fallback || "application/octet-stream";
  }
}

export const Route = createFileRoute("/api/dispatcher/documents/$id/download")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: row, error } = await (auth.client
          .from("dispatcher_documents" as never) as any)
          .select("file_path, file_name, file_mime")
          .eq("id", params.id)
          .maybeSingle();
        if (error) return jsonResponse({ error: error.message }, { status: 500 });
        if (!row || !row.file_path) {
          return jsonResponse({ error: "not_found" }, { status: 404 });
        }

        const path = String(row.file_path);
        if (path.includes("..") || path.startsWith("/")) {
          return jsonResponse({ error: "invalid path" }, { status: 400 });
        }

        // Создаём signed URL и проксируем файл через сервер,
        // чтобы клиенту не уходил прямой URL Supabase.
        const { data: signed, error: signErr } = await auth.client.storage
          .from(BUCKET)
          .createSignedUrl(path, 60);
        if (signErr || !signed?.signedUrl) {
          return jsonResponse({ error: signErr?.message ?? "signed_url_failed" }, { status: 500 });
        }
        const upstream = await fetch(signed.signedUrl).catch(() => null);
        if (!upstream || !upstream.ok || !upstream.body) {
          return new Response("Not found", { status: 404 });
        }
        const contentType =
          upstream.headers.get("content-type") ??
          guessContentType(row.file_name ?? path, row.file_mime ?? "");
        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": contentType,
            "cache-control": "private, no-store",
          },
        });
      },
    },
  },
});
