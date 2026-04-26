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
      orders: {
        Row: {
          cash_received: boolean
          comment: string | null
          created_at: string
          delivery_address: string
          id: string
          order_number: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          qr_received: boolean
          requires_qr: boolean
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          cash_received?: boolean
          comment?: string | null
          created_at?: string
          delivery_address: string
          id?: string
          order_number: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          qr_received?: boolean
          requires_qr?: boolean
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          cash_received?: boolean
          comment?: string | null
          created_at?: string
          delivery_address?: string
          id?: string
          order_number?: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          qr_received?: boolean
          requires_qr?: boolean
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
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
          driver_name: string
          id: string
          route_date: string
          route_number: string
          status: Database["public"]["Enums"]["route_status"]
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          driver_name: string
          id?: string
          route_date?: string
          route_number: string
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          driver_name?: string
          id?: string
          route_date?: string
          route_number?: string
          status?: Database["public"]["Enums"]["route_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_route_number: { Args: never; Returns: string }
    }
    Enums: {
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
    },
  },
} as const
