-- ============================================================
-- Lovable Cloud → Production schema sync
-- Идемпотентный SQL: безопасно запускать несколько раз.
-- Создаёт недостающие таблицы, колонки, типы, политики RLS
-- и базовые system_settings.
-- ============================================================
SET client_min_messages = warning;
SET search_path = public, pg_catalog;
BEGIN;

-- 1) Расширения
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2) ENUM types
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin','director','logist','manager','warehouse','supply','driver','carrier');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='body_type') THEN
    CREATE TYPE public.body_type AS ENUM ('tent','isotherm','refrigerator','flatbed','closed_van','manipulator','tipper','container','car_carrier','other','gazelle','sideboard','long_vehicle');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='carrier_docs_status') THEN
    CREATE TYPE public.carrier_docs_status AS ENUM ('awaiting','uploaded','needs_fix','accepted');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='carrier_payment_status') THEN
    CREATE TYPE public.carrier_payment_status AS ENUM ('not_calculated','calculated','review','approved','to_pay');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='carrier_payout_status') THEN
    CREATE TYPE public.carrier_payout_status AS ENUM ('to_pay','scheduled','paid','partially_paid','cancelled');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='carrier_type') THEN
    CREATE TYPE public.carrier_type AS ENUM ('self_employed','ip','ooo');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='carrier_verification_status') THEN
    CREATE TYPE public.carrier_verification_status AS ENUM ('new','in_review','approved','rejected');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='client_kind') THEN
    CREATE TYPE public.client_kind AS ENUM ('individual','organization','shop','factory','snt','dacha');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='company_type') THEN
    CREATE TYPE public.company_type AS ENUM ('shipper','carrier','mixed');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='delivery_cost_source') THEN
    CREATE TYPE public.delivery_cost_source AS ENUM ('auto','manual','tariff');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='delivery_point_status') THEN
    CREATE TYPE public.delivery_point_status AS ENUM ('waiting','en_route','arrived','unloading','delivered','not_delivered','returned_to_warehouse');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='delivery_point_undelivered_reason') THEN
    CREATE TYPE public.delivery_point_undelivered_reason AS ENUM ('client_absent','client_no_answer','no_payment','no_qr','client_refused','no_unloading','defective','other','damage','wrong_address');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='delivery_route_status') THEN
    CREATE TYPE public.delivery_route_status AS ENUM ('draft','formed','issued','in_progress','completed');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='dock_slot_kind') THEN
    CREATE TYPE public.dock_slot_kind AS ENUM ('shipment','inbound_factory','inbound_return');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='dock_slot_status') THEN
    CREATE TYPE public.dock_slot_status AS ENUM ('planned','arrived','loading','loaded','done','cancelled');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='eta_risk_level') THEN
    CREATE TYPE public.eta_risk_level AS ENUM ('on_time','tight','late','unknown');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='idle_reason') THEN
    CREATE TYPE public.idle_reason AS ENUM ('client_absent','client_no_answer','no_unloaders','no_access','no_payment','no_qr','client_asks_wait','other');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='order_status') THEN
    CREATE TYPE public.order_status AS ENUM ('new','in_progress','delivering','completed','cancelled','delivered','not_delivered','defective','awaiting_resend','ready_for_delivery','awaiting_return','return_accepted','excluded_from_route');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='payment_status') THEN
    CREATE TYPE public.payment_status AS ENUM ('not_paid','partial','paid','refunded');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='payment_type') THEN
    CREATE TYPE public.payment_type AS ENUM ('cash','card','online','qr');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='point_status') THEN
    CREATE TYPE public.point_status AS ENUM ('pending','arrived','completed','failed','returned_to_warehouse','defective','no_payment','no_qr','client_no_answer','client_absent','client_refused','no_unloading','problem');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='problem_urgency') THEN
    CREATE TYPE public.problem_urgency AS ENUM ('normal','urgent');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='route_point_photo_kind') THEN
    CREATE TYPE public.route_point_photo_kind AS ENUM ('qr','signed_docs','payment','problem','unloading_place');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='route_status') THEN
    CREATE TYPE public.route_status AS ENUM ('planned','in_progress','completed','cancelled');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='supply_request_priority') THEN
    CREATE TYPE public.supply_request_priority AS ENUM ('low','normal','high','urgent');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='supply_request_source_type') THEN
    CREATE TYPE public.supply_request_source_type AS ENUM ('factory','warehouse','supplier');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='supply_request_status') THEN
    CREATE TYPE public.supply_request_status AS ENUM ('draft','pending','confirmed','in_transit','received','cancelled');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='tariff_kind') THEN
    CREATE TYPE public.tariff_kind AS ENUM ('fixed_city','fixed_zone','fixed_direction','per_km_round','per_km_last','per_point','combo','percent_goods','manual');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='transport_request_priority') THEN
    CREATE TYPE public.transport_request_priority AS ENUM ('low','medium','high','urgent');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='transport_request_status') THEN
    CREATE TYPE public.transport_request_status AS ENUM ('draft','ready_for_planning','needs_review','confirmed','in_progress','completed','cancelled');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='transport_request_type') THEN
    CREATE TYPE public.transport_request_type AS ENUM ('client_delivery','warehouse_transfer','factory_to_warehouse');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='trip_stage') THEN
    CREATE TYPE public.trip_stage AS ENUM ('not_started','arrived_loading','loaded','departed','in_progress','finished','cash_returned');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='warehouse_staff_role') THEN
    CREATE TYPE public.warehouse_staff_role AS ENUM ('manager','storekeeper');
  END IF;
END $$;

-- 3) Tables (CREATE IF NOT EXISTS) + missing columns

-- ---- table: app_versions ----
CREATE TABLE IF NOT EXISTS public."app_versions" ();
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "platform" text;
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "current_version" text;
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "minimum_required_version" text;
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "force_update" boolean DEFAULT false;
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "update_message" text;
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "app_store_url" text;
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "play_market_url" text;
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "release_notes" text;
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "released_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."app_versions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='app_versions_pkey') THEN
    ALTER TABLE public."app_versions" ADD CONSTRAINT app_versions_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."app_versions" ENABLE ROW LEVEL SECURITY;

-- ---- table: audit_log ----
CREATE TABLE IF NOT EXISTS public."audit_log" ();
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "user_name" text;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "user_role" text;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "section" text;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "action" text;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "object_type" text;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "object_id" text;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "object_label" text;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "old_value" jsonb;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "new_value" jsonb;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE public."audit_log" ADD COLUMN IF NOT EXISTS "details" jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_log_pkey') THEN
    ALTER TABLE public."audit_log" ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;

-- ---- table: backups ----
CREATE TABLE IF NOT EXISTS public."backups" ();
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "finished_at" timestamp with time zone;
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'running'::text;
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "size_bytes" bigint;
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "storage_path" text;
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "triggered_by" uuid;
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "triggered_by_name" text;
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "trigger_kind" text DEFAULT 'manual'::text;
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "error_message" text;
ALTER TABLE public."backups" ADD COLUMN IF NOT EXISTS "tables" jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='backups_pkey') THEN
    ALTER TABLE public."backups" ADD CONSTRAINT backups_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."backups" ENABLE ROW LEVEL SECURITY;

-- ---- table: carrier_documents ----
CREATE TABLE IF NOT EXISTS public."carrier_documents" ();
ALTER TABLE public."carrier_documents" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."carrier_documents" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."carrier_documents" ADD COLUMN IF NOT EXISTS "driver_id" uuid;
ALTER TABLE public."carrier_documents" ADD COLUMN IF NOT EXISTS "vehicle_id" uuid;
ALTER TABLE public."carrier_documents" ADD COLUMN IF NOT EXISTS "doc_type" text;
ALTER TABLE public."carrier_documents" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE public."carrier_documents" ADD COLUMN IF NOT EXISTS "file_url" text;
ALTER TABLE public."carrier_documents" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='carrier_documents_pkey') THEN
    ALTER TABLE public."carrier_documents" ADD CONSTRAINT carrier_documents_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."carrier_documents" ENABLE ROW LEVEL SECURITY;

-- ---- table: carrier_invites ----
CREATE TABLE IF NOT EXISTS public."carrier_invites" ();
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "token" text;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "invite_type" text DEFAULT 'carrier'::text;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "note" text;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active'::text;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "used_at" timestamp with time zone;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "used_carrier_id" uuid;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "used_driver_id" uuid;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."carrier_invites" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='carrier_invites_pkey') THEN
    ALTER TABLE public."carrier_invites" ADD CONSTRAINT carrier_invites_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."carrier_invites" ENABLE ROW LEVEL SECURITY;

-- ---- table: carriers ----
CREATE TABLE IF NOT EXISTS public."carriers" ();
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "carrier_type" public.carrier_type;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "company_name" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "inn" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "ogrn" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "city" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "contact_person" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "bank_name" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "bank_account" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "bank_bik" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "bank_corr_account" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "verification_status" public.carrier_verification_status DEFAULT 'new'::carrier_verification_status;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "verification_comment" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "portal_token" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."carriers" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='carriers_pkey') THEN
    ALTER TABLE public."carriers" ADD CONSTRAINT carriers_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."carriers" ENABLE ROW LEVEL SECURITY;

-- ---- table: clients ----
CREATE TABLE IF NOT EXISTS public."clients" ();
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "inn" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "manager_name" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "manager_phone" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "company_id" uuid;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "phone_alt" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "latitude" numeric;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "longitude" numeric;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "working_hours" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "works_weekends" boolean DEFAULT false;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "client_type" public.client_kind;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "access_notes" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "unloading_notes" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "preferred_delivery_time" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "driver_instructions" text;
ALTER TABLE public."clients" ADD COLUMN IF NOT EXISTS "extra_attrs" jsonb DEFAULT '{}'::jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='clients_pkey') THEN
    ALTER TABLE public."clients" ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."clients" ENABLE ROW LEVEL SECURITY;

-- ---- table: companies ----
CREATE TABLE IF NOT EXISTS public."companies" ();
ALTER TABLE public."companies" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."companies" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."companies" ADD COLUMN IF NOT EXISTS "company_type" public.company_type DEFAULT 'mixed'::company_type;
ALTER TABLE public."companies" ADD COLUMN IF NOT EXISTS "inn" text;
ALTER TABLE public."companies" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE public."companies" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."companies" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='companies_pkey') THEN
    ALTER TABLE public."companies" ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."companies" ENABLE ROW LEVEL SECURITY;

-- ---- table: company_members ----
CREATE TABLE IF NOT EXISTS public."company_members" ();
ALTER TABLE public."company_members" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."company_members" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."company_members" ADD COLUMN IF NOT EXISTS "company_id" uuid;
ALTER TABLE public."company_members" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false;
ALTER TABLE public."company_members" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='company_members_pkey') THEN
    ALTER TABLE public."company_members" ADD CONSTRAINT company_members_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."company_members" ENABLE ROW LEVEL SECURITY;

-- ---- table: delivery_reports ----
CREATE TABLE IF NOT EXISTS public."delivery_reports" ();
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "route_point_id" uuid;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "outcome" text;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "driver_name" text;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "cash_received" boolean DEFAULT false;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "qr_received" boolean DEFAULT false;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "requires_resend" boolean DEFAULT false;
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."delivery_reports" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='delivery_reports_pkey') THEN
    ALTER TABLE public."delivery_reports" ADD CONSTRAINT delivery_reports_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."delivery_reports" ENABLE ROW LEVEL SECURITY;

-- ---- table: delivery_routes ----
CREATE TABLE IF NOT EXISTS public."delivery_routes" ();
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "route_number" text;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "route_date" date DEFAULT CURRENT_DATE;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "source_request_id" uuid;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "source_warehouse_id" uuid;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "status" public.delivery_route_status DEFAULT 'formed'::delivery_route_status;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "created_by" text;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "assigned_driver" text;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "assigned_vehicle" text;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "driver_access_token" text;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "driver_access_created_at" timestamp with time zone;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "driver_access_created_by" text;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "driver_access_enabled" boolean DEFAULT true;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "last_driver_lat" numeric;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "last_driver_lng" numeric;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "last_driver_location_at" timestamp with time zone;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "company_id" uuid;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "current_stage" public.trip_stage DEFAULT 'not_started'::trip_stage;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "arrived_loading_at" timestamp with time zone;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "loaded_at" timestamp with time zone;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "departed_at" timestamp with time zone;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "finished_at" timestamp with time zone;
ALTER TABLE public."delivery_routes" ADD COLUMN IF NOT EXISTS "cash_returned_at" timestamp with time zone;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='delivery_routes_pkey') THEN
    ALTER TABLE public."delivery_routes" ADD CONSTRAINT delivery_routes_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."delivery_routes" ENABLE ROW LEVEL SECURITY;

-- ---- table: delivery_tariffs ----
CREATE TABLE IF NOT EXISTS public."delivery_tariffs" ();
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "kind" public.tariff_kind;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "city" text;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "zone" text;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "destination_city" text;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "locality" text;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "radius_km" numeric;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "fixed_price" numeric;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "price_per_km" numeric;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "price_per_point" numeric;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "base_price" numeric;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "goods_percent" numeric;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "min_price" numeric;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "valid_from" date;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "valid_to" date;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "priority" integer DEFAULT 100;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."delivery_tariffs" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='delivery_tariffs_pkey') THEN
    ALTER TABLE public."delivery_tariffs" ADD CONSTRAINT delivery_tariffs_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."delivery_tariffs" ENABLE ROW LEVEL SECURITY;

-- ---- table: dock_loaded_items ----
CREATE TABLE IF NOT EXISTS public."dock_loaded_items" ();
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "delivery_route_id" uuid;
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "nomenclature" text;
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "unit" text;
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "qty_loaded" numeric DEFAULT 0;
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "loaded_by" text;
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."dock_loaded_items" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='dock_loaded_items_pkey') THEN
    ALTER TABLE public."dock_loaded_items" ADD CONSTRAINT dock_loaded_items_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."dock_loaded_items" ENABLE ROW LEVEL SECURITY;

-- ---- table: driver_locations ----
CREATE TABLE IF NOT EXISTS public."driver_locations" ();
ALTER TABLE public."driver_locations" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."driver_locations" ADD COLUMN IF NOT EXISTS "delivery_route_id" uuid;
ALTER TABLE public."driver_locations" ADD COLUMN IF NOT EXISTS "driver_name" text;
ALTER TABLE public."driver_locations" ADD COLUMN IF NOT EXISTS "latitude" numeric;
ALTER TABLE public."driver_locations" ADD COLUMN IF NOT EXISTS "longitude" numeric;
ALTER TABLE public."driver_locations" ADD COLUMN IF NOT EXISTS "accuracy" numeric;
ALTER TABLE public."driver_locations" ADD COLUMN IF NOT EXISTS "captured_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."driver_locations" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."driver_locations" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='driver_locations_pkey') THEN
    ALTER TABLE public."driver_locations" ADD CONSTRAINT driver_locations_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."driver_locations" ENABLE ROW LEVEL SECURITY;

-- ---- table: drivers ----
CREATE TABLE IF NOT EXISTS public."drivers" ();
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "passport_series" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "passport_number" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "passport_issued_by" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "passport_issued_date" date;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "license_number" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "license_issued_date" date;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "license_expires_date" date;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "license_categories" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "photo_url" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "portal_token" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."drivers" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='drivers_pkey') THEN
    ALTER TABLE public."drivers" ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."drivers" ENABLE ROW LEVEL SECURITY;

-- ---- table: external_refs ----
CREATE TABLE IF NOT EXISTS public."external_refs" ();
ALTER TABLE public."external_refs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."external_refs" ADD COLUMN IF NOT EXISTS "entity" text;
ALTER TABLE public."external_refs" ADD COLUMN IF NOT EXISTS "local_id" uuid;
ALTER TABLE public."external_refs" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."external_refs" ADD COLUMN IF NOT EXISTS "external_system" text DEFAULT '1c'::text;
ALTER TABLE public."external_refs" ADD COLUMN IF NOT EXISTS "payload" jsonb;
ALTER TABLE public."external_refs" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."external_refs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='external_refs_pkey') THEN
    ALTER TABLE public."external_refs" ADD CONSTRAINT external_refs_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."external_refs" ENABLE ROW LEVEL SECURITY;

-- ---- table: feedback ----
CREATE TABLE IF NOT EXISTS public."feedback" ();
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "user_name" text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "role" text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "route_label" text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "good" text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "bad" text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "broken" text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "unclear" text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "needed" text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "rating_convenience" smallint;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "rating_speed" smallint;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "rating_stability" smallint;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "severity" text DEFAULT 'normal'::text;
ALTER TABLE public."feedback" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='feedback_pkey') THEN
    ALTER TABLE public."feedback" ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."feedback" ENABLE ROW LEVEL SECURITY;

-- ---- table: import_log_rows ----
CREATE TABLE IF NOT EXISTS public."import_log_rows" ();
ALTER TABLE public."import_log_rows" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."import_log_rows" ADD COLUMN IF NOT EXISTS "import_log_id" uuid;
ALTER TABLE public."import_log_rows" ADD COLUMN IF NOT EXISTS "row_number" integer;
ALTER TABLE public."import_log_rows" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'inserted'::text;
ALTER TABLE public."import_log_rows" ADD COLUMN IF NOT EXISTS "error_message" text;
ALTER TABLE public."import_log_rows" ADD COLUMN IF NOT EXISTS "raw_data" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."import_log_rows" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."import_log_rows" ADD COLUMN IF NOT EXISTS "matched_existing_id" text;
ALTER TABLE public."import_log_rows" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='import_log_rows_pkey') THEN
    ALTER TABLE public."import_log_rows" ADD CONSTRAINT import_log_rows_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."import_log_rows" ENABLE ROW LEVEL SECURITY;

-- ---- table: import_logs ----
CREATE TABLE IF NOT EXISTS public."import_logs" ();
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "entity" text;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "file_name" text;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'excel'::text;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "imported_by" text;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "total_rows" integer DEFAULT 0;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "inserted_rows" integer DEFAULT 0;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "failed_rows" integer DEFAULT 0;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'loaded'::text;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "duplicate_rows" integer DEFAULT 0;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "duplicate_action" text DEFAULT 'skip'::text;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "updated_rows" integer DEFAULT 0;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "skipped_rows" integer DEFAULT 0;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "file_format" text DEFAULT 'xlsx'::text;
ALTER TABLE public."import_logs" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='import_logs_pkey') THEN
    ALTER TABLE public."import_logs" ADD CONSTRAINT import_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."import_logs" ENABLE ROW LEVEL SECURITY;

-- ---- table: inbound_shipment_items ----
CREATE TABLE IF NOT EXISTS public."inbound_shipment_items" ();
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "shipment_id" uuid;
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "product_name" text;
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "sku" text;
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "unit" text;
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "qty_expected" numeric DEFAULT 0;
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "qty_received" numeric;
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."inbound_shipment_items" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inbound_shipment_items_pkey') THEN
    ALTER TABLE public."inbound_shipment_items" ADD CONSTRAINT inbound_shipment_items_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."inbound_shipment_items" ENABLE ROW LEVEL SECURITY;

-- ---- table: inbound_shipments ----
CREATE TABLE IF NOT EXISTS public."inbound_shipments" ();
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "shipment_number" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "source_type" text DEFAULT 'factory'::text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "source_name" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "source_warehouse_id" uuid;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "destination_warehouse_id" uuid;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "expected_at" timestamp with time zone;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "arrived_at" timestamp with time zone;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "receiving_started_at" timestamp with time zone;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "accepted_by" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "vehicle_plate" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "driver_name" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "driver_phone" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'expected'::text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "warehouse_comment" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "problem_reason" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "problem_comment" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "problem_photo_url" text;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "docs_photo_urls" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "supply_request_id" uuid;
ALTER TABLE public."inbound_shipments" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='inbound_shipments_pkey') THEN
    ALTER TABLE public."inbound_shipments" ADD CONSTRAINT inbound_shipments_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."inbound_shipments" ENABLE ROW LEVEL SECURITY;

-- ---- table: invite_tokens ----
CREATE TABLE IF NOT EXISTS public."invite_tokens" ();
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "token" text;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "role" public.app_role;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "driver_id" uuid;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "manager_name" text;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
ALTER TABLE public."invite_tokens" ADD COLUMN IF NOT EXISTS "manager_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invite_tokens_pkey') THEN
    ALTER TABLE public."invite_tokens" ADD CONSTRAINT invite_tokens_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."invite_tokens" ENABLE ROW LEVEL SECURITY;

-- ---- table: managers ----
CREATE TABLE IF NOT EXISTS public."managers" ();
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "normalized_name" text;
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active'::text;
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."managers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='managers_pkey') THEN
    ALTER TABLE public."managers" ADD CONSTRAINT managers_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."managers" ENABLE ROW LEVEL SECURITY;

-- ---- table: notifications ----
CREATE TABLE IF NOT EXISTS public."notifications" ();
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "kind" text;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "body" text;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "payload" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "is_read" boolean DEFAULT false;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamp with time zone;
ALTER TABLE public."notifications" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notifications_pkey') THEN
    ALTER TABLE public."notifications" ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;

-- ---- table: onec_outbound ----
CREATE TABLE IF NOT EXISTS public."onec_outbound" ();
ALTER TABLE public."onec_outbound" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."onec_outbound" ADD COLUMN IF NOT EXISTS "event_type" text;
ALTER TABLE public."onec_outbound" ADD COLUMN IF NOT EXISTS "payload" jsonb;
ALTER TABLE public."onec_outbound" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending'::text;
ALTER TABLE public."onec_outbound" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0;
ALTER TABLE public."onec_outbound" ADD COLUMN IF NOT EXISTS "last_error" text;
ALTER TABLE public."onec_outbound" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
ALTER TABLE public."onec_outbound" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='onec_outbound_pkey') THEN
    ALTER TABLE public."onec_outbound" ADD CONSTRAINT onec_outbound_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."onec_outbound" ENABLE ROW LEVEL SECURITY;

-- ---- table: order_history ----
CREATE TABLE IF NOT EXISTS public."order_history" ();
ALTER TABLE public."order_history" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."order_history" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."order_history" ADD COLUMN IF NOT EXISTS "changed_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."order_history" ADD COLUMN IF NOT EXISTS "changed_by" text;
ALTER TABLE public."order_history" ADD COLUMN IF NOT EXISTS "field" text;
ALTER TABLE public."order_history" ADD COLUMN IF NOT EXISTS "old_value" text;
ALTER TABLE public."order_history" ADD COLUMN IF NOT EXISTS "new_value" text;
ALTER TABLE public."order_history" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."order_history" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='order_history_pkey') THEN
    ALTER TABLE public."order_history" ADD CONSTRAINT order_history_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."order_history" ENABLE ROW LEVEL SECURITY;

-- ---- table: order_items ----
CREATE TABLE IF NOT EXISTS public."order_items" ();
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "nomenclature" text;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "characteristic" text;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "quality" text;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "qty" numeric DEFAULT 0;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "unit" text;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "weight_kg" numeric;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "volume_m3" numeric;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "order_amount" numeric;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "delivery_amount" numeric;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."order_items" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='order_items_pkey') THEN
    ALTER TABLE public."order_items" ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."order_items" ENABLE ROW LEVEL SECURITY;

-- ---- table: order_problem_reports ----
CREATE TABLE IF NOT EXISTS public."order_problem_reports" ();
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "route_point_id" uuid;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "photo_url" text;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "urgency" public.problem_urgency DEFAULT 'normal'::problem_urgency;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "reported_by" text;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "manager_name" text;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "manager_phone" text;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "resolution_status" text DEFAULT 'new'::text;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "logist_comment" text;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "resolved_by" text;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
ALTER TABLE public."order_problem_reports" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='order_problem_reports_pkey') THEN
    ALTER TABLE public."order_problem_reports" ADD CONSTRAINT order_problem_reports_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."order_problem_reports" ENABLE ROW LEVEL SECURITY;

-- ---- table: orders ----
CREATE TABLE IF NOT EXISTS public."orders" ();
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "order_number" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "status" public.order_status DEFAULT 'new'::order_status;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "delivery_address" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "payment_type" public.payment_type DEFAULT 'cash'::payment_type;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "requires_qr" boolean DEFAULT false;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "cash_received" boolean DEFAULT false;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "qr_received" boolean DEFAULT false;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "latitude" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "longitude" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "landmarks" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "access_instructions" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "contact_name" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "contact_phone" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "map_link" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "delivery_photo_url" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "total_weight_kg" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "total_volume_m3" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "items_count" integer;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "qr_photo_url" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "qr_photo_uploaded_at" timestamp with time zone;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "qr_photo_uploaded_by" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "delivery_cost" numeric DEFAULT 0;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "delivery_cost_source" public.delivery_cost_source DEFAULT 'auto'::delivery_cost_source;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "delivery_zone" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "destination_city" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "goods_amount" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "applied_tariff_id" uuid;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "manual_cost_reason" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "manual_cost_set_by" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "manual_cost_set_at" timestamp with time zone;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "amount_due" numeric;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "payment_status" public.payment_status DEFAULT 'not_paid'::payment_status;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "marketplace" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "client_works_weekends" boolean DEFAULT false;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "onec_order_number" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "onec_transport_request_number" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "characteristic" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "quality" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "delivery_window_from" time without time zone;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "delivery_window_to" time without time zone;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "client_type" public.client_kind;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "delivery_time_comment" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "company_id" uuid;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "manager_id" uuid;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "manager_name" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "driver_comment" text;
ALTER TABLE public."orders" ADD COLUMN IF NOT EXISTS "driver_comment_is_important" boolean DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orders_pkey') THEN
    ALTER TABLE public."orders" ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;

-- ---- table: pilot_task_comments ----
CREATE TABLE IF NOT EXISTS public."pilot_task_comments" ();
ALTER TABLE public."pilot_task_comments" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."pilot_task_comments" ADD COLUMN IF NOT EXISTS "task_id" uuid;
ALTER TABLE public."pilot_task_comments" ADD COLUMN IF NOT EXISTS "author_user_id" uuid;
ALTER TABLE public."pilot_task_comments" ADD COLUMN IF NOT EXISTS "author_name" text;
ALTER TABLE public."pilot_task_comments" ADD COLUMN IF NOT EXISTS "body" text;
ALTER TABLE public."pilot_task_comments" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pilot_task_comments_pkey') THEN
    ALTER TABLE public."pilot_task_comments" ADD CONSTRAINT pilot_task_comments_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."pilot_task_comments" ENABLE ROW LEVEL SECURITY;

-- ---- table: pilot_tasks ----
CREATE TABLE IF NOT EXISTS public."pilot_tasks" ();
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "what_broke" text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "where_broke" text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "how_to_reproduce" text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "feedback_id" uuid;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "reporter_user_id" uuid;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "reporter_name" text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "reporter_role" text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "route_label" text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "priority" text DEFAULT 'important'::text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new'::text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "assignee" text;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
ALTER TABLE public."pilot_tasks" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pilot_tasks_pkey') THEN
    ALTER TABLE public."pilot_tasks" ADD CONSTRAINT pilot_tasks_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."pilot_tasks" ENABLE ROW LEVEL SECURITY;

-- ---- table: product_stock_settings ----
CREATE TABLE IF NOT EXISTS public."product_stock_settings" ();
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "min_stock" numeric DEFAULT 0;
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "safety_stock" numeric DEFAULT 0;
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "is_critical" boolean DEFAULT false;
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "on_demand_only" boolean DEFAULT false;
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."product_stock_settings" ADD COLUMN IF NOT EXISTS "priority" smallint DEFAULT 3;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_stock_settings_pkey') THEN
    ALTER TABLE public."product_stock_settings" ADD CONSTRAINT product_stock_settings_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."product_stock_settings" ENABLE ROW LEVEL SECURITY;

-- ---- table: products ----
CREATE TABLE IF NOT EXISTS public."products" ();
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "sku" text;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "unit" text;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "weight_kg" numeric;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "volume_m3" numeric;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "stock_qty" numeric;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE public."products" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_pkey') THEN
    ALTER TABLE public."products" ADD CONSTRAINT products_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;

-- ---- table: profiles ----
CREATE TABLE IF NOT EXISTS public."profiles" ();
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "company_id" uuid;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."profiles" ADD COLUMN IF NOT EXISTS "phone" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_pkey') THEN
    ALTER TABLE public."profiles" ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_carrier_documents ----
CREATE TABLE IF NOT EXISTS public."route_carrier_documents" ();
ALTER TABLE public."route_carrier_documents" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_carrier_documents" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."route_carrier_documents" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."route_carrier_documents" ADD COLUMN IF NOT EXISTS "kind" text;
ALTER TABLE public."route_carrier_documents" ADD COLUMN IF NOT EXISTS "file_url" text;
ALTER TABLE public."route_carrier_documents" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."route_carrier_documents" ADD COLUMN IF NOT EXISTS "uploaded_by" uuid;
ALTER TABLE public."route_carrier_documents" ADD COLUMN IF NOT EXISTS "uploaded_by_label" text;
ALTER TABLE public."route_carrier_documents" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_carrier_documents_pkey') THEN
    ALTER TABLE public."route_carrier_documents" ADD CONSTRAINT route_carrier_documents_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_carrier_documents" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_carrier_history ----
CREATE TABLE IF NOT EXISTS public."route_carrier_history" ();
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "offer_id" uuid;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "driver_id" uuid;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "vehicle_id" uuid;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "action" text;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "actor_user_id" uuid;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "actor_label" text;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE public."route_carrier_history" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_carrier_history_pkey') THEN
    ALTER TABLE public."route_carrier_history" ADD CONSTRAINT route_carrier_history_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_carrier_history" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_cost_history ----
CREATE TABLE IF NOT EXISTS public."route_cost_history" ();
ALTER TABLE public."route_cost_history" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_cost_history" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."route_cost_history" ADD COLUMN IF NOT EXISTS "old_cost" numeric DEFAULT 0;
ALTER TABLE public."route_cost_history" ADD COLUMN IF NOT EXISTS "new_cost" numeric DEFAULT 0;
ALTER TABLE public."route_cost_history" ADD COLUMN IF NOT EXISTS "old_method" text;
ALTER TABLE public."route_cost_history" ADD COLUMN IF NOT EXISTS "new_method" text;
ALTER TABLE public."route_cost_history" ADD COLUMN IF NOT EXISTS "changed_by" text;
ALTER TABLE public."route_cost_history" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."route_cost_history" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_cost_history_pkey') THEN
    ALTER TABLE public."route_cost_history" ADD CONSTRAINT route_cost_history_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_cost_history" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_offers ----
CREATE TABLE IF NOT EXISTS public."route_offers" ();
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "transport_request_id" uuid;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "vehicle_id" uuid;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "driver_id" uuid;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'sent'::text;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "viewed_at" timestamp with time zone;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "responded_at" timestamp with time zone;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "decline_reason" text;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "company_id" uuid;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."route_offers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_offers_pkey') THEN
    ALTER TABLE public."route_offers" ADD CONSTRAINT route_offers_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_offers" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_order_exclusions ----
CREATE TABLE IF NOT EXISTS public."route_order_exclusions" ();
ALTER TABLE public."route_order_exclusions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_order_exclusions" ADD COLUMN IF NOT EXISTS "delivery_route_id" uuid;
ALTER TABLE public."route_order_exclusions" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."route_order_exclusions" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."route_order_exclusions" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE public."route_order_exclusions" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."route_order_exclusions" ADD COLUMN IF NOT EXISTS "excluded_by" uuid;
ALTER TABLE public."route_order_exclusions" ADD COLUMN IF NOT EXISTS "excluded_by_name" text;
ALTER TABLE public."route_order_exclusions" ADD COLUMN IF NOT EXISTS "excluded_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_order_exclusions_pkey') THEN
    ALTER TABLE public."route_order_exclusions" ADD CONSTRAINT route_order_exclusions_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_order_exclusions" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_point_actions ----
CREATE TABLE IF NOT EXISTS public."route_point_actions" ();
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "route_point_id" uuid;
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "action" text;
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "actor" text;
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "details" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."route_point_actions" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_point_actions_pkey') THEN
    ALTER TABLE public."route_point_actions" ADD CONSTRAINT route_point_actions_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_point_actions" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_point_photo_uploads ----
CREATE TABLE IF NOT EXISTS public."route_point_photo_uploads" ();
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "client_upload_id" text;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "route_point_id" uuid;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "kind" text;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "storage_path" text;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "file_url" text;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending'::text;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "error" text;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "actor" text;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "device_created_at" timestamp with time zone;
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."route_point_photo_uploads" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_point_photo_uploads_pkey') THEN
    ALTER TABLE public."route_point_photo_uploads" ADD CONSTRAINT route_point_photo_uploads_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_point_photo_uploads" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_point_photos ----
CREATE TABLE IF NOT EXISTS public."route_point_photos" ();
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "route_point_id" uuid;
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "kind" public.route_point_photo_kind;
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "file_url" text;
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "storage_path" text;
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "uploaded_by" text;
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."route_point_photos" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_point_photos_pkey') THEN
    ALTER TABLE public."route_point_photos" ADD CONSTRAINT route_point_photos_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_point_photos" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_points ----
CREATE TABLE IF NOT EXISTS public."route_points" ();
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "point_number" integer;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "status" public.point_status DEFAULT 'pending'::point_status;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "planned_time" time without time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "arrived_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "leg_distance_km" numeric DEFAULT 0;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "travel_minutes" integer DEFAULT 0;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "service_minutes" integer;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "client_window_from" time without time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "client_window_to" time without time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "eta_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "eta_window_from" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "eta_window_to" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "eta_risk" public.eta_risk_level DEFAULT 'unknown'::eta_risk_level;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "eta_reasons" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_status" public.delivery_point_status DEFAULT 'waiting'::delivery_point_status;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_undelivered_reason" public.delivery_point_undelivered_reason;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_return_warehouse_id" uuid;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_return_comment" text;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_expected_return_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_status_changed_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_status_changed_by" text;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_amount_received" numeric;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_payment_comment" text;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_planned_arrival_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_actual_arrival_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_unload_started_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_unload_finished_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_finished_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_idle_started_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_idle_finished_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_idle_duration_minutes" integer;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_idle_reason" public.idle_reason;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "dp_idle_comment" text;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "wh_return_status" text DEFAULT 'expected'::text;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "wh_return_arrived_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "wh_return_accepted_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "wh_return_accepted_by" text;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "wh_return_comment" text;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "wh_return_status_changed_at" timestamp with time zone;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "wh_return_status_changed_by" text;
ALTER TABLE public."route_points" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_points_pkey') THEN
    ALTER TABLE public."route_points" ADD CONSTRAINT route_points_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_points" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_returns ----
CREATE TABLE IF NOT EXISTS public."route_returns" ();
ALTER TABLE public."route_returns" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_returns" ADD COLUMN IF NOT EXISTS "delivery_route_id" uuid;
ALTER TABLE public."route_returns" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."route_returns" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE public."route_returns" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."route_returns" ADD COLUMN IF NOT EXISTS "actor_user_id" uuid;
ALTER TABLE public."route_returns" ADD COLUMN IF NOT EXISTS "actor_name" text;
ALTER TABLE public."route_returns" ADD COLUMN IF NOT EXISTS "occurred_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."route_returns" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_returns_pkey') THEN
    ALTER TABLE public."route_returns" ADD CONSTRAINT route_returns_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_returns" ENABLE ROW LEVEL SECURITY;

-- ---- table: route_stage_events ----
CREATE TABLE IF NOT EXISTS public."route_stage_events" ();
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "delivery_route_id" uuid;
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "stage" public.trip_stage;
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "occurred_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "actor_user_id" uuid;
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "actor_name" text;
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "gps_lat" double precision;
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "gps_lng" double precision;
ALTER TABLE public."route_stage_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='route_stage_events_pkey') THEN
    ALTER TABLE public."route_stage_events" ADD CONSTRAINT route_stage_events_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."route_stage_events" ENABLE ROW LEVEL SECURITY;

-- ---- table: routes ----
CREATE TABLE IF NOT EXISTS public."routes" ();
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "route_number" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "route_date" date DEFAULT CURRENT_DATE;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "driver_name" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "status" public.route_status DEFAULT 'planned'::route_status;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "driver_id" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "vehicle_id" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "request_type" public.transport_request_type DEFAULT 'client_delivery'::transport_request_type;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "destination_warehouse_id" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "required_body_type" public.body_type;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "required_capacity_kg" numeric;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "required_volume_m3" numeric;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "planned_departure_at" timestamp with time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "total_weight_kg" numeric DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "total_volume_m3" numeric DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "points_count" integer DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "total_distance_km" numeric DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "delivery_cost" numeric DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_cost" numeric DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "manual_cost" boolean DEFAULT false;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "avg_speed_kmh" numeric DEFAULT 35;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "default_service_minutes" integer DEFAULT 20;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "total_duration_minutes" integer DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "required_body_length_m" numeric;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "requires_tent" boolean DEFAULT false;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "requires_manipulator" boolean DEFAULT false;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "requires_straps" boolean DEFAULT false;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "transport_comment" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "request_status" public.transport_request_status DEFAULT 'draft'::transport_request_status;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "request_status_changed_by" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "request_status_changed_at" timestamp with time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "request_status_comment" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "departure_time" time without time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "request_priority" public.transport_request_priority DEFAULT 'medium'::transport_request_priority;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "onec_request_number" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "organization" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "transport_kind" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "unloading_zone" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "mileage_km" numeric;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "total_orders_amount" numeric;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_reward" numeric;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "delivery_amount" numeric;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "points_order_changed_at" timestamp with time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "points_order_changed_by" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "cost_method" text DEFAULT 'manual'::text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "cost_per_km" numeric DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "cost_per_point" numeric DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "fixed_cost" numeric DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "applied_tariff_id" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "manual_cost_reason" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "delivery_percent_target" numeric DEFAULT 5;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "manual_orders_amount" numeric;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "company_id" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_assignment_status" text DEFAULT 'none'::text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_assigned_at" timestamp with time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_assigned_by" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "pending_offer_id" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_payment_status" public.carrier_payment_status DEFAULT 'not_calculated'::carrier_payment_status;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_cost_comment" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_cost_approved_at" timestamp with time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_cost_approved_by" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_docs_status" public.carrier_docs_status DEFAULT 'awaiting'::carrier_docs_status;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_docs_comment" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_docs_uploaded_at" timestamp with time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_docs_uploaded_by" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_docs_accepted_at" timestamp with time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_docs_accepted_by" uuid;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_docs_fix_reason" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_payout_status" public.carrier_payout_status;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_payout_scheduled_date" date;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_payout_paid_amount" numeric DEFAULT 0;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_payout_paid_at" timestamp with time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_payout_comment" text;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_payout_changed_at" timestamp with time zone;
ALTER TABLE public."routes" ADD COLUMN IF NOT EXISTS "carrier_payout_changed_by" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='routes_pkey') THEN
    ALTER TABLE public."routes" ADD CONSTRAINT routes_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."routes" ENABLE ROW LEVEL SECURITY;

-- ---- table: stock_movements ----
CREATE TABLE IF NOT EXISTS public."stock_movements" ();
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "movement_type" text;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "qty" numeric;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "reason" text;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "ref_order_id" uuid;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "ref_route_id" uuid;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "ref_supply_id" uuid;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "created_by" text;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "ref_transport_request_id" uuid;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."stock_movements" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='stock_movements_pkey') THEN
    ALTER TABLE public."stock_movements" ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."stock_movements" ENABLE ROW LEVEL SECURITY;

-- ---- table: stock_reservations ----
CREATE TABLE IF NOT EXISTS public."stock_reservations" ();
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "order_id" uuid;
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "qty" numeric;
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active'::text;
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "transport_request_id" uuid;
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."stock_reservations" ADD COLUMN IF NOT EXISTS "created_by" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='stock_reservations_pkey') THEN
    ALTER TABLE public."stock_reservations" ADD CONSTRAINT stock_reservations_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."stock_reservations" ENABLE ROW LEVEL SECURITY;

-- ---- table: stock_transfers ----
CREATE TABLE IF NOT EXISTS public."stock_transfers" ();
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "transfer_number" text;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "source_warehouse_id" uuid;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "destination_warehouse_id" uuid;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "qty" numeric;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'draft'::text;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "sent_at" timestamp with time zone;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "arrived_at" timestamp with time zone;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "created_by" text;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "in_transit_id" uuid;
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."stock_transfers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='stock_transfers_pkey') THEN
    ALTER TABLE public."stock_transfers" ADD CONSTRAINT stock_transfers_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."stock_transfers" ENABLE ROW LEVEL SECURITY;

-- ---- table: supply_in_transit ----
CREATE TABLE IF NOT EXISTS public."supply_in_transit" ();
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "destination_warehouse_id" uuid;
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "source_type" text;
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "source_warehouse_id" uuid;
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "source_name" text;
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "qty" numeric;
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "expected_at" timestamp with time zone;
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'in_transit'::text;
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."supply_in_transit" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supply_in_transit_pkey') THEN
    ALTER TABLE public."supply_in_transit" ADD CONSTRAINT supply_in_transit_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."supply_in_transit" ENABLE ROW LEVEL SECURITY;

-- ---- table: supply_notification_log ----
CREATE TABLE IF NOT EXISTS public."supply_notification_log" ();
ALTER TABLE public."supply_notification_log" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."supply_notification_log" ADD COLUMN IF NOT EXISTS "event_type" text;
ALTER TABLE public."supply_notification_log" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."supply_notification_log" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."supply_notification_log" ADD COLUMN IF NOT EXISTS "transport_request_id" uuid;
ALTER TABLE public."supply_notification_log" ADD COLUMN IF NOT EXISTS "supply_request_id" uuid;
ALTER TABLE public."supply_notification_log" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supply_notification_log_pkey') THEN
    ALTER TABLE public."supply_notification_log" ADD CONSTRAINT supply_notification_log_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."supply_notification_log" ENABLE ROW LEVEL SECURITY;

-- ---- table: supply_request_status_history ----
CREATE TABLE IF NOT EXISTS public."supply_request_status_history" ();
ALTER TABLE public."supply_request_status_history" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."supply_request_status_history" ADD COLUMN IF NOT EXISTS "supply_request_id" uuid;
ALTER TABLE public."supply_request_status_history" ADD COLUMN IF NOT EXISTS "from_status" public.supply_request_status;
ALTER TABLE public."supply_request_status_history" ADD COLUMN IF NOT EXISTS "to_status" public.supply_request_status;
ALTER TABLE public."supply_request_status_history" ADD COLUMN IF NOT EXISTS "changed_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."supply_request_status_history" ADD COLUMN IF NOT EXISTS "changed_by" text;
ALTER TABLE public."supply_request_status_history" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."supply_request_status_history" ADD COLUMN IF NOT EXISTS "in_transit_snapshot" jsonb;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supply_request_status_history_pkey') THEN
    ALTER TABLE public."supply_request_status_history" ADD CONSTRAINT supply_request_status_history_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."supply_request_status_history" ENABLE ROW LEVEL SECURITY;

-- ---- table: supply_requests ----
CREATE TABLE IF NOT EXISTS public."supply_requests" ();
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "request_number" text;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "source_type" public.supply_request_source_type;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "source_warehouse_id" uuid;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "source_name" text;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "destination_warehouse_id" uuid;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "product_id" uuid;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "qty" numeric;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "priority" public.supply_request_priority DEFAULT 'normal'::supply_request_priority;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "status" public.supply_request_status DEFAULT 'draft'::supply_request_status;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "expected_at" timestamp with time zone;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "created_by" text;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "received_at" timestamp with time zone;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "in_transit_id" uuid;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "supply_status" text DEFAULT 'created'::text;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "supply_comment" text;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "supply_status_changed_at" timestamp with time zone;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "supply_status_changed_by" text;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "planned_vehicle" text;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "planned_carrier" text;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "expected_time" time without time zone;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "inbound_shipment_id" uuid;
ALTER TABLE public."supply_requests" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='supply_requests_pkey') THEN
    ALTER TABLE public."supply_requests" ADD CONSTRAINT supply_requests_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."supply_requests" ENABLE ROW LEVEL SECURITY;

-- ---- table: system_errors ----
CREATE TABLE IF NOT EXISTS public."system_errors" ();
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "code" text DEFAULT 'unknown'::text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "message" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "technical" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "section" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "action" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "severity" text DEFAULT 'error'::text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new'::text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "user_name" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "user_role" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "ip_address" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "user_agent" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "url" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "fingerprint" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "occurrences" integer DEFAULT 1;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "admin_note" text;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp with time zone;
ALTER TABLE public."system_errors" ADD COLUMN IF NOT EXISTS "resolved_by" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='system_errors_pkey') THEN
    ALTER TABLE public."system_errors" ADD CONSTRAINT system_errors_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."system_errors" ENABLE ROW LEVEL SECURITY;

-- ---- table: system_issues ----
CREATE TABLE IF NOT EXISTS public."system_issues" ();
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'manager'::text;
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "severity" text DEFAULT 'medium'::text;
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new'::text;
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."system_issues" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='system_issues_pkey') THEN
    ALTER TABLE public."system_issues" ADD CONSTRAINT system_issues_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."system_issues" ENABLE ROW LEVEL SECURITY;

-- ---- table: system_settings ----
CREATE TABLE IF NOT EXISTS public."system_settings" ();
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "setting_key" text;
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "setting_value" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'general'::text;
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "is_public" boolean DEFAULT true;
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."system_settings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='system_settings_pkey') THEN
    ALTER TABLE public."system_settings" ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."system_settings" ENABLE ROW LEVEL SECURITY;

-- ---- table: transport_request_status_history ----
CREATE TABLE IF NOT EXISTS public."transport_request_status_history" ();
ALTER TABLE public."transport_request_status_history" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."transport_request_status_history" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."transport_request_status_history" ADD COLUMN IF NOT EXISTS "from_status" public.transport_request_status;
ALTER TABLE public."transport_request_status_history" ADD COLUMN IF NOT EXISTS "to_status" public.transport_request_status;
ALTER TABLE public."transport_request_status_history" ADD COLUMN IF NOT EXISTS "changed_by" text;
ALTER TABLE public."transport_request_status_history" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."transport_request_status_history" ADD COLUMN IF NOT EXISTS "changed_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transport_request_status_history_pkey') THEN
    ALTER TABLE public."transport_request_status_history" ADD CONSTRAINT transport_request_status_history_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."transport_request_status_history" ENABLE ROW LEVEL SECURITY;

-- ---- table: transport_request_warehouse_status_log ----
CREATE TABLE IF NOT EXISTS public."transport_request_warehouse_status_log" ();
ALTER TABLE public."transport_request_warehouse_status_log" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."transport_request_warehouse_status_log" ADD COLUMN IF NOT EXISTS "transport_request_id" uuid;
ALTER TABLE public."transport_request_warehouse_status_log" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE public."transport_request_warehouse_status_log" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."transport_request_warehouse_status_log" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transport_request_warehouse_status_log_pkey') THEN
    ALTER TABLE public."transport_request_warehouse_status_log" ADD CONSTRAINT transport_request_warehouse_status_log_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."transport_request_warehouse_status_log" ENABLE ROW LEVEL SECURITY;

-- ---- table: user_roles ----
CREATE TABLE IF NOT EXISTS public."user_roles" ();
ALTER TABLE public."user_roles" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."user_roles" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE public."user_roles" ADD COLUMN IF NOT EXISTS "role" public.app_role;
ALTER TABLE public."user_roles" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_roles_pkey') THEN
    ALTER TABLE public."user_roles" ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."user_roles" ENABLE ROW LEVEL SECURITY;

-- ---- table: vehicles ----
CREATE TABLE IF NOT EXISTS public."vehicles" ();
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "carrier_id" uuid;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "plate_number" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "brand" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "body_type" public.body_type DEFAULT 'tent'::body_type;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "capacity_kg" numeric;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "volume_m3" numeric;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "body_length_m" numeric;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "body_width_m" numeric;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "body_height_m" numeric;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "tie_rings_count" integer DEFAULT 0;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "has_straps" boolean DEFAULT false;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "has_tent" boolean DEFAULT false;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "has_manipulator" boolean DEFAULT false;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "photo_front_url" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "photo_back_url" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "photo_left_url" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "photo_right_url" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "photo_inside_url" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "photo_documents_url" text;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."vehicles" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='vehicles_pkey') THEN
    ALTER TABLE public."vehicles" ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."vehicles" ENABLE ROW LEVEL SECURITY;

-- ---- table: warehouse_dock_events ----
CREATE TABLE IF NOT EXISTS public."warehouse_dock_events" ();
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "delivery_route_id" uuid;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "event_date" date DEFAULT CURRENT_DATE;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "expected_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'expected'::text;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "driver_name" text;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "vehicle_plate" text;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "route_number" text;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "arrived_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "loading_started_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "loaded_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "departed_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "return_accepted_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "load_plan_confirmed_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_events" ADD COLUMN IF NOT EXISTS "load_plan_confirmed_by" text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='warehouse_dock_events_pkey') THEN
    ALTER TABLE public."warehouse_dock_events" ADD CONSTRAINT warehouse_dock_events_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."warehouse_dock_events" ENABLE ROW LEVEL SECURITY;

-- ---- table: warehouse_dock_slots ----
CREATE TABLE IF NOT EXISTS public."warehouse_dock_slots" ();
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "slot_kind" public.dock_slot_kind;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "slot_date" date DEFAULT CURRENT_DATE;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "start_time" time without time zone;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "end_time" time without time zone;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "route_id" uuid;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "vehicle_id" uuid;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "driver_id" uuid;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "carrier_name" text;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "driver_name" text;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "vehicle_plate" text;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "cargo_summary" text;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "expected_arrival_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "status" public.dock_slot_status DEFAULT 'planned'::dock_slot_status;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "arrived_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "confirmed_by" text;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."warehouse_dock_slots" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='warehouse_dock_slots_pkey') THEN
    ALTER TABLE public."warehouse_dock_slots" ADD CONSTRAINT warehouse_dock_slots_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."warehouse_dock_slots" ENABLE ROW LEVEL SECURITY;

-- ---- table: warehouse_load_plan ----
CREATE TABLE IF NOT EXISTS public."warehouse_load_plan" ();
ALTER TABLE public."warehouse_load_plan" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."warehouse_load_plan" ADD COLUMN IF NOT EXISTS "route_point_id" uuid;
ALTER TABLE public."warehouse_load_plan" ADD COLUMN IF NOT EXISTS "delivery_route_id" uuid;
ALTER TABLE public."warehouse_load_plan" ADD COLUMN IF NOT EXISTS "cargo_position" text;
ALTER TABLE public."warehouse_load_plan" ADD COLUMN IF NOT EXISTS "warehouse_comment" text;
ALTER TABLE public."warehouse_load_plan" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."warehouse_load_plan" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='warehouse_load_plan_pkey') THEN
    ALTER TABLE public."warehouse_load_plan" ADD CONSTRAINT warehouse_load_plan_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."warehouse_load_plan" ENABLE ROW LEVEL SECURITY;

-- ---- table: warehouse_staff ----
CREATE TABLE IF NOT EXISTS public."warehouse_staff" ();
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid;
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "full_name" text;
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "role" public.warehouse_staff_role DEFAULT 'storekeeper'::warehouse_staff_role;
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "comment" text;
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."warehouse_staff" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='warehouse_staff_pkey') THEN
    ALTER TABLE public."warehouse_staff" ADD CONSTRAINT warehouse_staff_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."warehouse_staff" ENABLE ROW LEVEL SECURITY;

-- ---- table: warehouses ----
CREATE TABLE IF NOT EXISTS public."warehouses" ();
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "id" uuid DEFAULT gen_random_uuid();
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "city" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "contact_person" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "external_id" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual'::text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "latitude" numeric;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "longitude" numeric;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "working_hours" jsonb DEFAULT '{"fri": {"open": "08:00", "close": "18:00", "enabled": true}, "mon": {"open": "08:00", "close": "18:00", "enabled": true}, "sat": {"open": "09:00", "close": "14:00", "enabled": false}, "sun": {"open": "09:00", "close": "14:00", "enabled": false}, "thu": {"open": "08:00", "close": "18:00", "enabled": true}, "tue": {"open": "08:00", "close": "18:00", "enabled": true}, "wed": {"open": "08:00", "close": "18:00", "enabled": true}}'::jsonb;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "breaks" jsonb DEFAULT '[{"end": "13:00", "label": "Обед", "start": "12:00"}]'::jsonb;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "delivery_zone" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "delivery_radius_km" numeric;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "manager_name" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "manager_phone" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE public."warehouses" ADD COLUMN IF NOT EXISTS "company_id" uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='warehouses_pkey') THEN
    ALTER TABLE public."warehouses" ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);
  END IF;
END $$;
ALTER TABLE public."warehouses" ENABLE ROW LEVEL SECURITY;

-- 4) RLS policies
DROP POLICY IF EXISTS "app_versions_delete_role" ON public."app_versions";
CREATE POLICY "app_versions_delete_role" ON public."app_versions" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "app_versions_insert_role" ON public."app_versions";
CREATE POLICY "app_versions_insert_role" ON public."app_versions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "app_versions_select_all" ON public."app_versions";
CREATE POLICY "app_versions_select_all" ON public."app_versions" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "app_versions_update_role" ON public."app_versions";
CREATE POLICY "app_versions_update_role" ON public."app_versions" AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "audit_log_insert_any_auth" ON public."audit_log";
CREATE POLICY "audit_log_insert_any_auth" ON public."audit_log" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "audit_log_modify_admin" ON public."audit_log";
CREATE POLICY "audit_log_modify_admin" ON public."audit_log" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "audit_log_select_admin_director" ON public."audit_log";
CREATE POLICY "audit_log_select_admin_director" ON public."audit_log" AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role)));
DROP POLICY IF EXISTS "Admins and directors can view backups" ON public."backups";
CREATE POLICY "Admins and directors can view backups" ON public."backups" AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role)));
DROP POLICY IF EXISTS "Admins manage backups" ON public."backups";
CREATE POLICY "Admins manage backups" ON public."backups" AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "carrier_documents_delete_role" ON public."carrier_documents";
CREATE POLICY "carrier_documents_delete_role" ON public."carrier_documents" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "carrier_documents_insert_role" ON public."carrier_documents";
CREATE POLICY "carrier_documents_insert_role" ON public."carrier_documents" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "carrier_documents_select_all" ON public."carrier_documents";
CREATE POLICY "carrier_documents_select_all" ON public."carrier_documents" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "carrier_documents_update_role" ON public."carrier_documents";
CREATE POLICY "carrier_documents_update_role" ON public."carrier_documents" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "carrier_invites_delete_role" ON public."carrier_invites";
CREATE POLICY "carrier_invites_delete_role" ON public."carrier_invites" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "carrier_invites_insert_role" ON public."carrier_invites";
CREATE POLICY "carrier_invites_insert_role" ON public."carrier_invites" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "carrier_invites_select_all" ON public."carrier_invites";
CREATE POLICY "carrier_invites_select_all" ON public."carrier_invites" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "carrier_invites_update_role" ON public."carrier_invites";
CREATE POLICY "carrier_invites_update_role" ON public."carrier_invites" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "carriers_company_isolation" ON public."carriers";
CREATE POLICY "carriers_company_isolation" ON public."carriers" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "carriers_delete_role" ON public."carriers";
CREATE POLICY "carriers_delete_role" ON public."carriers" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "carriers_insert_role" ON public."carriers";
CREATE POLICY "carriers_insert_role" ON public."carriers" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "carriers_select_all" ON public."carriers";
CREATE POLICY "carriers_select_all" ON public."carriers" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "carriers_update_role" ON public."carriers";
CREATE POLICY "carriers_update_role" ON public."carriers" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "clients_company_isolation" ON public."clients";
CREATE POLICY "clients_company_isolation" ON public."clients" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "clients_delete_role" ON public."clients";
CREATE POLICY "clients_delete_role" ON public."clients" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "clients_insert_role" ON public."clients";
CREATE POLICY "clients_insert_role" ON public."clients" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "clients_select_all" ON public."clients";
CREATE POLICY "clients_select_all" ON public."clients" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "clients_update_role" ON public."clients";
CREATE POLICY "clients_update_role" ON public."clients" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "companies_modify_admin" ON public."companies";
CREATE POLICY "companies_modify_admin" ON public."companies" AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) AND has_company_access(auth.uid(), id))) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "companies_select_member" ON public."companies";
CREATE POLICY "companies_select_member" ON public."companies" AS PERMISSIVE FOR SELECT TO authenticated USING ((has_company_access(auth.uid(), id) OR has_role(auth.uid(), 'admin'::app_role)));
DROP POLICY IF EXISTS "company_members_modify_admin" ON public."company_members";
CREATE POLICY "company_members_modify_admin" ON public."company_members" AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "company_members_select" ON public."company_members";
CREATE POLICY "company_members_select" ON public."company_members" AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
DROP POLICY IF EXISTS "delivery_reports_company_isolation" ON public."delivery_reports";
CREATE POLICY "delivery_reports_company_isolation" ON public."delivery_reports" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "delivery_reports_delete_role" ON public."delivery_reports";
CREATE POLICY "delivery_reports_delete_role" ON public."delivery_reports" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "delivery_reports_insert_role" ON public."delivery_reports";
CREATE POLICY "delivery_reports_insert_role" ON public."delivery_reports" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "delivery_reports_select_all" ON public."delivery_reports";
CREATE POLICY "delivery_reports_select_all" ON public."delivery_reports" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "delivery_reports_update_role" ON public."delivery_reports";
CREATE POLICY "delivery_reports_update_role" ON public."delivery_reports" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'driver'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "delivery_routes_carrier_select" ON public."delivery_routes";
CREATE POLICY "delivery_routes_carrier_select" ON public."delivery_routes" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "delivery_routes_carrier_update" ON public."delivery_routes";
CREATE POLICY "delivery_routes_carrier_update" ON public."delivery_routes" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "delivery_routes_company_isolation" ON public."delivery_routes";
CREATE POLICY "delivery_routes_company_isolation" ON public."delivery_routes" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "delivery_routes_delete_role" ON public."delivery_routes";
CREATE POLICY "delivery_routes_delete_role" ON public."delivery_routes" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "delivery_routes_insert_role" ON public."delivery_routes";
CREATE POLICY "delivery_routes_insert_role" ON public."delivery_routes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "delivery_routes_select_all" ON public."delivery_routes";
CREATE POLICY "delivery_routes_select_all" ON public."delivery_routes" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "delivery_routes_update_role" ON public."delivery_routes";
CREATE POLICY "delivery_routes_update_role" ON public."delivery_routes" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "delivery_tariffs_company_isolation" ON public."delivery_tariffs";
CREATE POLICY "delivery_tariffs_company_isolation" ON public."delivery_tariffs" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "delivery_tariffs_delete_role" ON public."delivery_tariffs";
CREATE POLICY "delivery_tariffs_delete_role" ON public."delivery_tariffs" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "delivery_tariffs_insert_role" ON public."delivery_tariffs";
CREATE POLICY "delivery_tariffs_insert_role" ON public."delivery_tariffs" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "delivery_tariffs_select_all" ON public."delivery_tariffs";
CREATE POLICY "delivery_tariffs_select_all" ON public."delivery_tariffs" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "delivery_tariffs_update_role" ON public."delivery_tariffs";
CREATE POLICY "delivery_tariffs_update_role" ON public."delivery_tariffs" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "dock_loaded_items_delete_role" ON public."dock_loaded_items";
CREATE POLICY "dock_loaded_items_delete_role" ON public."dock_loaded_items" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "dock_loaded_items_insert_role" ON public."dock_loaded_items";
CREATE POLICY "dock_loaded_items_insert_role" ON public."dock_loaded_items" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "dock_loaded_items_select_all" ON public."dock_loaded_items";
CREATE POLICY "dock_loaded_items_select_all" ON public."dock_loaded_items" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "dock_loaded_items_update_role" ON public."dock_loaded_items";
CREATE POLICY "dock_loaded_items_update_role" ON public."dock_loaded_items" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "driver_locations_company_isolation" ON public."driver_locations";
CREATE POLICY "driver_locations_company_isolation" ON public."driver_locations" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "driver_locations_delete_role" ON public."driver_locations";
CREATE POLICY "driver_locations_delete_role" ON public."driver_locations" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "driver_locations_insert_all" ON public."driver_locations";
CREATE POLICY "driver_locations_insert_all" ON public."driver_locations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
DROP POLICY IF EXISTS "driver_locations_insert_role" ON public."driver_locations";
CREATE POLICY "driver_locations_insert_role" ON public."driver_locations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "driver_locations_select_all" ON public."driver_locations";
CREATE POLICY "driver_locations_select_all" ON public."driver_locations" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "driver_locations_update_role" ON public."driver_locations";
CREATE POLICY "driver_locations_update_role" ON public."driver_locations" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "drivers_company_isolation" ON public."drivers";
CREATE POLICY "drivers_company_isolation" ON public."drivers" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "drivers_delete_role" ON public."drivers";
CREATE POLICY "drivers_delete_role" ON public."drivers" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "drivers_insert_role" ON public."drivers";
CREATE POLICY "drivers_insert_role" ON public."drivers" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "drivers_select_all" ON public."drivers";
CREATE POLICY "drivers_select_all" ON public."drivers" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "drivers_update_role" ON public."drivers";
CREATE POLICY "drivers_update_role" ON public."drivers" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "external_refs_delete_role" ON public."external_refs";
CREATE POLICY "external_refs_delete_role" ON public."external_refs" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "external_refs_insert_role" ON public."external_refs";
CREATE POLICY "external_refs_insert_role" ON public."external_refs" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "external_refs_select_all" ON public."external_refs";
CREATE POLICY "external_refs_select_all" ON public."external_refs" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "external_refs_update_role" ON public."external_refs";
CREATE POLICY "external_refs_update_role" ON public."external_refs" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "feedback_company_isolation" ON public."feedback";
CREATE POLICY "feedback_company_isolation" ON public."feedback" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "feedback_delete_admin" ON public."feedback";
CREATE POLICY "feedback_delete_admin" ON public."feedback" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "feedback_insert_own" ON public."feedback";
CREATE POLICY "feedback_insert_own" ON public."feedback" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "feedback_select_admin" ON public."feedback";
CREATE POLICY "feedback_select_admin" ON public."feedback" AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role)));
DROP POLICY IF EXISTS "feedback_select_own" ON public."feedback";
CREATE POLICY "feedback_select_own" ON public."feedback" AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "import_log_rows_company_isolation" ON public."import_log_rows";
CREATE POLICY "import_log_rows_company_isolation" ON public."import_log_rows" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "import_log_rows_delete_role" ON public."import_log_rows";
CREATE POLICY "import_log_rows_delete_role" ON public."import_log_rows" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "import_log_rows_insert_role" ON public."import_log_rows";
CREATE POLICY "import_log_rows_insert_role" ON public."import_log_rows" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "import_log_rows_select_all" ON public."import_log_rows";
CREATE POLICY "import_log_rows_select_all" ON public."import_log_rows" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "import_log_rows_update_role" ON public."import_log_rows";
CREATE POLICY "import_log_rows_update_role" ON public."import_log_rows" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "import_logs_company_isolation" ON public."import_logs";
CREATE POLICY "import_logs_company_isolation" ON public."import_logs" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "import_logs_delete_role" ON public."import_logs";
CREATE POLICY "import_logs_delete_role" ON public."import_logs" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "import_logs_insert_role" ON public."import_logs";
CREATE POLICY "import_logs_insert_role" ON public."import_logs" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "import_logs_select_all" ON public."import_logs";
CREATE POLICY "import_logs_select_all" ON public."import_logs" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "import_logs_update_role" ON public."import_logs";
CREATE POLICY "import_logs_update_role" ON public."import_logs" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "inbound_shipment_items_company_isolation" ON public."inbound_shipment_items";
CREATE POLICY "inbound_shipment_items_company_isolation" ON public."inbound_shipment_items" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "inbound_shipment_items_delete_role" ON public."inbound_shipment_items";
CREATE POLICY "inbound_shipment_items_delete_role" ON public."inbound_shipment_items" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "inbound_shipment_items_insert_role" ON public."inbound_shipment_items";
CREATE POLICY "inbound_shipment_items_insert_role" ON public."inbound_shipment_items" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "inbound_shipment_items_select_all" ON public."inbound_shipment_items";
CREATE POLICY "inbound_shipment_items_select_all" ON public."inbound_shipment_items" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "inbound_shipment_items_update_role" ON public."inbound_shipment_items";
CREATE POLICY "inbound_shipment_items_update_role" ON public."inbound_shipment_items" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "inbound_shipments_company_isolation" ON public."inbound_shipments";
CREATE POLICY "inbound_shipments_company_isolation" ON public."inbound_shipments" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "inbound_shipments_delete_role" ON public."inbound_shipments";
CREATE POLICY "inbound_shipments_delete_role" ON public."inbound_shipments" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "inbound_shipments_insert_role" ON public."inbound_shipments";
CREATE POLICY "inbound_shipments_insert_role" ON public."inbound_shipments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "inbound_shipments_select_all" ON public."inbound_shipments";
CREATE POLICY "inbound_shipments_select_all" ON public."inbound_shipments" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "inbound_shipments_update_role" ON public."inbound_shipments";
CREATE POLICY "inbound_shipments_update_role" ON public."inbound_shipments" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "Admins can delete invite tokens" ON public."invite_tokens";
CREATE POLICY "Admins can delete invite tokens" ON public."invite_tokens" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can insert invite tokens" ON public."invite_tokens";
CREATE POLICY "Admins can insert invite tokens" ON public."invite_tokens" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can read invite tokens" ON public."invite_tokens";
CREATE POLICY "Admins can read invite tokens" ON public."invite_tokens" AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Admins can update invite tokens" ON public."invite_tokens";
CREATE POLICY "Admins can update invite tokens" ON public."invite_tokens" AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "managers_delete_role" ON public."managers";
CREATE POLICY "managers_delete_role" ON public."managers" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "managers_insert_role" ON public."managers";
CREATE POLICY "managers_insert_role" ON public."managers" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "managers_select_all" ON public."managers";
CREATE POLICY "managers_select_all" ON public."managers" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "managers_update_role" ON public."managers";
CREATE POLICY "managers_update_role" ON public."managers" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "notifications_delete_admin" ON public."notifications";
CREATE POLICY "notifications_delete_admin" ON public."notifications" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "notifications_insert_auth" ON public."notifications";
CREATE POLICY "notifications_insert_auth" ON public."notifications" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notifications_select_all" ON public."notifications";
CREATE POLICY "notifications_select_all" ON public."notifications" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "notifications_update_auth" ON public."notifications";
CREATE POLICY "notifications_update_auth" ON public."notifications" AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "onec_outbound_delete_role" ON public."onec_outbound";
CREATE POLICY "onec_outbound_delete_role" ON public."onec_outbound" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "onec_outbound_insert_role" ON public."onec_outbound";
CREATE POLICY "onec_outbound_insert_role" ON public."onec_outbound" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "onec_outbound_select_all" ON public."onec_outbound";
CREATE POLICY "onec_outbound_select_all" ON public."onec_outbound" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "onec_outbound_update_role" ON public."onec_outbound";
CREATE POLICY "onec_outbound_update_role" ON public."onec_outbound" AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "order_history_company_isolation" ON public."order_history";
CREATE POLICY "order_history_company_isolation" ON public."order_history" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "order_history_delete_role" ON public."order_history";
CREATE POLICY "order_history_delete_role" ON public."order_history" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "order_history_insert_role" ON public."order_history";
CREATE POLICY "order_history_insert_role" ON public."order_history" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "order_history_select_all" ON public."order_history";
CREATE POLICY "order_history_select_all" ON public."order_history" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "order_history_update_role" ON public."order_history";
CREATE POLICY "order_history_update_role" ON public."order_history" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "order_items_company_isolation" ON public."order_items";
CREATE POLICY "order_items_company_isolation" ON public."order_items" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "order_items_delete_role" ON public."order_items";
CREATE POLICY "order_items_delete_role" ON public."order_items" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "order_items_insert_role" ON public."order_items";
CREATE POLICY "order_items_insert_role" ON public."order_items" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "order_items_select_all" ON public."order_items";
CREATE POLICY "order_items_select_all" ON public."order_items" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "order_items_update_role" ON public."order_items";
CREATE POLICY "order_items_update_role" ON public."order_items" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "order_problem_reports_company_isolation" ON public."order_problem_reports";
CREATE POLICY "order_problem_reports_company_isolation" ON public."order_problem_reports" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "order_problem_reports_delete_role" ON public."order_problem_reports";
CREATE POLICY "order_problem_reports_delete_role" ON public."order_problem_reports" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "order_problem_reports_insert_role" ON public."order_problem_reports";
CREATE POLICY "order_problem_reports_insert_role" ON public."order_problem_reports" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "order_problem_reports_select_all" ON public."order_problem_reports";
CREATE POLICY "order_problem_reports_select_all" ON public."order_problem_reports" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "order_problem_reports_update_role" ON public."order_problem_reports";
CREATE POLICY "order_problem_reports_update_role" ON public."order_problem_reports" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'driver'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "orders_carrier_select" ON public."orders";
CREATE POLICY "orders_carrier_select" ON public."orders" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "orders_company_isolation" ON public."orders";
CREATE POLICY "orders_company_isolation" ON public."orders" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "orders_delete_role" ON public."orders";
CREATE POLICY "orders_delete_role" ON public."orders" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "orders_insert_role" ON public."orders";
CREATE POLICY "orders_insert_role" ON public."orders" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "orders_select_all" ON public."orders";
CREATE POLICY "orders_select_all" ON public."orders" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "orders_update_role" ON public."orders";
CREATE POLICY "orders_update_role" ON public."orders" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "pilot_task_comments_delete_admin" ON public."pilot_task_comments";
CREATE POLICY "pilot_task_comments_delete_admin" ON public."pilot_task_comments" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "pilot_task_comments_insert_admin" ON public."pilot_task_comments";
CREATE POLICY "pilot_task_comments_insert_admin" ON public."pilot_task_comments" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role)));
DROP POLICY IF EXISTS "pilot_task_comments_select_admin" ON public."pilot_task_comments";
CREATE POLICY "pilot_task_comments_select_admin" ON public."pilot_task_comments" AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role)));
DROP POLICY IF EXISTS "pilot_tasks_company_isolation" ON public."pilot_tasks";
CREATE POLICY "pilot_tasks_company_isolation" ON public."pilot_tasks" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "pilot_tasks_delete_admin" ON public."pilot_tasks";
CREATE POLICY "pilot_tasks_delete_admin" ON public."pilot_tasks" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "pilot_tasks_insert_admin" ON public."pilot_tasks";
CREATE POLICY "pilot_tasks_insert_admin" ON public."pilot_tasks" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role)));
DROP POLICY IF EXISTS "pilot_tasks_select_admin" ON public."pilot_tasks";
CREATE POLICY "pilot_tasks_select_admin" ON public."pilot_tasks" AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role)));
DROP POLICY IF EXISTS "pilot_tasks_update_admin" ON public."pilot_tasks";
CREATE POLICY "pilot_tasks_update_admin" ON public."pilot_tasks" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role)));
DROP POLICY IF EXISTS "product_stock_settings_delete_role" ON public."product_stock_settings";
CREATE POLICY "product_stock_settings_delete_role" ON public."product_stock_settings" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "product_stock_settings_insert_role" ON public."product_stock_settings";
CREATE POLICY "product_stock_settings_insert_role" ON public."product_stock_settings" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "product_stock_settings_select_all" ON public."product_stock_settings";
CREATE POLICY "product_stock_settings_select_all" ON public."product_stock_settings" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "product_stock_settings_update_role" ON public."product_stock_settings";
CREATE POLICY "product_stock_settings_update_role" ON public."product_stock_settings" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'supply'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "products_company_isolation" ON public."products";
CREATE POLICY "products_company_isolation" ON public."products" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "products_delete_role" ON public."products";
CREATE POLICY "products_delete_role" ON public."products" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "products_insert_role" ON public."products";
CREATE POLICY "products_insert_role" ON public."products" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "products_select_all" ON public."products";
CREATE POLICY "products_select_all" ON public."products" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "products_update_role" ON public."products";
CREATE POLICY "products_update_role" ON public."products" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'supply'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "profiles_company_isolation" ON public."profiles";
CREATE POLICY "profiles_company_isolation" ON public."profiles" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "profiles_delete_admin" ON public."profiles";
CREATE POLICY "profiles_delete_admin" ON public."profiles" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "profiles_insert_self_or_admin" ON public."profiles";
CREATE POLICY "profiles_insert_self_or_admin" ON public."profiles" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public."profiles";
CREATE POLICY "profiles_select_own_or_admin" ON public."profiles" AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public."profiles";
CREATE POLICY "profiles_update_own_or_admin" ON public."profiles" AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));
DROP POLICY IF EXISTS "rcd_carrier_delete" ON public."route_carrier_documents";
CREATE POLICY "rcd_carrier_delete" ON public."route_carrier_documents" AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "rcd_carrier_insert" ON public."route_carrier_documents";
CREATE POLICY "rcd_carrier_insert" ON public."route_carrier_documents" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "rcd_carrier_select" ON public."route_carrier_documents";
CREATE POLICY "rcd_carrier_select" ON public."route_carrier_documents" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "rcd_staff_all" ON public."route_carrier_documents";
CREATE POLICY "rcd_staff_all" ON public."route_carrier_documents" AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "rch_carrier_select" ON public."route_carrier_history";
CREATE POLICY "rch_carrier_select" ON public."route_carrier_history" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "rch_staff_all" ON public."route_carrier_history";
CREATE POLICY "rch_staff_all" ON public."route_carrier_history" AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "route_cost_history_delete_role" ON public."route_cost_history";
CREATE POLICY "route_cost_history_delete_role" ON public."route_cost_history" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "route_cost_history_insert_role" ON public."route_cost_history";
CREATE POLICY "route_cost_history_insert_role" ON public."route_cost_history" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "route_cost_history_select_all" ON public."route_cost_history";
CREATE POLICY "route_cost_history_select_all" ON public."route_cost_history" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "route_cost_history_update_role" ON public."route_cost_history";
CREATE POLICY "route_cost_history_update_role" ON public."route_cost_history" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "route_offers_carrier_select" ON public."route_offers";
CREATE POLICY "route_offers_carrier_select" ON public."route_offers" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "route_offers_carrier_update" ON public."route_offers";
CREATE POLICY "route_offers_carrier_update" ON public."route_offers" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "route_offers_staff_all" ON public."route_offers";
CREATE POLICY "route_offers_staff_all" ON public."route_offers" AS PERMISSIVE FOR ALL TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "route_order_exclusions_insert_admin" ON public."route_order_exclusions";
CREATE POLICY "route_order_exclusions_insert_admin" ON public."route_order_exclusions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "route_order_exclusions_select_auth" ON public."route_order_exclusions";
CREATE POLICY "route_order_exclusions_select_auth" ON public."route_order_exclusions" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "route_point_actions_company_isolation" ON public."route_point_actions";
CREATE POLICY "route_point_actions_company_isolation" ON public."route_point_actions" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "route_point_actions_delete_role" ON public."route_point_actions";
CREATE POLICY "route_point_actions_delete_role" ON public."route_point_actions" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "route_point_actions_insert_role" ON public."route_point_actions";
CREATE POLICY "route_point_actions_insert_role" ON public."route_point_actions" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "route_point_actions_select_all" ON public."route_point_actions";
CREATE POLICY "route_point_actions_select_all" ON public."route_point_actions" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "route_point_actions_update_role" ON public."route_point_actions";
CREATE POLICY "route_point_actions_update_role" ON public."route_point_actions" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "Admins and logists can delete from photo upload queue" ON public."route_point_photo_uploads";
CREATE POLICY "Admins and logists can delete from photo upload queue" ON public."route_point_photo_uploads" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "Admins and logists can update photo upload queue" ON public."route_point_photo_uploads";
CREATE POLICY "Admins and logists can update photo upload queue" ON public."route_point_photo_uploads" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "Authenticated can insert into photo upload queue" ON public."route_point_photo_uploads";
CREATE POLICY "Authenticated can insert into photo upload queue" ON public."route_point_photo_uploads" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can view photo upload queue" ON public."route_point_photo_uploads";
CREATE POLICY "Authenticated can view photo upload queue" ON public."route_point_photo_uploads" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "route_point_photos_company_isolation" ON public."route_point_photos";
CREATE POLICY "route_point_photos_company_isolation" ON public."route_point_photos" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "route_point_photos_delete_role" ON public."route_point_photos";
CREATE POLICY "route_point_photos_delete_role" ON public."route_point_photos" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "route_point_photos_insert_role" ON public."route_point_photos";
CREATE POLICY "route_point_photos_insert_role" ON public."route_point_photos" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "route_point_photos_select_all" ON public."route_point_photos";
CREATE POLICY "route_point_photos_select_all" ON public."route_point_photos" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "route_point_photos_update_role" ON public."route_point_photos";
CREATE POLICY "route_point_photos_update_role" ON public."route_point_photos" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "route_points_carrier_select" ON public."route_points";
CREATE POLICY "route_points_carrier_select" ON public."route_points" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "route_points_carrier_update" ON public."route_points";
CREATE POLICY "route_points_carrier_update" ON public."route_points" AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "route_points_company_isolation" ON public."route_points";
CREATE POLICY "route_points_company_isolation" ON public."route_points" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "route_points_delete_role" ON public."route_points";
CREATE POLICY "route_points_delete_role" ON public."route_points" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "route_points_insert_role" ON public."route_points";
CREATE POLICY "route_points_insert_role" ON public."route_points" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "route_points_select_all" ON public."route_points";
CREATE POLICY "route_points_select_all" ON public."route_points" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "route_points_update_role" ON public."route_points";
CREATE POLICY "route_points_update_role" ON public."route_points" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'driver'::app_role)));
DROP POLICY IF EXISTS "rret_insert_authenticated" ON public."route_returns";
CREATE POLICY "rret_insert_authenticated" ON public."route_returns" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rret_select_authenticated" ON public."route_returns";
CREATE POLICY "rret_select_authenticated" ON public."route_returns" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rse_insert_authenticated" ON public."route_stage_events";
CREATE POLICY "rse_insert_authenticated" ON public."route_stage_events" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rse_select_authenticated" ON public."route_stage_events";
CREATE POLICY "rse_select_authenticated" ON public."route_stage_events" AS PERMISSIVE FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "routes_carrier_select_own" ON public."routes";
CREATE POLICY "routes_carrier_select_own" ON public."routes" AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1);
DROP POLICY IF EXISTS "routes_company_isolation" ON public."routes";
CREATE POLICY "routes_company_isolation" ON public."routes" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "routes_delete_role" ON public."routes";
CREATE POLICY "routes_delete_role" ON public."routes" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "routes_insert_role" ON public."routes";
CREATE POLICY "routes_insert_role" ON public."routes" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "routes_select_all" ON public."routes";
CREATE POLICY "routes_select_all" ON public."routes" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "routes_update_role" ON public."routes";
CREATE POLICY "routes_update_role" ON public."routes" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "stock_movements_company_isolation" ON public."stock_movements";
CREATE POLICY "stock_movements_company_isolation" ON public."stock_movements" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "stock_movements_delete_role" ON public."stock_movements";
CREATE POLICY "stock_movements_delete_role" ON public."stock_movements" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "stock_movements_insert_role" ON public."stock_movements";
CREATE POLICY "stock_movements_insert_role" ON public."stock_movements" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "stock_movements_select_all" ON public."stock_movements";
CREATE POLICY "stock_movements_select_all" ON public."stock_movements" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "stock_movements_update_role" ON public."stock_movements";
CREATE POLICY "stock_movements_update_role" ON public."stock_movements" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "stock_reservations_delete_role" ON public."stock_reservations";
CREATE POLICY "stock_reservations_delete_role" ON public."stock_reservations" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "stock_reservations_insert_role" ON public."stock_reservations";
CREATE POLICY "stock_reservations_insert_role" ON public."stock_reservations" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "stock_reservations_select_all" ON public."stock_reservations";
CREATE POLICY "stock_reservations_select_all" ON public."stock_reservations" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "stock_reservations_update_role" ON public."stock_reservations";
CREATE POLICY "stock_reservations_update_role" ON public."stock_reservations" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "stock_transfers_delete_role" ON public."stock_transfers";
CREATE POLICY "stock_transfers_delete_role" ON public."stock_transfers" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "stock_transfers_insert_role" ON public."stock_transfers";
CREATE POLICY "stock_transfers_insert_role" ON public."stock_transfers" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "stock_transfers_select_all" ON public."stock_transfers";
CREATE POLICY "stock_transfers_select_all" ON public."stock_transfers" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "stock_transfers_update_role" ON public."stock_transfers";
CREATE POLICY "stock_transfers_update_role" ON public."stock_transfers" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "supply_in_transit_company_isolation" ON public."supply_in_transit";
CREATE POLICY "supply_in_transit_company_isolation" ON public."supply_in_transit" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "supply_in_transit_delete_role" ON public."supply_in_transit";
CREATE POLICY "supply_in_transit_delete_role" ON public."supply_in_transit" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));
DROP POLICY IF EXISTS "supply_in_transit_insert_role" ON public."supply_in_transit";
CREATE POLICY "supply_in_transit_insert_role" ON public."supply_in_transit" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));
DROP POLICY IF EXISTS "supply_in_transit_select_all" ON public."supply_in_transit";
CREATE POLICY "supply_in_transit_select_all" ON public."supply_in_transit" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "supply_in_transit_update_role" ON public."supply_in_transit";
CREATE POLICY "supply_in_transit_update_role" ON public."supply_in_transit" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));
DROP POLICY IF EXISTS "supply_notification_log_delete_role" ON public."supply_notification_log";
CREATE POLICY "supply_notification_log_delete_role" ON public."supply_notification_log" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "supply_notification_log_insert_role" ON public."supply_notification_log";
CREATE POLICY "supply_notification_log_insert_role" ON public."supply_notification_log" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "supply_notification_log_select_all" ON public."supply_notification_log";
CREATE POLICY "supply_notification_log_select_all" ON public."supply_notification_log" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "supply_notification_log_update_role" ON public."supply_notification_log";
CREATE POLICY "supply_notification_log_update_role" ON public."supply_notification_log" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "supply_request_status_history_delete_role" ON public."supply_request_status_history";
CREATE POLICY "supply_request_status_history_delete_role" ON public."supply_request_status_history" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));
DROP POLICY IF EXISTS "supply_request_status_history_insert_role" ON public."supply_request_status_history";
CREATE POLICY "supply_request_status_history_insert_role" ON public."supply_request_status_history" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));
DROP POLICY IF EXISTS "supply_request_status_history_select_all" ON public."supply_request_status_history";
CREATE POLICY "supply_request_status_history_select_all" ON public."supply_request_status_history" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "supply_request_status_history_update_role" ON public."supply_request_status_history";
CREATE POLICY "supply_request_status_history_update_role" ON public."supply_request_status_history" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));
DROP POLICY IF EXISTS "supply_requests_company_isolation" ON public."supply_requests";
CREATE POLICY "supply_requests_company_isolation" ON public."supply_requests" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "supply_requests_delete_role" ON public."supply_requests";
CREATE POLICY "supply_requests_delete_role" ON public."supply_requests" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "supply_requests_insert_role" ON public."supply_requests";
CREATE POLICY "supply_requests_insert_role" ON public."supply_requests" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "supply_requests_select_all" ON public."supply_requests";
CREATE POLICY "supply_requests_select_all" ON public."supply_requests" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "supply_requests_update_role" ON public."supply_requests";
CREATE POLICY "supply_requests_update_role" ON public."supply_requests" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supply'::app_role)));
DROP POLICY IF EXISTS "sys_err_insert_authenticated" ON public."system_errors";
CREATE POLICY "sys_err_insert_authenticated" ON public."system_errors" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sys_err_select_admin_director" ON public."system_errors";
CREATE POLICY "sys_err_select_admin_director" ON public."system_errors" AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'director'::app_role)));
DROP POLICY IF EXISTS "sys_err_update_admin" ON public."system_errors";
CREATE POLICY "sys_err_update_admin" ON public."system_errors" AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "system_issues_delete_role" ON public."system_issues";
CREATE POLICY "system_issues_delete_role" ON public."system_issues" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "system_issues_insert_role" ON public."system_issues";
CREATE POLICY "system_issues_insert_role" ON public."system_issues" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "system_issues_select_all" ON public."system_issues";
CREATE POLICY "system_issues_select_all" ON public."system_issues" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "system_issues_update_role" ON public."system_issues";
CREATE POLICY "system_issues_update_role" ON public."system_issues" AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "system_settings_delete_role" ON public."system_settings";
CREATE POLICY "system_settings_delete_role" ON public."system_settings" AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "system_settings_insert_role" ON public."system_settings";
CREATE POLICY "system_settings_insert_role" ON public."system_settings" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "system_settings_select_all" ON public."system_settings";
CREATE POLICY "system_settings_select_all" ON public."system_settings" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "system_settings_update_role" ON public."system_settings";
CREATE POLICY "system_settings_update_role" ON public."system_settings" AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "transport_request_status_history_delete_role" ON public."transport_request_status_history";
CREATE POLICY "transport_request_status_history_delete_role" ON public."transport_request_status_history" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "transport_request_status_history_insert_role" ON public."transport_request_status_history";
CREATE POLICY "transport_request_status_history_insert_role" ON public."transport_request_status_history" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "transport_request_status_history_select_all" ON public."transport_request_status_history";
CREATE POLICY "transport_request_status_history_select_all" ON public."transport_request_status_history" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "transport_request_status_history_update_role" ON public."transport_request_status_history";
CREATE POLICY "transport_request_status_history_update_role" ON public."transport_request_status_history" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
DROP POLICY IF EXISTS "transport_request_warehouse_status_log_delete_role" ON public."transport_request_warehouse_status_log";
CREATE POLICY "transport_request_warehouse_status_log_delete_role" ON public."transport_request_warehouse_status_log" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));
DROP POLICY IF EXISTS "transport_request_warehouse_status_log_insert_role" ON public."transport_request_warehouse_status_log";
CREATE POLICY "transport_request_warehouse_status_log_insert_role" ON public."transport_request_warehouse_status_log" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));
DROP POLICY IF EXISTS "transport_request_warehouse_status_log_select_all" ON public."transport_request_warehouse_status_log";
CREATE POLICY "transport_request_warehouse_status_log_select_all" ON public."transport_request_warehouse_status_log" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "transport_request_warehouse_status_log_update_role" ON public."transport_request_warehouse_status_log";
CREATE POLICY "transport_request_warehouse_status_log_update_role" ON public."transport_request_warehouse_status_log" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));
DROP POLICY IF EXISTS "user_roles_admin_all" ON public."user_roles";
CREATE POLICY "user_roles_admin_all" ON public."user_roles" AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public."user_roles";
CREATE POLICY "user_roles_select_own_or_admin" ON public."user_roles" AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));
DROP POLICY IF EXISTS "vehicles_company_isolation" ON public."vehicles";
CREATE POLICY "vehicles_company_isolation" ON public."vehicles" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "vehicles_delete_role" ON public."vehicles";
CREATE POLICY "vehicles_delete_role" ON public."vehicles" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "vehicles_insert_role" ON public."vehicles";
CREATE POLICY "vehicles_insert_role" ON public."vehicles" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "vehicles_select_all" ON public."vehicles";
CREATE POLICY "vehicles_select_all" ON public."vehicles" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "vehicles_update_role" ON public."vehicles";
CREATE POLICY "vehicles_update_role" ON public."vehicles" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_dock_events_delete_role" ON public."warehouse_dock_events";
CREATE POLICY "warehouse_dock_events_delete_role" ON public."warehouse_dock_events" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_dock_events_insert_role" ON public."warehouse_dock_events";
CREATE POLICY "warehouse_dock_events_insert_role" ON public."warehouse_dock_events" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_dock_events_select_all" ON public."warehouse_dock_events";
CREATE POLICY "warehouse_dock_events_select_all" ON public."warehouse_dock_events" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "warehouse_dock_events_update_role" ON public."warehouse_dock_events";
CREATE POLICY "warehouse_dock_events_update_role" ON public."warehouse_dock_events" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_dock_slots_delete_role" ON public."warehouse_dock_slots";
CREATE POLICY "warehouse_dock_slots_delete_role" ON public."warehouse_dock_slots" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_dock_slots_insert_role" ON public."warehouse_dock_slots";
CREATE POLICY "warehouse_dock_slots_insert_role" ON public."warehouse_dock_slots" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_dock_slots_select_all" ON public."warehouse_dock_slots";
CREATE POLICY "warehouse_dock_slots_select_all" ON public."warehouse_dock_slots" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "warehouse_dock_slots_update_role" ON public."warehouse_dock_slots";
CREATE POLICY "warehouse_dock_slots_update_role" ON public."warehouse_dock_slots" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_load_plan_delete_role" ON public."warehouse_load_plan";
CREATE POLICY "warehouse_load_plan_delete_role" ON public."warehouse_load_plan" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_load_plan_insert_role" ON public."warehouse_load_plan";
CREATE POLICY "warehouse_load_plan_insert_role" ON public."warehouse_load_plan" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_load_plan_select_all" ON public."warehouse_load_plan";
CREATE POLICY "warehouse_load_plan_select_all" ON public."warehouse_load_plan" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "warehouse_load_plan_update_role" ON public."warehouse_load_plan";
CREATE POLICY "warehouse_load_plan_update_role" ON public."warehouse_load_plan" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_staff_delete_role" ON public."warehouse_staff";
CREATE POLICY "warehouse_staff_delete_role" ON public."warehouse_staff" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_staff_insert_role" ON public."warehouse_staff";
CREATE POLICY "warehouse_staff_insert_role" ON public."warehouse_staff" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouse_staff_select_all" ON public."warehouse_staff";
CREATE POLICY "warehouse_staff_select_all" ON public."warehouse_staff" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "warehouse_staff_update_role" ON public."warehouse_staff";
CREATE POLICY "warehouse_staff_update_role" ON public."warehouse_staff" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouses_company_isolation" ON public."warehouses";
CREATE POLICY "warehouses_company_isolation" ON public."warehouses" AS RESTRICTIVE FOR ALL TO authenticated USING (((company_id IS NULL) OR has_company_access(auth.uid(), company_id))) WITH CHECK (((company_id IS NULL) OR has_company_access(auth.uid(), company_id)));
DROP POLICY IF EXISTS "warehouses_delete_role" ON public."warehouses";
CREATE POLICY "warehouses_delete_role" ON public."warehouses" AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouses_insert_role" ON public."warehouses";
CREATE POLICY "warehouses_insert_role" ON public."warehouses" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));
DROP POLICY IF EXISTS "warehouses_select_all" ON public."warehouses";
CREATE POLICY "warehouses_select_all" ON public."warehouses" AS PERMISSIVE FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "warehouses_update_role" ON public."warehouses";
CREATE POLICY "warehouses_update_role" ON public."warehouses" AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role))) WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'logist'::app_role)));

-- 5) system_settings seed (UPSERT по setting_key)
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('demo_mode_enabled', 'false'::jsonb, 'Показывать бейдж и баннер демо-режима, разрешать тестовые данные', 'general', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('driver_document_photos_enabled', 'false'::jsonb, 'Если включено — водитель обязан загружать фото документов (подписанные документы, оплата, место выгрузки). QR-код всегда обязателен.', 'driver', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('driver.checklist', '[{"id": "docs", "label": "Документы на груз"}, {"id": "fuel", "label": "Топливо"}, {"id": "phone", "label": "Телефон заряжен"}, {"id": "qr", "label": "QR-сканер работает"}]'::jsonb, 'Чек-лист водителя перед выездом', 'driver', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('driver.instructions', E'{"text": "1. Проверьте груз перед выездом\\n2. Получите QR-код или оплату от клиента\\n3. Сделайте фото при доставке\\n4. При проблеме сразу свяжитесь с логистом"}'::jsonb, 'Инструкция для водителя на старте смены', 'driver', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('gps_deviation_threshold_m', '1000'::jsonb, 'Порог отклонения водителя от ближайшей точки маршрута (метры)', 'gps', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('launch.mode', '"full"'::jsonb, 'Режим запуска системы: "minimal" — только базовые разделы (рабочий день, импорт, заказы, маршруты, водитель, отчёты, контроль работы); "full" — все доступные роли разделы.', 'general', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('limits.vehicle', '{"max_volume_m3": 82, "max_weight_kg": 20000, "warn_threshold_pct": 90}'::jsonb, 'Лимиты транспорта по умолчанию', 'limits', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('modules.enabled', '{"onec": false, "supply": false, "carriers": false, "warehouse": false, "accounting": false, "excel_import": true}'::jsonb, 'Включение/выключение опциональных модулей системы. Если модуль выключен, его разделы скрываются из меню и не блокируют работу остальных модулей.', 'modules', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('notifications.templates', '{"order_failed": "Заказ {{order_number}} не доставлен: {{reason}}", "order_delivered": "Заказ {{order_number}} доставлен", "resend_required": "Заказ {{order_number}} требует повторной доставки"}'::jsonb, 'Шаблоны уведомлений менеджеру', 'notifications', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('order.problem_types', '[{"key": "no_payment", "label": "Нет оплаты"}, {"key": "no_qr", "label": "Нет QR"}, {"key": "client_no_answer", "label": "Клиент не отвечает"}, {"key": "client_absent", "label": "Клиент отсутствует"}, {"key": "client_refused", "label": "Клиент отказался"}, {"key": "defective", "label": "Брак"}, {"key": "no_unloading", "label": "Невозможна выгрузка"}, {"key": "problem", "label": "Прочее"}]'::jsonb, 'Типы проблем при доставке', 'order', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('roles.list', '[{"key": "admin", "label": "Администратор"}, {"key": "logist", "label": "Логист"}, {"key": "manager", "label": "Менеджер"}, {"key": "driver", "label": "Водитель"}, {"key": "carrier", "label": "Перевозчик"}]'::jsonb, 'Роли пользователей системы', 'roles', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('rules.no_payment_no_unload', '{"enabled": true, "message": "Без оплаты не выгружать груз"}'::jsonb, 'Правило: без оплаты не выгружать', 'rules', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('rules.qr', '{"message": "Получите QR-код от клиента перед выгрузкой", "required_for_payment_types": ["qr", "mixed"]}'::jsonb, 'Правила работы с QR-кодами', 'rules', true) ON CONFLICT (setting_key) DO NOTHING;
INSERT INTO public.system_settings (setting_key, setting_value, description, category, is_public) VALUES ('warehouse.schedule', '{"sat": {"open": "09:00", "close": "15:00"}, "sun": null, "mon_fri": {"open": "08:00", "close": "20:00"}}'::jsonb, 'График работы складов по умолчанию', 'warehouse', true) ON CONFLICT (setting_key) DO NOTHING;

COMMIT;
-- ============================================================
-- Готово. После запуска перезагрузите PostgREST/Supabase API,
-- чтобы он увидел новые колонки (NOTIFY pgrst, 'reload schema';)
-- ============================================================
NOTIFY pgrst, 'reload schema';
