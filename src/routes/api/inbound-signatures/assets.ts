// /api/inbound-signatures/assets — список и создание/обновление образцов
// печати и подписи перевозчика. Браузер уже подготавливает обрезанные PNG
// с прозрачным фоном и присылает их multipart'ом.
import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

const BUCKET = "inbound-documents";

async function resolveCarrierExtId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  userId: string,
  hinted?: string | null,
): Promise<string | null> {
  if (hinted) return hinted;
  const link = await sb
    .from("dispatcher_carrier_users")
    .select("dispatcher_carrier_ext_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return link.data?.dispatcher_carrier_ext_id ?? null;
}

export const Route = createFileRoute("/api/inbound-signatures/assets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;
        const url = new URL(request.url);
        const carrierHint = url.searchParams.get("carrier_ext_id");
        const carrierExtId = await resolveCarrierExtId(sb, auth.userId, carrierHint);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = sb
          .from("carrier_signature_assets")
          .select("*")
          .order("is_active", { ascending: false })
          .order("created_at", { ascending: false });
        if (carrierExtId) q = q.eq("carrier_ext_id", carrierExtId);
        const res = await q;
        if (res.error) return jsonResponse({ error: res.error.message }, { status: 500 });

        // Подписанные URL для preview.
        const rows = await Promise.all(
          (res.data ?? []).map(async (r: Record<string, unknown>) => {
            const urls: Record<string, string | null> = { stamp_url: null, signature_url: null, source_url: null };
            for (const [k, field] of [
              ["stamp_url", "stamp_file_path"],
              ["signature_url", "signature_file_path"],
              ["source_url", "source_file_path"],
            ] as const) {
              const p = r[field] as string | null;
              if (p) {
                const s = await sb.storage.from(BUCKET).createSignedUrl(p, 600);
                urls[k] = s.data?.signedUrl ?? null;
              }
            }
            return { ...r, ...urls };
          }),
        );
        return jsonResponse({ rows });
      },

      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        const sb = auth.client;

        let form: FormData;
        try { form = await request.formData(); } catch {
          return jsonResponse({ error: "bad_form" }, { status: 400 });
        }
        const stamp = form.get("stamp") as File | null;
        const signature = form.get("signature") as File | null;
        const source = form.get("source") as File | null;
        const consent = String(form.get("consent") ?? "") === "true";
        const carrierExtIdInput = (form.get("carrier_ext_id") as string | null) ?? null;
        const stampBbox = safeJson(form.get("stamp_bbox") as string | null);
        const signatureBbox = safeJson(form.get("signature_bbox") as string | null);
        const bgRemoval = safeJson(form.get("bg_removal") as string | null);

        if (!consent) {
          return jsonResponse(
            { error: "consent_required", message: "Подтвердите согласие на использование печати и подписи" },
            { status: 400 },
          );
        }
        if (!stamp || !signature) {
          return jsonResponse(
            { error: "files_required", message: "Загрузите обработанные печать и подпись" },
            { status: 400 },
          );
        }

        const carrierExtId = await resolveCarrierExtId(sb, auth.userId, carrierExtIdInput);
        if (!carrierExtId) {
          return jsonResponse({ error: "carrier_not_found" }, { status: 403 });
        }

        // Деактивируем предыдущие, чтобы активной осталась одна.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("carrier_signature_assets") as any)
          .update({ is_active: false })
          .eq("carrier_ext_id", carrierExtId)
          .eq("is_active", true);

        const ins = await sb
          .from("carrier_signature_assets")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({
            carrier_ext_id: carrierExtId,
            uploaded_by: auth.userId,
            stamp_bbox: stampBbox,
            signature_bbox: signatureBbox,
            bg_removal: bgRemoval,
            consent_confirmed_at: new Date().toISOString(),
            is_active: true,
          } as any)
          .select("id")
          .maybeSingle();
        if (ins.error || !ins.data) {
          console.error("[signature-assets] insert", ins.error);
          return jsonResponse({ error: ins.error?.message ?? "insert_failed" }, { status: 500 });
        }
        const assetId = ins.data.id as string;
        const prefix = `${carrierExtId}/signatures/${assetId}`;

        const stampPath = `${prefix}/stamp.png`;
        const signaturePath = `${prefix}/signature.png`;
        const sourcePath = source ? `${prefix}/source.${extOf(source.name) || "bin"}` : null;

        const up1 = await sb.storage.from(BUCKET).upload(stampPath, stamp, { upsert: true, contentType: "image/png" });
        const up2 = await sb.storage.from(BUCKET).upload(signaturePath, signature, { upsert: true, contentType: "image/png" });
        if (up1.error || up2.error) {
          console.error("[signature-assets] upload", up1.error || up2.error);
          return jsonResponse({ error: "upload_failed" }, { status: 500 });
        }
        if (source && sourcePath) {
          await sb.storage.from(BUCKET).upload(sourcePath, source, { upsert: true, contentType: source.type || "application/octet-stream" });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("carrier_signature_assets") as any)
          .update({
            stamp_file_path: stampPath,
            signature_file_path: signaturePath,
            source_file_path: sourcePath,
          })
          .eq("id", assetId);

        return jsonResponse({ ok: true, id: assetId });
      },
    },
  },
});

function safeJson(s: string | null): unknown {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
function extOf(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : null;
}
