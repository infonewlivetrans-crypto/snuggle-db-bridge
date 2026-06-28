// Описание snapshot экспедитора, который фиксируется в сценарии и документах.
// Используется и в UI, и на сервере.
import type { ForwarderPossessionMode } from "@/lib/edo/scenarios";

export interface ForwarderSnapshot {
  forwarder_id: string;
  forwarder_source: "dispatcher_forwarder_ext";
  forwarder_name: string | null;
  forwarder_inn: string | null;
  forwarder_ogrn: string | null;
  forwarder_legal_form: string | null;
  forwarder_phone: string | null;
  forwarder_email: string | null;
  forwarder_possession_mode: ForwarderPossessionMode | null;
  has_okved_5229: boolean;
  okved_codes: string[];
  goslog_status: string | null;
  goslog_registry_number: string | null;
  goslog_application_number: string | null;
  goslog_checked_at: string | null;
  goslog_source_url: string | null;
  snapshot_created_at: string;
}

export interface ForwarderPublicRow {
  id: string;
  company_name: string;
  inn: string | null;
  ogrn: string | null;
  legal_form: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  city: string | null;
  okved_codes: string[];
  has_okved_5229: boolean;
  status: string;
}

export interface ForwarderGoslogPublicRow {
  goslog_status: string;
  registry_number: string | null;
  application_number: string | null;
  application_date: string | null;
  included_at: string | null;
  source_url: string | null;
  verified_at: string | null;
  verification_comment: string | null;
  has_okved_5229?: boolean;
  okved_codes?: string[];
}

export interface ForwarderPublicCard {
  forwarder: ForwarderPublicRow;
  goslog: ForwarderGoslogPublicRow | null;
}

export function isGoslogConfirmed(status: string | null | undefined): boolean {
  return status === "included" || status === "manually_verified";
}
