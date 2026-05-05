import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";
import {
  detectDuplicatesServer,
  importParsedServer,
  type ImportEntity,
  type ParseResult,
  type ImportSource,
  type DuplicateAction,
} from "@/server/data-import.server";

export const Route = createFileRoute("/api/data-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;
        let body: {
          op: "duplicates" | "import";
          entity: ImportEntity;
          parsed: ParseResult;
          source?: ImportSource;
          fileName?: string | null;
          fileFormat?: string | null;
          duplicateAction?: DuplicateAction;
        };
        try { body = await request.json(); }
        catch { return jsonResponse({ error: "Некорректный JSON" }, { status: 400 }); }
        if (!body?.op || !body.entity || !body.parsed)
          return jsonResponse({ error: "Неверные параметры" }, { status: 400 });
        try {
          if (body.op === "duplicates") {
            await detectDuplicatesServer(auth.client, body.entity, body.parsed.rows);
            const duplicateRows = body.parsed.rows.filter((r) => r.duplicate).length;
            return jsonResponse({ rows: body.parsed.rows, duplicateRows });
          }
          const result = await importParsedServer(
            auth.client,
            body.entity,
            body.parsed,
            body.source ?? "excel",
            {
              fileName: body.fileName ?? null,
              fileFormat: body.fileFormat ?? "xlsx",
              duplicateAction: body.duplicateAction ?? "skip",
              importedBy: auth.userId,
            },
          );
          return jsonResponse(result);
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
