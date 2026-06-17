import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse, requireAuth } from "@/server/api-helpers.server";

// GET /api/carrier/onboarding-status — серверная проверка готовности
// перевозчика к появлению машины на карте AI-диспетчера.
//
// Возвращает набор флагов + список того, что ещё нужно дозаполнить.
// Использует ту же RLS-сессию, что и /api/carrier/me.

export const Route = createFileRoute("/api/carrier/onboarding-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireAuth(request);
        if (auth instanceof Response) return auth;

        const client = auth.client;

        // 1) Связь user → carrier (через RPC, как /api/carrier/me).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: me } = await (client.rpc as any)("carrier_me_get");
        const carrier = (me?.carrier ?? null) as null | {
          id: string;
          company_name: string | null;
          inn: string | null;
          phone: string | null;
          city: string | null;
        };
        const ext = (me?.ext ?? null) as null | {
          id?: string;
          commission_agreed: boolean | null;
        };

        if (!carrier || !ext?.id) {
          return jsonResponse({
            ok: true,
            linked: false,
            canAppearOnMap: false,
            carrierComplete: false,
            requisitesComplete: false,
            documentsComplete: false,
            hasDriver: false,
            driverComplete: false,
            driverDocumentsComplete: false,
            hasVehicle: false,
            vehicleComplete: false,
            vehicleDocumentsComplete: false,
            hasVehicleDriverBinding: false,
            hasLocation: false,
            missing: ["link_carrier"],
            nextStep: "company",
          });
        }

        // 2) Расширенные данные перевозчика — для проверки реквизитов/ATI.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: carrierExt } = await (client.from("dispatcher_carrier_ext") as any)
          .select(
            "id, name, inn, phone, city, ati_code, taxation_type, bank_name, bik, settlement_account, commission_agreed, onboarding_step, onboarding_completed_at",
          )
          .eq("id", ext.id)
          .maybeSingle();

        const ce = (carrierExt ?? {}) as Record<string, unknown>;
        const carrierComplete =
          !!carrier.company_name &&
          !!carrier.inn &&
          !!carrier.phone &&
          !!carrier.city;
        const requisitesComplete =
          !!ce.taxation_type &&
          !!ce.bank_name &&
          !!ce.bik &&
          !!ce.settlement_account;
        const commissionAgreed = ce.commission_agreed === true;

        // 3) Документы перевозчика.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count: carrierDocsCount } = await (client.from("dispatcher_documents") as any)
          .select("id", { count: "exact", head: true })
          .eq("owner_type", "carrier")
          .eq("owner_id", ext.id);
        const documentsComplete = (carrierDocsCount ?? 0) > 0;

        // 4) Водители перевозчика.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: drivers } = await (client.from("dispatcher_driver_ext") as any)
          .select("id, full_name, phone, license_number, city")
          .eq("dispatcher_carrier_ext_id", ext.id);
        const drvList = (drivers ?? []) as Array<Record<string, unknown>>;
        const hasDriver = drvList.length > 0;
        const driverComplete = drvList.some(
          (d) => !!d.full_name && !!d.phone,
        );

        let driverDocumentsComplete = false;
        if (hasDriver) {
          const driverIds = drvList.map((d) => d.id as string);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: drvDocs } = await (client.from("dispatcher_documents") as any)
            .select("owner_id")
            .eq("owner_type", "driver")
            .in("owner_id", driverIds);
          const docsOwners = new Set(
            ((drvDocs ?? []) as Array<{ owner_id: string }>).map((d) => d.owner_id),
          );
          driverDocumentsComplete = driverIds.some((id) => docsOwners.has(id));
        }

        // 5) Транспорт перевозчика.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: vehicles } = await (client.from("dispatcher_vehicle_ext") as any)
          .select(
            "id, vehicle_kind, body_type, payload_kg, dispatcher_status, dispatcher_driver_ext_id, assigned_driver_ext_id, current_city, current_lat, current_lng, ready_date",
          )
          .eq("dispatcher_carrier_ext_id", ext.id);
        const vehList = (vehicles ?? []) as Array<Record<string, unknown>>;
        const hasVehicle = vehList.length > 0;
        const vehicleComplete = vehList.some(
          (v) => !!v.body_type && !!v.payload_kg,
        );
        const hasVehicleDriverBinding = vehList.some(
          (v) => !!v.dispatcher_driver_ext_id || !!v.assigned_driver_ext_id,
        );
        const hasLocation = vehList.some(
          (v) => !!v.current_city || (v.current_lat != null && v.current_lng != null),
        );

        let vehicleDocumentsComplete = false;
        if (hasVehicle) {
          const vehIds = vehList.map((v) => v.id as string);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: vDocs } = await (client.from("dispatcher_documents") as any)
            .select("owner_id")
            .eq("owner_type", "vehicle")
            .in("owner_id", vehIds);
          const vOwners = new Set(
            ((vDocs ?? []) as Array<{ owner_id: string }>).map((d) => d.owner_id),
          );
          vehicleDocumentsComplete = vehIds.some((id) => vOwners.has(id));
        }

        const missing: string[] = [];
        if (!carrierComplete) missing.push("company");
        if (!commissionAgreed) missing.push("commission");
        if (!requisitesComplete) missing.push("requisites");
        if (!documentsComplete) missing.push("carrier_documents");
        if (!hasDriver) missing.push("driver");
        else if (!driverComplete) missing.push("driver_data");
        if (!driverDocumentsComplete) missing.push("driver_documents");
        if (!hasVehicle) missing.push("vehicle");
        else if (!vehicleComplete) missing.push("vehicle_data");
        if (!vehicleDocumentsComplete) missing.push("vehicle_documents");
        if (!hasVehicleDriverBinding) missing.push("vehicle_driver_binding");
        if (!hasLocation) missing.push("location");

        const canAppearOnMap =
          carrierComplete &&
          commissionAgreed &&
          hasDriver &&
          driverComplete &&
          hasVehicle &&
          vehicleComplete &&
          hasVehicleDriverBinding &&
          hasLocation;

        const order = [
          "company",
          "commission",
          "requisites",
          "carrier_documents",
          "driver",
          "driver_data",
          "driver_documents",
          "vehicle",
          "vehicle_data",
          "vehicle_documents",
          "vehicle_driver_binding",
          "location",
        ];
        const nextStep = missing.find((m) => order.includes(m)) ?? "done";
        const savedStep = (ce.onboarding_step as string | null) ?? null;
        const completedAt = (ce.onboarding_completed_at as string | null) ?? null;
        const currentStep = canAppearOnMap ? "done" : (savedStep && missing.includes(savedStep) ? savedStep : nextStep);

        // Авто-проставление завершения, если всё готово и ещё не отмечено.
        if (canAppearOnMap && !completedAt) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (client.from("dispatcher_carrier_ext") as any)
            .update({ onboarding_completed_at: new Date().toISOString(), onboarding_step: "done" })
            .eq("id", ext.id);
        }

        return jsonResponse({
          ok: true,
          linked: true,
          carrierComplete,
          commissionAgreed,
          requisitesComplete,
          documentsComplete,
          hasDriver,
          driverComplete,
          driverDocumentsComplete,
          hasVehicle,
          vehicleComplete,
          vehicleDocumentsComplete,
          hasVehicleDriverBinding,
          hasLocation,
          canAppearOnMap,
          missing,
          nextStep,
          currentStep,
          completedAt,
          counts: {
            drivers: drvList.length,
            vehicles: vehList.length,
            carrierDocuments: carrierDocsCount ?? 0,
          },
        });
      },
    },
  },
});
