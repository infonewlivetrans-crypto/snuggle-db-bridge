import { createFileRoute } from "@tanstack/react-router";
import { jsonResponse } from "@/server/api-helpers.server";
import {
  CARRIER_OFFER_FULL_TEXT,
  CARRIER_OFFER_TITLE,
  CARRIER_OFFER_VERSION,
  CARRIER_OFFER_SHORT_TEXT,
  CARRIER_OFFER_MINIMUM_FEE,
  CARRIER_OFFER_DEFAULT_RATE,
} from "@/lib/contracts/carrier-offer";

// Публичный read-only endpoint: текст и метаданные текущей версии договора-оферты.
// Доступен анонимно — это публичный документ, а персональные данные не возвращаются.

export const Route = createFileRoute("/api/dispatcher/contracts/carrier-offer")({
  server: {
    handlers: {
      GET: async () => {
        return jsonResponse({
          ok: true,
          contract_type: "carrier_digital_services_offer",
          version: CARRIER_OFFER_VERSION,
          title: CARRIER_OFFER_TITLE,
          short_text: CARRIER_OFFER_SHORT_TEXT,
          full_text: CARRIER_OFFER_FULL_TEXT,
          default_commission_rate: CARRIER_OFFER_DEFAULT_RATE,
          minimum_fee: CARRIER_OFFER_MINIMUM_FEE,
        });
      },
    },
  },
});
