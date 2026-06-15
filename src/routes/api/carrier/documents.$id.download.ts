import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { resolveCarrierCtx } from "@/server/carrier-cabinet.server";

const BUCKET = "dispatcher-documents";

function guessContentType(name: string, fallback: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "pdf": return "application/pdf";
    default: return fallback || "application/octet-stream";
  }
}

export const Route = createFileRoute("/api/carrier/documents/$id/download")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const auth = await requireAnyRole(request, ["carrier", "admin"]);
        if (auth instanceof Response) return auth;
        if (!params.id) return jsonResponse({ error: "id required" }, { status: 400 });
        const ctx = await resolveCarrierCtx(auth);
        if (ctx instanceof Response) return ctx;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: row } = await (ctx.admin.from("dispatcher_documents" as never) as any)
          .select("file_path, file_name, file_mime, owner_type, owner_id")
          .eq("id", params.id)
          .maybeSingle();
        if (!row || !row.file_path) return jsonResponse({ error: "not_found" }, { status: 404 });

        // ownership
        const ot = row.owner_type as string;
        const oid = row.owner_id as string;
        let owned = false;
        if (ot === "carrier") owned = oid === ctx.dispatcherCarrierExtId;
        else if (ot === "driver" || ot === "vehicle") {
          const t = ot === "driver" ? "dispatcher_driver_ext" : "dispatcher_vehicle_ext";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (ctx.admin.from(t as never) as any)
            .select("id").eq("id", oid).eq("dispatcher_carrier_ext_id", ctx.dispatcherCarrierExtId).maybeSingle();
          owned = !!data?.id;
        } else if (ot === "freight") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (ctx.admin.from("dispatcher_freights" as never) as any)
            .select("id").eq("id", oid).eq("assigned_carrier_ext_id", ctx.dispatcherCarrierExtId).maybeSingle();
          owned = !!data?.id;
        } else if (ot === "deal") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (ctx.admin.from("dispatcher_deals" as never) as any)
            .select("id").eq("id", oid).eq("carrier_id", ctx.dispatcherCarrierExtId).maybeSingle();
          owned = !!data?.id;
        }
        if (!owned) return jsonResponse({ error: "forbidden" }, { status: 403 });

        const path = String(row.file_path);
        if (path.includes("..") || path.startsWith("/")) {
          return jsonResponse({ error: "invalid path" }, { status: 400 });
        }
        const { data: signed, error: signErr } = await ctx.admin.storage
          .from(BUCKET).createSignedUrl(path, 60);
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
          headers: { "content-type": contentType, "cache-control": "private, no-store" },
        });
      },
    },
  },
});
