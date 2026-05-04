export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          line_user_id: string;
          line_display_name: string | null;
          line_picture_url: string | null;
          preferred_language: "th" | "en";
          full_name: string | null;
          phone: string | null;
          address_line1: string | null;
          address_line2: string | null;
          subdistrict: string | null;
          district: string | null;
          province: string | null;
          postal_code: string | null;
          country: string | null;
          delivery_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          line_user_id: string;
          line_display_name?: string | null;
          line_picture_url?: string | null;
          preferred_language?: "th" | "en";
          full_name?: string | null;
          phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          subdistrict?: string | null;
          district?: string | null;
          province?: string | null;
          postal_code?: string | null;
          country?: string | null;
          delivery_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          profile_id: string;
          role: "owner" | "admin" | "staff";
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          role?: "owner" | "admin" | "staff";
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
        Relationships: [];
      };
      draw_rounds: {
        Row: {
          id: string;
          slug: string;
          status: "draft" | "live" | "closed" | "archived";
          series: "one_piece" | "pokemon";
          title_th: string;
          title_en: string;
          price_thb: number;
          total_slots: number;
          order_code_prefix: string;
          facebook_live_url: string | null;
          youtube_embed_url: string | null;
          promptpay_id: string | null;
          promptpay_qr_image_url: string | null;
          featured_cards: Json;
          chase_cards: Json;
          bank_name: string | null;
          bank_account_name: string | null;
          bank_account_number: string | null;
          starts_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          status?: "draft" | "live" | "closed" | "archived";
          series: "one_piece" | "pokemon";
          title_th: string;
          title_en: string;
          price_thb: number;
          total_slots: number;
          order_code_prefix?: string;
          facebook_live_url?: string | null;
          youtube_embed_url?: string | null;
          promptpay_id?: string | null;
          promptpay_qr_image_url?: string | null;
          featured_cards?: Json;
          chase_cards?: Json;
          bank_name?: string | null;
          bank_account_name?: string | null;
          bank_account_number?: string | null;
          starts_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["draw_rounds"]["Insert"]>;
        Relationships: [];
      };
      cards: {
        Row: {
          id: string;
          card_code: string | null;
          name: string;
          search_name: string;
          search_code: string | null;
          series: "one_piece" | "pokemon";
          grade: string;
          tone: "red" | "gold" | "blue" | "green" | "rose" | "violet";
          image_url: string | null;
          image_storage_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          card_code?: string | null;
          name: string;
          search_name: string;
          search_code?: string | null;
          series: "one_piece" | "pokemon";
          grade: string;
          tone?: "red" | "gold" | "blue" | "green" | "rose" | "violet";
          image_url?: string | null;
          image_storage_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cards"]["Insert"]>;
        Relationships: [];
      };
      draw_round_prizes: {
        Row: {
          id: string;
          draw_round_id: string;
          card_id: string;
          tier: "normal" | "high";
          rank: number;
          value_thb: number | null;
          tone: "red" | "gold" | "blue" | "green" | "rose" | "violet" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          draw_round_id: string;
          card_id: string;
          tier: "normal" | "high";
          rank: number;
          value_thb?: number | null;
          tone?: "red" | "gold" | "blue" | "green" | "rose" | "violet" | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["draw_round_prizes"]["Insert"]>;
        Relationships: [];
      };
      draw_slots: {
        Row: {
          id: string;
          draw_round_id: string;
          slot_number: number;
          status: "available" | "picked" | "opened" | "void";
          opened_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          draw_round_id: string;
          slot_number: number;
          status?: "available" | "picked" | "opened" | "void";
          opened_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["draw_slots"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          public_code: string;
          draw_round_id: string;
          profile_id: string;
          quantity: number;
          amount_thb: number;
          status:
            | "pending_payment_review"
            | "payment_rejected"
            | "approved_for_pick"
            | "picked"
            | "opened"
            | "cancelled";
          admin_note: string | null;
          customer_note: string | null;
          approved_by: string | null;
          approved_at: string | null;
          rejected_by: string | null;
          rejected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          public_code?: string;
          draw_round_id: string;
          profile_id: string;
          quantity: number;
          amount_thb: number;
          status?:
            | "pending_payment_review"
            | "payment_rejected"
            | "approved_for_pick"
            | "picked"
            | "opened"
            | "cancelled";
          admin_note?: string | null;
          customer_note?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          rejected_by?: string | null;
          rejected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [];
      };
      payment_slips: {
        Row: {
          id: string;
          order_id: string;
          storage_provider: "supabase" | "cloudinary" | "manual_line";
          file_path: string | null;
          file_url: string | null;
          original_filename: string | null;
          file_sha256: string | null;
          slip2go_reference_id: string | null;
          decoded_qr_hash: string | null;
          verification_status:
            | "unverified"
            | "valid"
            | "duplicate"
            | "fraud"
            | "not_found"
            | "amount_mismatch"
            | "receiver_mismatch"
            | "date_mismatch"
            | "provider_error"
            | "manual_review";
          provider_code: string | null;
          provider_message: string | null;
          provider_response: Json;
          verified_at: string | null;
          duplicate_of_slip_id: string | null;
          uploaded_at: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          storage_provider?: "supabase" | "cloudinary" | "manual_line";
          file_path?: string | null;
          file_url?: string | null;
          original_filename?: string | null;
          file_sha256?: string | null;
          slip2go_reference_id?: string | null;
          decoded_qr_hash?: string | null;
          verification_status?:
            | "unverified"
            | "valid"
            | "duplicate"
            | "fraud"
            | "not_found"
            | "amount_mismatch"
            | "receiver_mismatch"
            | "date_mismatch"
            | "provider_error"
            | "manual_review";
          provider_code?: string | null;
          provider_message?: string | null;
          provider_response?: Json;
          verified_at?: string | null;
          duplicate_of_slip_id?: string | null;
          uploaded_at?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["payment_slips"]["Insert"]>;
        Relationships: [];
      };
      order_picks: {
        Row: {
          id: string;
          order_id: string;
          draw_slot_id: string;
          picked_by_profile_id: string | null;
          picked_by_admin_id: string | null;
          pick_source: "customer" | "admin" | "system";
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          draw_slot_id: string;
          picked_by_profile_id?: string | null;
          picked_by_admin_id?: string | null;
          pick_source: "customer" | "admin" | "system";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_picks"]["Insert"]>;
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          actor_profile_id: string | null;
          actor_admin_id: string | null;
          event_type: string;
          draw_round_id: string | null;
          order_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_profile_id?: string | null;
          actor_admin_id?: string | null;
          event_type: string;
          draw_round_id?: string | null;
          order_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_events"]["Insert"]>;
        Relationships: [];
      };
      lucky_draw_realtime_events: {
        Row: {
          id: string;
          topic: "draw" | "orders" | "slots" | "payments" | "cards";
          draw_round_id: string | null;
          order_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          topic: "draw" | "orders" | "slots" | "payments" | "cards";
          draw_round_id?: string | null;
          order_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lucky_draw_realtime_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Functions: {
      create_draw_slots: {
        Args: { p_draw_round_id: string };
        Returns: number;
      };
      claim_order_slots: {
        Args: {
          p_order_id: string;
          p_slot_numbers: number[];
          p_actor_profile_id?: string | null;
          p_actor_admin_id?: string | null;
        };
        Returns: {
          order_id: string;
          slot_number: number;
          pick_source: "customer" | "admin" | "system";
        }[];
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
