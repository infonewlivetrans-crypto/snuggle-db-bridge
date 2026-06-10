import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { jsonResponse, requireAnyRole } from "@/server/api-helpers.server";
import { parseIncomingFreightText } from "@/lib/dispatcher/freight-parse";
import { FREIGHT_DOC_TYPES } from "@/lib/dispatcher/documents";

const ALLOWED_ROLES = ["admin", "dispatcher"];

const attachmentSchema = z.object({
  file_name: z.string().trim().max(255).optional().nullable(),
  file_path: z.string().trim().max(1024).optional().nullable(),
  file_url: z.string().trim().max(1024).optional().nullable(),
  document_type: z
    .enum(FREIGHT_DOC_TYPES)
    .optional()
    .default("email_attachment"),
  comment: z.string().trim().max(2000).optional().nullable(),
});

const bodySchema = z.object({
  source_email_from: z.string().trim().max(255).optional().nullable(),
  source_email_subject: z.string().trim().max(500).optional().nullable(),
  source_email_body: z.string().trim().max(50_000).optional().nullable(),
  source_received_at: z.string().datetime().optional().nullable(),
  customer_name: z.string().trim().max(255).optional().nullable(),
  customer_email: z.string().trim().email().max(255).optional().nullable(),
  customer_phone: z.string().trim().max(50).optional().nullable(),
  raw_text: z.string().trim().max(100_000).optional().nullable(),
  extracted_text: z.string().trim().max(100_000).optional().nullable(),
  attachments: z.array(attachmentSchema).max(20).optional().default([]),
});

export const Route = createFileRoute("/api/dispatcher/freights/from-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAnyRole(request, ALLOWED_ROLES);
        if (auth instanceof Response) return auth;
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse({ error: "invalid JSON" }, { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          return jsonResponse(
            {
              error: `validation_failed: ${first?.path?.join(".") ?? "?"} — ${first?.message ?? ""}`,
            },
            { status: 400 },
          );
        }
        const d = parsed.data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const client = auth.client as any;

        // Парсинг текста: extracted_text → raw_text → source_email_body
        const sourceText =
          d.extracted_text || d.raw_text || d.source_email_body || "";
        const parseRes = parseIncomingFreightText(sourceText);
        const f = parseRes.fields;

        const parse_status: "draft" | "parsed" | "needs_review" = !sourceText
          ? "draft"
          : parseRes.missing.length === 0 && parseRes.has_any
            ? "parsed"
            : parseRes.has_any
              ? "needs_review"
              : "draft";

        const title =
          d.source_email_subject ||
          f.cargo_name ||
          [f.loading_city, f.unloading_city].filter(Boolean).join(" → ") ||
          "Заявка от заказчика";

        const freightInsert: Record<string, unknown> = {
          title,
          source_type: "email",
          source_email_from: d.source_email_from ?? null,
          source_email_subject: d.source_email_subject ?? null,
          source_email_body: d.source_email_body ?? null,
          source_received_at: d.source_received_at ?? null,
          customer_name: d.customer_name ?? f.contact_name ?? null,
          customer_email: d.customer_email ?? f.contact_email ?? null,
          customer_phone: d.customer_phone ?? f.contact_phone ?? null,
          raw_text: d.raw_text ?? null,
          extracted_text: d.extracted_text ?? null,
          parse_status,
          loading_city: f.loading_city,
          unloading_city: f.unloading_city,
          loading_date: f.loading_date,
          unloading_date: f.unloading_date,
          cargo_name: f.cargo_name,
          weight_kg: f.weight_kg,
          volume_m3: f.volume_m3,
          body_type: f.body_type,
          load_methods: f.load_methods.length ? f.load_methods : null,
          rate: f.rate,
          payment_type: f.payment_type,
          payment_delay_days: f.payment_delay_days,
          contact_name: d.customer_name ?? f.contact_name ?? null,
          contact_phone: d.customer_phone ?? f.contact_phone ?? null,
          source: "email",
          comment: f.comment,
          dispatcher_status: "new",
          freight_kind: "main",
          created_by: auth.userId,
        };

        const ins = await client
          .from("dispatcher_freights")
          .insert(freightInsert as never)
          .select("id, title, parse_status")
          .single();
        if (ins.error)
          return jsonResponse({ error: ins.error.message }, { status: 500 });
        const freightId = (ins.data as { id: string }).id;

        // Вложения → dispatcher_documents (owner_type=freight)
        const docsToInsert = (d.attachments ?? [])
          .filter((a) => a.file_path || a.file_url || a.file_name)
          .map((a) => ({
            owner_type: "freight",
            owner_id: freightId,
            document_type: a.document_type ?? "email_attachment",
            title: a.file_name ?? null,
            file_path: a.file_path ?? a.file_url ?? null,
            file_name: a.file_name ?? null,
            comment: a.comment ?? null,
            document_status: "uploaded",
            uploaded_by_type: "dispatcher",
            uploaded_by: auth.userId,
          }));

        let createdDocs: unknown[] = [];
        if (docsToInsert.length > 0) {
          const dr = await client
            .from("dispatcher_documents")
            .insert(docsToInsert as never)
            .select("id, document_type, file_name, file_path");
          if (dr.error)
            return jsonResponse(
              { error: `documents: ${dr.error.message}` },
              { status: 500 },
            );
          createdDocs = dr.data ?? [];

          // Первый PDF-вложение становится "source_document_id".
          const primary =
            (dr.data as Array<{ id: string; document_type: string }> | null)?.find(
              (x) =>
                x.document_type === "customer_request_pdf" ||
                x.document_type === "customer_contract_pdf",
            ) ?? null;
          await client
            .from("dispatcher_freights")
            .update({
              source_document_id: primary?.id ?? null,
              source_document_count: createdDocs.length,
            } as never)
            .eq("id", freightId);
        }

        return jsonResponse(
          {
            row: ins.data,
            documents: createdDocs,
            parse_status,
            missing_fields: parseRes.missing,
          },
          { status: 201 },
        );
      },
    },
  },
});
