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
      orders: {
        Row: {
          access_instructions: string | null
          cash_received: boolean
          comment: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          delivery_address: string | null
          delivery_photo_url: string | null
          external_id: string | null
          id: string
          items_count: number | null
          landmarks: string | null
          latitude: number | null
          longitude: number | null
          map_link: string | null
          order_number: string
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
          cash_received?: boolean
          comment?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_photo_url?: string | null
          external_id?: string | null
          id?: string
          items_count?: number | null
          landmarks?: string | null
          latitude?: number | null
          longitude?: number | null
          map_link?: string | null
          order_number: string
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
          cash_received?: boolean
          comment?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          delivery_address?: string | null
          delivery_photo_url?: string | null
          external_id?: string | null
          id?: string
          items_count?: number | null
          landmarks?: string | null
          latitude?: number | null
          longitude?: number | null
          map_link?: string | null
          order_number?: string
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
          completed_at: string | null
          created_at: string
          id: string
          order_id: string
          planned_time: string | null
          point_number: number
          route_id: string
          status: Database["public"]["Enums"]["point_status"]
        }
        Insert: {
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          order_id: string
          planned_time?: string | null
          point_number: number
          route_id: string
          status?: Database["public"]["Enums"]["point_status"]
        }
        Update: {
          arrived_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          order_id?: string
          planned_time?: string | null
          point_number?: number
          route_id?: string
          status?: Database["public"]["Enums"]["point_status"]
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
          comment: string | null
          created_at: string
          destination_warehouse_id: string | null
          driver_id: string | null
          driver_name: string | null
          id: string
          planned_departure_at: string | null
          points_count: number
          request_type: Database["public"]["Enums"]["transport_request_type"]
          required_body_type: Database["public"]["Enums"]["body_type"] | null
          required_capacity_kg: number | null
          required_volume_m3: number | null
          route_date: string
          route_number: string
          status: Database["public"]["Enums"]["route_status"]
          total_volume_m3: number
          total_weight_kg: number
          updated_at: string
          vehicle_id: string | null
          warehouse_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          destination_warehouse_id?: string | null
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          planned_departure_at?: string | null
          points_count?: number
          request_type?: Database["public"]["Enums"]["transport_request_type"]
          required_body_type?: Database["public"]["Enums"]["body_type"] | null
          required_capacity_kg?: number | null
          required_volume_m3?: number | null
          route_date?: string
          route_number: string
          status?: Database["public"]["Enums"]["route_status"]
          total_volume_m3?: number
          total_weight_kg?: number
          updated_at?: string
          vehicle_id?: string | null
          warehouse_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          destination_warehouse_id?: string | null
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          planned_departure_at?: string | null
          points_count?: number
          request_type?: Database["public"]["Enums"]["transport_request_type"]
          required_body_type?: Database["public"]["Enums"]["body_type"] | null
          required_capacity_kg?: number | null
          required_volume_m3?: number | null
          route_date?: string
          route_number?: string
          status?: Database["public"]["Enums"]["route_status"]
          total_volume_m3?: number
          total_weight_kg?: number
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
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
    }
    Functions: {
      generate_route_number: { Args: never; Returns: string }
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
      carrier_type: "self_employed" | "ip" | "ooo"
      carrier_verification_status: "new" | "in_review" | "approved" | "rejected"
      dock_slot_kind: "shipment" | "inbound_factory" | "inbound_return"
      dock_slot_status:
        | "planned"
        | "arrived"
        | "loading"
        | "loaded"
        | "done"
        | "cancelled"
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
      ],
      carrier_type: ["self_employed", "ip", "ooo"],
      carrier_verification_status: ["new", "in_review", "approved", "rejected"],
      dock_slot_kind: ["shipment", "inbound_factory", "inbound_return"],
      dock_slot_status: [
        "planned",
        "arrived",
        "loading",
        "loaded",
        "done",
        "cancelled",
      ],
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
      ],
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
      transport_request_type: [
        "client_delivery",
        "warehouse_transfer",
        "factory_to_warehouse",
      ],
      warehouse_staff_role: ["manager", "storekeeper"],
    },
  },
} as const
