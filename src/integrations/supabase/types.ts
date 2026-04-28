export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_versions: {
        Row: {
          app_store_url: string | null
          created_at: string
          current_version: string
          force_update: boolean
          id: string
          minimum_required_version: string
          platform: string
          play_market_url: string | null
          release_notes: string | null
          released_at: string
          update_message: string | null
          updated_at: string
        }
        Insert: {
          app_store_url?: string | null
          created_at?: string
          current_version: string
          force_update?: boolean
          id?: string
          minimum_required_version: string
          platform: string
          play_market_url?: string | null
          release_notes?: string | null
          released_at?: string
          update_message?: string | null
          updated_at?: string
        }
        Update: {
          app_store_url?: string | null
          created_at?: string
          current_version?: string
          force_update?: boolean
          id?: string
          minimum_required_version?: string
          platform?: string
          play_market_url?: string | null
          release_notes?: string | null
          released_at?: string
          update_message?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      carrier_documents: {
        Row: {
          carrier_id: string | null
          created_at: string
          doc_type: string
          driver_id: string | null
          file_url: string
          id: string
          title: string | null
          vehicle_id: string | null
        }
        Insert: {
          carrier_id?: string | null
          created_at?: string
          doc_type: string
          driver_id?: string | null
          file_url: string
          id?: string
          title?: string | null
          vehicle_id?: string | null
        }
        Update: {
          carrier_id?: string | null
          created_at?: string
          doc_type?: string
          driver_id?: string | null
          file_url?: string
          id?: string
          title?: string | null
          vehicle_id?: string | null
        }
        Relationships: []
      }
      carrier_invites: {
        Row: {
          carrier_id: string | null
          created_at: string
          email: string | null
          expires_at: string | null
          id: string
          invite_type: string
          note: string | null
          phone: string | null
          status: string
          token: string
          updated_at: string
          used_at: string | null
          used_carrier_id: string | null
          used_driver_id: string | null
        }
        Insert: {
          carrier_id?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invite_type?: string
          note?: string | null
          phone?: string | null
          status?: string
          token: string
          updated_at?: string
          used_at?: string | null
          used_carrier_id?: string | null
          used_driver_id?: string | null
        }
        Update: {
          carrier_id?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invite_type?: string
          note?: string | null
          phone?: string | null
          status?: string
          token?: string
          updated_at?: string
          used_at?: string | null
          used_carrier_id?: string | null
          used_driver_id?: string | null
        }
        Relationships: []
      }
      carriers: {
        Row: {
          bank_account: string | null
          bank_bik: string | null
          bank_corr_account: string | null
          bank_name: string | null
          carrier_type: Database["public"]["Enums"]["carrier_type"]
          city: string | null
          company_name: string
          contact_person: string | null
          created_at: string
          email: string | null
          external_id: string | null
          id: string
          inn: string | null
          ogrn: string | null
          phone: string | null
          portal_token: string | null
          source: string
          updated_at: string
          verification_comment: string | null
          verification_status: Database["public"]["Enums"]["carrier_verification_status"]
        }
        Insert: {
          bank_account?: string | null
          bank_bik?: string | null
          bank_corr_account?: string | null
          bank_name?: string | null
          carrier_type: Database["public"]["Enums"]["carrier_type"]
          city?: string | null
          company_name: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          inn?: string | null
          ogrn?: string | null
          phone?: string | null
          portal_token?: string | null
          source?: string
          updated_at?: string
          verification_comment?: string | null
          verification_status?: Database["public"]["Enums"]["carrier_verification_status"]
        }
        Update: {
          bank_account?: string | null
          bank_bik?: string | null
          bank_corr_account?: string | null
          bank_name?: string | null
          carrier_type?: Database["public"]["Enums"]["carrier_type"]
          city?: string | null
          company_name?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          inn?: string | null
          ogrn?: string | null
          phone?: string | null
          portal_token?: string | null
          source?: string
          updated_at?: string
          verification_comment?: string | null
          verification_status?: Database["public"]["Enums"]["carrier_verification_status"]
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          external_id: string | null
          id: string
          inn: string | null
          manager_name: string | null
          name: string
          phone: string | null
          source: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          inn?: string | null
          manager_name?: string | null
          name: string
          phone?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          id?: string
          inn?: string | null
          manager_name?: string | null
          name?: string
          phone?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_reports: {
        Row: {
          cash_received: boolean
          comment: string | null
          created_at: string
          delivered_at: string
          driver_name: string | null
          id: string
          order_id: string
          outcome: string
          qr_received: boolean
          reason: string | null
          requires_resend: boolean
          route_id: string | null
          route_point_id: string | null
        }
        Insert: {
          cash_received?: boolean
          comment?: string | null
          created_at?: string
          delivered_at?: string
          driver_name?: string | null
          id?: string
          order_id: string
          outcome: string
          qr_received?: boolean
          reason?: string | null
          requires_resend?: boolean
          route_id?: string | null
          route_point_id?: string | null
        }
        Update: {
          cash_received?: boolean
          comment?: string | null
          created_at?: string
          delivered_at?: string
          driver_name?: string | null
          id?: string
          order_id?: string
          outcome?: string
          qr_received?: boolean
          reason?: string | null
          requires_resend?: boolean
          route_id?: string | null
          route_point_id?: string | null
        }
        Relationships: []
      }
      delivery_routes: {
        Row: {
          assigned_driver: string | null
          assigned_vehicle: string | null
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          route_date: string
          route_number: string
          source_request_id: string
          source_warehouse_id: string | null
          status: Database["public"]["Enums"]["delivery_route_status"]
          updated_at: string
        }
        Insert: {
          assigned_driver?: string | null
          assigned_vehicle?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          route_date?: string
          route_number: string
          source_request_id: string
          source_warehouse_id?: string | null
          status?: Database["public"]["Enums"]["delivery_route_status"]
          updated_at?: string
        }
        Update: {
          assigned_driver?: string | null
          assigned_vehicle?: string | null
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          route_date?: string
          route_number?: string
          source_request_id?: string
          source_warehouse_id?: string | null
          status?: Database["public"]["Enums"]["delivery_route_status"]
          updated_at?: string
        }
        Relationships: []
      }
      delivery_tariffs: {
        Row: {
          base_price: number | null
          city: string | null
          comment: string | null
          created_at: string
          destination_city: string | null
          fixed_price: number | null
          goods_percent: number | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["tariff_kind"]
          locality: string | null
          min_price: number | null
          name: string
          price_per_km: number | null
          price_per_point: number | null
          priority: number
          radius_km: number | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          warehouse_id: string
          zone: string | null
        }
        Insert: {
          base_price?: number | null
          city?: string | null
          comment?: string | null
          created_at?: string
          destination_city?: string | null
          fixed_price?: number | null
          goods_percent?: number | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["tariff_kind"]
          locality?: string | null
          min_price?: number | null
          name: string
          price_per_km?: number | null
          price_per_point?: number | null
          priority?: number
          radius_km?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          warehouse_id: string
          zone?: string | null
        }
        Update: {
          base_price?: number | null
          city?: string | null
          comment?: string | null
          created_at?: string
          destination_city?: string | null
          fixed_price?: number | null
          goods_percent?: number | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["tariff_kind"]
          locality?: string | null
          min_price?: number | null
          name?: string
          price_per_km?: number | null
          price_per_point?: number | null
          priority?: number
          radius_km?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          warehouse_id?: string
          zone?: string | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          carrier_id: string
          comment: string | null
          created_at: string
          external_id: string | null
          full_name: string
          id: string
          is_active: boolean
          license_categories: string | null
          license_expires_date: string | null
          license_issued_date: string | null
          license_number: string | null
          passport_issued_by: string | null
          passport_issued_date: string | null
          passport_number: string | null
          passport_series: string | null
          phone: string | null
          photo_url: string | null
          portal_token: string | null
          source: string
          updated_at: string
        }
        Insert: {
          carrier_id: string
          comment?: string | null
          created_at?: string
          external_id?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          license_categories?: string | null
          license_expires_date?: string | null
          license_issued_date?: string | null
          license_number?: string | null
          passport_issued_by?: string | null
          passport_issued_date?: string | null
          passport_number?: string | null
          passport_series?: string | null
          phone?: string | null
          photo_url?: string | null
          portal_token?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          carrier_id?: string
          comment?: string | null
          created_at?: string
          external_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          license_categories?: string | null
          license_expires_date?: string | null
          license_issued_date?: string | null
          license_number?: string | null
          passport_issued_by?: string | null
          passport_issued_date?: string | null
          passport_number?: string | null
          passport_series?: string | null
          phone?: string | null
          photo_url?: string | null
          portal_token?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      external_refs: {
        Row: {
          created_at: string
          entity: string
          external_id: string
          external_system: string
          id: string
          last_synced_at: string
          local_id: string | null
          payload: Json | null
        }
        Insert: {
          created_at?: string
          entity: string
          external_id: string
          external_system?: string
          id?: string
          last_synced_at?: string
          local_id?: string | null
          payload?: Json | null
        }
        Update: {
          created_at?: string
          entity?: string
          external_id?: string
          external_system?: string
          id?: string
          last_synced_at?: string
          local_id?: string | null
          payload?: Json | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: string
          order_id: string | null
          payload: Json
          read_at: string | null
          route_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind: string
          order_id?: string | null
          payload?: Json
          read_at?: string | null
          route_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          order_id?: string | null
          payload?: Json
          read_at?: string | null
          route_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      onec_outbound: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload: Json
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      order_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          comment: string | null
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          order_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          comment?: string | null
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          comment?: string | null
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          access_instructions: string | null
          amount_due: number | null
          applied_tariff_id: string | null
          cash_received: boolean
          client_works_weekends: boolean
          comment: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          delivery_address: string | null
          delivery_cost: number
          delivery_cost_source: Database["public"]["Enums"]["delivery_cost_source"]
          delivery_photo_url: string | null
          delivery_zone: string | null
          destination_city: string | null
          external_id: string | null
          goods_amount: number | null
          id: string
          items_count: number | null
          landmarks: string | null
          latitude: number | null
          longitude: number | null
          manual_cost_reason: string | null
          manual_cost_set_at: string | null
          manual_cost_set_by: string | null
          map_link: string | null
          marketplace: string | null
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          payment_type: Database["public"]["Enums"]["payment_type"]
          qr_photo_uploaded_at: string | null
          qr_photo_uploaded_by: string | null
          qr_photo_url: string | null
          qr_received: boolean
          requires_qr: boolean
          source: string
          status: Database["public"]["Enums"]["order_status"]
          total_volume_m3: number | null
          total_weight_kg: number | null
          updated_at: string
        }
        Insert: {
          access_instructions?: string | null
          amount_due?: number | null
          applied_tariff_id?: string | null
          cash_received?: boolean
          client_works_weekends?: boolean
          comment?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_cost?: number
          delivery_cost_source?: Database["public"]["Enums"]["delivery_cost_source"]
          delivery_photo_url?: string | null
          delivery_zone?: string | null
          destination_city?: string | null
          external_id?: string | null
          goods_amount?: number | null
          id?: string
          items_count?: number | null
          landmarks?: string | null
          latitude?: number | null
          longitude?: number | null
          manual_cost_reason?: string | null
          manual_cost_set_at?: string | null
          manual_cost_set_by?: string | null
          map_link?: string | null
          marketplace?: string | null
          order_number: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_type?: Database["public"]["Enums"]["payment_type"]
          qr_photo_uploaded_at?: string | null
          qr_photo_uploaded_by?: string | null
          qr_photo_url?: string | null
          qr_received?: boolean
          requires_qr?: boolean
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_volume_m3?: number | null
          total_weight_kg?: number | null
          updated_at?: string
        }
        Update: {
          access_instructions?: string | null
          amount_due?: number | null
          applied_tariff_id?: string | null
          cash_received?: boolean
          client_works_weekends?: boolean
          comment?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_cost?: number
          delivery_cost_source?: Database["public"]["Enums"]["delivery_cost_source"]
          delivery_photo_url?: string | null
          delivery_zone?: string | null
          destination_city?: string | null
          external_id?: string | null
          goods_amount?: number | null
          id?: string
          items_count?: number | null
          landmarks?: string | null
          latitude?: number | null
          longitude?: number | null
          manual_cost_reason?: string | null
          manual_cost_set_at?: string | null
          manual_cost_set_by?: string | null
          map_link?: string | null
          marketplace?: string | null
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_type?: Database["public"]["Enums"]["payment_type"]
          qr_photo_uploaded_at?: string | null
          qr_photo_uploaded_by?: string | null
          qr_photo_url?: string | null
          qr_received?: boolean
          requires_qr?: boolean
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_volume_m3?: number | null
          total_weight_kg?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      product_stock_settings: {
        Row: {
          created_at: string
          id: string
          is_critical: boolean
          min_stock: number
          on_demand_only: boolean
          product_id: string
          safety_stock: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_critical?: boolean
          min_stock?: number
          on_demand_only?: boolean
          product_id: string
          safety_stock?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_critical?: boolean
          min_stock?: number
          on_demand_only?: boolean
          product_id?: string
          safety_stock?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          name: string
          sku: string | null
          source: string
          stock_qty: number | null
          unit: string | null
          updated_at: string
          volume_m3: number | null
          warehouse_id: string | null
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          name: string
          sku?: string | null
          source?: string
          stock_qty?: number | null
          unit?: string | null
          updated_at?: string
          volume_m3?: number | null
          warehouse_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          name?: string
          sku?: string | null
          source?: string
          stock_qty?: number | null
          unit?: string | null
          updated_at?: string
          volume_m3?: number | null
          warehouse_id?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      route_points: {
        Row: {
          arrived_at: string | null
          client_window_from: string | null
          client_window_to: string | null
          completed_at: string | null
          created_at: string
          eta_at: string | null
          eta_reasons: Json
          eta_risk: Database["public"]["Enums"]["eta_risk_level"]
          eta_window_from: string | null
          eta_window_to: string | null
          id: string
          leg_distance_km: number
          order_id: string
          planned_time: string | null
          point_number: number
          route_id: string
          service_minutes: number | null
          status: Database["public"]["Enums"]["point_status"]
          travel_minutes: number
        }
        Insert: {
          arrived_at?: string | null
          client_window_from?: string | null
          client_window_to?: string | null
          completed_at?: string | null
          created_at?: string
          eta_at?: string | null
          eta_reasons?: Json
          eta_risk?: Database["public"]["Enums"]["eta_risk_level"]
          eta_window_from?: string | null
          eta_window_to?: string | null
          id?: string
          leg_distance_km?: number
          order_id: string
          planned_time?: string | null
          point_number: number
          route_id: string
          service_minutes?: number | null
          status?: Database["public"]["Enums"]["point_status"]
          travel_minutes?: number
        }
        Update: {
          arrived_at?: string | null
          client_window_from?: string | null
          client_window_to?: string | null
          completed_at?: string | null
          created_at?: string
          eta_at?: string | null
          eta_reasons?: Json
          eta_risk?: Database["public"]["Enums"]["eta_risk_level"]
          eta_window_from?: string | null
          eta_window_to?: string | null
          id?: string
          leg_distance_km?: number
          order_id?: string
          planned_time?: string | null
          point_number?: number
          route_id?: string
          service_minutes?: number | null
          status?: Database["public"]["Enums"]["point_status"]
          travel_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "route_points_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_points_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          avg_speed_kmh: number
          carrier_cost: number
          comment: string | null
          created_at: string
          default_service_minutes: number
          delivery_cost: number
          departure_time: string | null
          destination_warehouse_id: string | null
          driver_id: string | null
          driver_name: string | null
          id: string
          manual_cost: boolean
          planned_departure_at: string | null
          points_count: number
          request_priority: Database["public"]["Enums"]["transport_request_priority"]
          request_status: Database["public"]["Enums"]["transport_request_status"]
          request_status_changed_at: string | null
          request_status_changed_by: string | null
          request_status_comment: string | null
          request_type: Database["public"]["Enums"]["transport_request_type"]
          required_body_length_m: number | null
          required_body_type: Database["public"]["Enums"]["body_type"] | null
          required_capacity_kg: number | null
          required_volume_m3: number | null
          requires_manipulator: boolean
          requires_straps: boolean
          requires_tent: boolean
          route_date: string
          route_number: string
          status: Database["public"]["Enums"]["route_status"]
          total_distance_km: number
          total_duration_minutes: number
          total_volume_m3: number
          total_weight_kg: number
          transport_comment: string | null
          updated_at: string
          vehicle_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          avg_speed_kmh?: number
          carrier_cost?: number
          comment?: string | null
          created_at?: string
          default_service_minutes?: number
          delivery_cost?: number
          departure_time?: string | null
          destination_warehouse_id?: string | null
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          manual_cost?: boolean
          planned_departure_at?: string | null
          points_count?: number
          request_priority?: Database["public"]["Enums"]["transport_request_priority"]
          request_status?: Database["public"]["Enums"]["transport_request_status"]
          request_status_changed_at?: string | null
          request_status_changed_by?: string | null
          request_status_comment?: string | null
          request_type?: Database["public"]["Enums"]["transport_request_type"]
          required_body_length_m?: number | null
          required_body_type?: Database["public"]["Enums"]["body_type"] | null
          required_capacity_kg?: number | null
          required_volume_m3?: number | null
          requires_manipulator?: boolean
          requires_straps?: boolean
          requires_tent?: boolean
          route_date?: string
          route_number: string
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_km?: number
          total_duration_minutes?: number
          total_volume_m3?: number
          total_weight_kg?: number
          transport_comment?: string | null
          updated_at?: string
          vehicle_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          avg_speed_kmh?: number
          carrier_cost?: number
          comment?: string | null
          created_at?: string
          default_service_minutes?: number
          delivery_cost?: number
          departure_time?: string | null
          destination_warehouse_id?: string | null
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          manual_cost?: boolean
          planned_departure_at?: string | null
          points_count?: number
          request_priority?: Database["public"]["Enums"]["transport_request_priority"]
          request_status?: Database["public"]["Enums"]["transport_request_status"]
          request_status_changed_at?: string | null
          request_status_changed_by?: string | null
          request_status_comment?: string | null
          request_type?: Database["public"]["Enums"]["transport_request_type"]
          required_body_length_m?: number | null
          required_body_type?: Database["public"]["Enums"]["body_type"] | null
          required_capacity_kg?: number | null
          required_volume_m3?: number | null
          requires_manipulator?: boolean
          requires_straps?: boolean
          requires_tent?: boolean
          route_date?: string
          route_number?: string
          status?: Database["public"]["Enums"]["route_status"]
          total_distance_km?: number
          total_duration_minutes?: number
          total_volume_m3?: number
          total_weight_kg?: number
          transport_comment?: string | null
          updated_at?: string
          vehicle_id?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "stock_balances"
            referencedColumns: ["warehouse_id"]
          },
          {
            foreignKeyName: "routes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          product_id: string
          qty: number
          reason: string | null
          ref_order_id: string | null
          ref_route_id: string | null
          ref_supply_id: string | null
          warehouse_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          product_id: string
          qty: number
          reason?: string | null
          ref_order_id?: string | null
          ref_route_id?: string | null
          ref_supply_id?: string | null
          warehouse_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          product_id?: string
          qty?: number
          reason?: string | null
          ref_order_id?: string | null
          ref_route_id?: string | null
          ref_supply_id?: string | null
          warehouse_id?: string
        }
        Relationships: []
      }
      stock_reservations: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          product_id: string
          qty: number
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          product_id: string
          qty: number
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string
          qty?: number
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: []
      }
      supply_in_transit: {
        Row: {
          comment: string | null
          created_at: string
          destination_warehouse_id: string
          expected_at: string | null
          id: string
          product_id: string
          qty: number
          source_name: string | null
          source_type: string
          source_warehouse_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          destination_warehouse_id: string
          expected_at?: string | null
          id?: string
          product_id: string
          qty: number
          source_name?: string | null
          source_type: string
          source_warehouse_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          destination_warehouse_id?: string
          expected_at?: string | null
          id?: string
          product_id?: string
          qty?: number
          source_name?: string | null
          source_type?: string
          source_warehouse_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      supply_request_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          comment: string | null
          from_status:
            | Database["public"]["Enums"]["supply_request_status"]
            | null
          id: string
          in_transit_snapshot: Json | null
          supply_request_id: string
          to_status: Database["public"]["Enums"]["supply_request_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          comment?: string | null
          from_status?:
            | Database["public"]["Enums"]["supply_request_status"]
            | null
          id?: string
          in_transit_snapshot?: Json | null
          supply_request_id: string
          to_status: Database["public"]["Enums"]["supply_request_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          comment?: string | null
          from_status?:
            | Database["public"]["Enums"]["supply_request_status"]
            | null
          id?: string
          in_transit_snapshot?: Json | null
          supply_request_id?: string
          to_status?: Database["public"]["Enums"]["supply_request_status"]
        }
        Relationships: []
      }
      supply_requests: {
        Row: {
          comment: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          destination_warehouse_id: string
          expected_at: string | null
          id: string
          in_transit_id: string | null
          priority: Database["public"]["Enums"]["supply_request_priority"]
          product_id: string
          qty: number
          received_at: string | null
          request_number: string
          source_name: string | null
          source_type: Database["public"]["Enums"]["supply_request_source_type"]
          source_warehouse_id: string | null
          status: Database["public"]["Enums"]["supply_request_status"]
          updated_at: string
        }
        Insert: {
          comment?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination_warehouse_id: string
          expected_at?: string | null
          id?: string
          in_transit_id?: string | null
          priority?: Database["public"]["Enums"]["supply_request_priority"]
          product_id: string
          qty: number
          received_at?: string | null
          request_number: string
          source_name?: string | null
          source_type: Database["public"]["Enums"]["supply_request_source_type"]
          source_warehouse_id?: string | null
          status?: Database["public"]["Enums"]["supply_request_status"]
          updated_at?: string
        }
        Update: {
          comment?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          destination_warehouse_id?: string
          expected_at?: string | null
          id?: string
          in_transit_id?: string | null
          priority?: Database["public"]["Enums"]["supply_request_priority"]
          product_id?: string
          qty?: number
          received_at?: string | null
          request_number?: string
          source_name?: string | null
          source_type?: Database["public"]["Enums"]["supply_request_source_type"]
          source_warehouse_id?: string | null
          status?: Database["public"]["Enums"]["supply_request_status"]
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      transport_request_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          comment: string | null
          from_status:
            | Database["public"]["Enums"]["transport_request_status"]
            | null
          id: string
          route_id: string
          to_status: Database["public"]["Enums"]["transport_request_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          comment?: string | null
          from_status?:
            | Database["public"]["Enums"]["transport_request_status"]
            | null
          id?: string
          route_id: string
          to_status: Database["public"]["Enums"]["transport_request_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          comment?: string | null
          from_status?:
            | Database["public"]["Enums"]["transport_request_status"]
            | null
          id?: string
          route_id?: string
          to_status?: Database["public"]["Enums"]["transport_request_status"]
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          body_height_m: number | null
          body_length_m: number | null
          body_type: Database["public"]["Enums"]["body_type"]
          body_width_m: number | null
          brand: string | null
          capacity_kg: number | null
          carrier_id: string
          comment: string | null
          created_at: string
          has_manipulator: boolean
          has_straps: boolean
          has_tent: boolean
          id: string
          is_active: boolean
          model: string | null
          photo_back_url: string | null
          photo_documents_url: string | null
          photo_front_url: string | null
          photo_inside_url: string | null
          photo_left_url: string | null
          photo_right_url: string | null
          plate_number: string
          tie_rings_count: number
          updated_at: string
          volume_m3: number | null
        }
        Insert: {
          body_height_m?: number | null
          body_length_m?: number | null
          body_type?: Database["public"]["Enums"]["body_type"]
          body_width_m?: number | null
          brand?: string | null
          capacity_kg?: number | null
          carrier_id: string
          comment?: string | null
          created_at?: string
          has_manipulator?: boolean
          has_straps?: boolean
          has_tent?: boolean
          id?: string
          is_active?: boolean
          model?: string | null
          photo_back_url?: string | null
          photo_documents_url?: string | null
          photo_front_url?: string | null
          photo_inside_url?: string | null
          photo_left_url?: string | null
          photo_right_url?: string | null
          plate_number: string
          tie_rings_count?: number
          updated_at?: string
          volume_m3?: number | null
        }
        Update: {
          body_height_m?: number | null
          body_length_m?: number | null
          body_type?: Database["public"]["Enums"]["body_type"]
          body_width_m?: number | null
          brand?: string | null
          capacity_kg?: number | null
          carrier_id?: string
          comment?: string | null
          created_at?: string
          has_manipulator?: boolean
          has_straps?: boolean
          has_tent?: boolean
          id?: string
          is_active?: boolean
          model?: string | null
          photo_back_url?: string | null
          photo_documents_url?: string | null
          photo_front_url?: string | null
          photo_inside_url?: string | null
          photo_left_url?: string | null
          photo_right_url?: string | null
          plate_number?: string
          tie_rings_count?: number
          updated_at?: string
          volume_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_dock_slots: {
        Row: {
          arrived_at: string | null
          cargo_summary: string | null
          carrier_name: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          driver_id: string | null
          driver_name: string | null
          end_time: string | null
          expected_arrival_at: string | null
          id: string
          notes: string | null
          route_id: string | null
          slot_date: string
          slot_kind: Database["public"]["Enums"]["dock_slot_kind"]
          start_time: string
          status: Database["public"]["Enums"]["dock_slot_status"]
          updated_at: string
          vehicle_id: string | null
          vehicle_plate: string | null
          warehouse_id: string
        }
        Insert: {
          arrived_at?: string | null
          cargo_summary?: string | null
          carrier_name?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          driver_id?: string | null
          driver_name?: string | null
          end_time?: string | null
          expected_arrival_at?: string | null
          id?: string
          notes?: string | null
          route_id?: string | null
          slot_date?: string
          slot_kind: Database["public"]["Enums"]["dock_slot_kind"]
          start_time: string
          status?: Database["public"]["Enums"]["dock_slot_status"]
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate?: string | null
          warehouse_id: string
        }
        Update: {
          arrived_at?: string | null
          cargo_summary?: string | null
          carrier_name?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          driver_id?: string | null
          driver_name?: string | null
          end_time?: string | null
          expected_arrival_at?: string | null
          id?: string
          notes?: string | null
          route_id?: string | null
          slot_date?: string
          slot_kind?: Database["public"]["Enums"]["dock_slot_kind"]
          start_time?: string
          status?: Database["public"]["Enums"]["dock_slot_status"]
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate?: string | null
          warehouse_id?: string
        }
        Relationships: []
      }
      warehouse_staff: {
        Row: {
          comment: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["warehouse_staff_role"]
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["warehouse_staff_role"]
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["warehouse_staff_role"]
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string | null
          breaks: Json
          city: string | null
          contact_person: string | null
          created_at: string
          delivery_radius_km: number | null
          delivery_zone: string | null
          external_id: string | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          manager_name: string | null
          manager_phone: string | null
          name: string
          notes: string | null
          phone: string | null
          source: string
          updated_at: string
          working_hours: Json
        }
        Insert: {
          address?: string | null
          breaks?: Json
          city?: string | null
          contact_person?: string | null
          created_at?: string
          delivery_radius_km?: number | null
          delivery_zone?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          manager_name?: string | null
          manager_phone?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string
          updated_at?: string
          working_hours?: Json
        }
        Update: {
          address?: string | null
          breaks?: Json
          city?: string | null
          contact_person?: string | null
          created_at?: string
          delivery_radius_km?: number | null
          delivery_zone?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          manager_name?: string | null
          manager_phone?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string
          updated_at?: string
          working_hours?: Json
        }
        Relationships: []
      }
    }
    Views: {
      stock_balances: {
        Row: {
          available: number | null
          deficit_level: string | null
          in_transit: number | null
          is_critical: boolean | null
          min_stock: number | null
          on_hand: number | null
          product_id: string | null
          product_name: string | null
          reserved: number | null
          safety_stock: number | null
          sku: string | null
          unit: string | null
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calc_order_delivery_cost: {
        Args: { p_order_id: string }
        Returns: number
      }
      generate_delivery_route_number: { Args: never; Returns: string }
      generate_route_number: { Args: never; Returns: string }
      generate_supply_request_number: { Args: never; Returns: string }
      notify_low_stock_for_product: {
        Args: { p_product_id: string; p_warehouse_id: string }
        Returns: undefined
      }
      pick_delivery_tariff: {
        Args: {
          p_order_city: string
          p_order_zone: string
          p_warehouse_city: string
          p_warehouse_id: string
        }
        Returns: {
          base_price: number | null
          city: string | null
          comment: string | null
          created_at: string
          destination_city: string | null
          fixed_price: number | null
          goods_percent: number | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["tariff_kind"]
          locality: string | null
          min_price: number | null
          name: string
          price_per_km: number | null
          price_per_point: number | null
          priority: number
          radius_km: number | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          warehouse_id: string
          zone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "delivery_tariffs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recalc_route_costs: { Args: { p_route_id: string }; Returns: undefined }
      recalc_route_etas: { Args: { p_route_id: string }; Returns: undefined }
      recalc_route_totals: { Args: { p_route_id: string }; Returns: undefined }
    }
    Enums: {
      body_type:
        | "tent"
        | "isotherm"
        | "refrigerator"
        | "flatbed"
        | "closed_van"
        | "manipulator"
        | "tipper"
        | "container"
        | "car_carrier"
        | "other"
        | "gazelle"
        | "sideboard"
        | "long_vehicle"
      carrier_type: "self_employed" | "ip" | "ooo"
      carrier_verification_status: "new" | "in_review" | "approved" | "rejected"
      delivery_cost_source: "auto" | "manual" | "tariff"
      delivery_route_status: "draft" | "formed" | "in_progress" | "completed"
      dock_slot_kind: "shipment" | "inbound_factory" | "inbound_return"
      dock_slot_status:
        | "planned"
        | "arrived"
        | "loading"
        | "loaded"
        | "done"
        | "cancelled"
      eta_risk_level: "on_time" | "tight" | "late" | "unknown"
      order_status:
        | "new"
        | "in_progress"
        | "delivering"
        | "completed"
        | "cancelled"
        | "delivered"
        | "not_delivered"
        | "defective"
        | "awaiting_resend"
        | "ready_for_delivery"
      payment_status: "not_paid" | "partial" | "paid" | "refunded"
      payment_type: "cash" | "card" | "online" | "qr"
      point_status:
        | "pending"
        | "arrived"
        | "completed"
        | "failed"
        | "returned_to_warehouse"
        | "defective"
        | "no_payment"
        | "no_qr"
        | "client_no_answer"
        | "client_absent"
        | "client_refused"
        | "no_unloading"
        | "problem"
      route_status: "planned" | "in_progress" | "completed" | "cancelled"
      supply_request_priority: "low" | "normal" | "high" | "urgent"
      supply_request_source_type: "factory" | "warehouse"
      supply_request_status:
        | "draft"
        | "pending"
        | "confirmed"
        | "in_transit"
        | "received"
        | "cancelled"
      tariff_kind:
        | "fixed_city"
        | "fixed_zone"
        | "fixed_direction"
        | "per_km_round"
        | "per_km_last"
        | "per_point"
        | "combo"
        | "percent_goods"
        | "manual"
      transport_request_priority: "low" | "medium" | "high" | "urgent"
      transport_request_status:
        | "draft"
        | "ready_for_planning"
        | "needs_review"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      transport_request_type:
        | "client_delivery"
        | "warehouse_transfer"
        | "factory_to_warehouse"
      warehouse_staff_role: "manager" | "storekeeper"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      body_type: [
        "tent",
        "isotherm",
        "refrigerator",
        "flatbed",
        "closed_van",
        "manipulator",
        "tipper",
        "container",
        "car_carrier",
        "other",
        "gazelle",
        "sideboard",
        "long_vehicle",
      ],
      carrier_type: ["self_employed", "ip", "ooo"],
      carrier_verification_status: ["new", "in_review", "approved", "rejected"],
      delivery_cost_source: ["auto", "manual", "tariff"],
      delivery_route_status: ["draft", "formed", "in_progress", "completed"],
      dock_slot_kind: ["shipment", "inbound_factory", "inbound_return"],
      dock_slot_status: [
        "planned",
        "arrived",
        "loading",
        "loaded",
        "done",
        "cancelled",
      ],
      eta_risk_level: ["on_time", "tight", "late", "unknown"],
      order_status: [
        "new",
        "in_progress",
        "delivering",
        "completed",
        "cancelled",
        "delivered",
        "not_delivered",
        "defective",
        "awaiting_resend",
        "ready_for_delivery",
      ],
      payment_status: ["not_paid", "partial", "paid", "refunded"],
      payment_type: ["cash", "card", "online", "qr"],
      point_status: [
        "pending",
        "arrived",
        "completed",
        "failed",
        "returned_to_warehouse",
        "defective",
        "no_payment",
        "no_qr",
        "client_no_answer",
        "client_absent",
        "client_refused",
        "no_unloading",
        "problem",
      ],
      route_status: ["planned", "in_progress", "completed", "cancelled"],
      supply_request_priority: ["low", "normal", "high", "urgent"],
      supply_request_source_type: ["factory", "warehouse"],
      supply_request_status: [
        "draft",
        "pending",
        "confirmed",
        "in_transit",
        "received",
        "cancelled",
      ],
      tariff_kind: [
        "fixed_city",
        "fixed_zone",
        "fixed_direction",
        "per_km_round",
        "per_km_last",
        "per_point",
        "combo",
        "percent_goods",
        "manual",
      ],
      transport_request_priority: ["low", "medium", "high", "urgent"],
      transport_request_status: [
        "draft",
        "ready_for_planning",
        "needs_review",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      transport_request_type: [
        "client_delivery",
        "warehouse_transfer",
        "factory_to_warehouse",
      ],
      warehouse_staff_role: ["manager", "storekeeper"],
    },
  },
} as const
