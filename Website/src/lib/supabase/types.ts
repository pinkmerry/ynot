export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_user_id: string | null;
          line_user_id: string | null;
          line_display_name: string | null;
          line_picture_url: string | null;
          email: string | null;
          email_verified_at: string | null;
          phone_verified_at: string | null;
          display_name: string | null;
          avatar_url: string | null;
          profile_status: "active" | "disabled" | "merged";
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
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id?: string | null;
          line_user_id?: string | null;
          line_display_name?: string | null;
          line_picture_url?: string | null;
          email?: string | null;
          email_verified_at?: string | null;
          phone_verified_at?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          profile_status?: "active" | "disabled" | "merged";
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
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      pending_signup_email_codes: {
        Row: {
          id: string;
          email: string;
          code_hash: string;
          setup_token_hash: string | null;
          expires_at: string;
          setup_expires_at: string | null;
          attempts: number;
          resend_count: number;
          last_sent_at: string | null;
          verified_at: string | null;
          consumed_at: string | null;
          created_at: string;
          updated_at: string;
          ip_address: string | null;
          user_agent: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          code_hash: string;
          setup_token_hash?: string | null;
          expires_at: string;
          setup_expires_at?: string | null;
          attempts?: number;
          resend_count?: number;
          last_sent_at?: string | null;
          verified_at?: string | null;
          consumed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["pending_signup_email_codes"]["Insert"]>;
        Relationships: [];
      };
      user_identities: {
        Row: {
          id: string;
          profile_id: string;
          auth_user_id: string | null;
          provider: "email" | "google" | "line";
          provider_subject: string;
          email: string | null;
          email_verified: boolean;
          display_name: string | null;
          avatar_url: string | null;
          metadata: Json;
          linked_at: string;
          last_seen_at: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          auth_user_id?: string | null;
          provider: "email" | "google" | "line";
          provider_subject: string;
          email?: string | null;
          email_verified?: boolean;
          display_name?: string | null;
          avatar_url?: string | null;
          metadata?: Json;
          linked_at?: string;
          last_seen_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["user_identities"]["Insert"]>;
        Relationships: [];
      };
      user_addresses: {
        Row: {
          id: string;
          profile_id: string;
          label: string;
          recipient_name: string | null;
          phone: string | null;
          address_line1: string;
          address_line2: string | null;
          subdistrict: string | null;
          district: string | null;
          province: string | null;
          postal_code: string | null;
          country: string;
          delivery_note: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          label?: string;
          recipient_name?: string | null;
          phone?: string | null;
          address_line1: string;
          address_line2?: string | null;
          subdistrict?: string | null;
          district?: string | null;
          province?: string | null;
          postal_code?: string | null;
          country?: string;
          delivery_note?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_addresses"]["Insert"]>;
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
          approval_status:
            | "not_submitted"
            | "pending_review"
            | "approved"
            | "rejected"
            | "changes_requested";
          approval_requested_by: string | null;
          approval_requested_at: string | null;
          approved_by: string | null;
          approved_at: string | null;
          rejected_by: string | null;
          rejected_at: string | null;
          approval_notes: string | null;
          logic_snapshot: Json;
          series: "one_piece" | "pokemon";
          title_th: string;
          title_en: string;
          price_thb: number;
          total_slots: number;
          pack_code: string | null;
          last_prize_card_id: string | null;
          last_prize_metadata: Json | null;
          order_code_prefix: string;
          facebook_live_url: string | null;
          youtube_embed_url: string | null;
          promptpay_id: string | null;
          promptpay_qr_image_url: string | null;
          featured_cards: Json;
          chase_cards: Json;
          display_tags: string[];
          mode: "slot_pick" | "instant_gacha";
          cost_coins: number | null;
          opens_total_limit: number | null;
          per_user_limit: number | null;
          ends_at: string | null;
          visibility: "public" | "hidden" | "private";
          sort_order: number;
          bank_name: string | null;
          bank_account_name: string | null;
          bank_account_number: string | null;
          starts_at: string | null;
          created_by: string | null;
          is_test: boolean;
          seed_run_id: string | null;
          test_metadata: Json;
          convert_deadline_days: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          status?: "draft" | "live" | "closed" | "archived";
          approval_status?:
            | "not_submitted"
            | "pending_review"
            | "approved"
            | "rejected"
            | "changes_requested";
          approval_requested_by?: string | null;
          approval_requested_at?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          rejected_by?: string | null;
          rejected_at?: string | null;
          approval_notes?: string | null;
          logic_snapshot?: Json;
          series: "one_piece" | "pokemon";
          title_th: string;
          title_en: string;
          price_thb: number;
          total_slots: number;
          pack_code?: string | null;
          last_prize_card_id?: string | null;
          last_prize_metadata?: Json | null;
          order_code_prefix?: string;
          facebook_live_url?: string | null;
          youtube_embed_url?: string | null;
          promptpay_id?: string | null;
          promptpay_qr_image_url?: string | null;
          featured_cards?: Json;
          chase_cards?: Json;
          display_tags?: string[];
          mode?: "slot_pick" | "instant_gacha";
          cost_coins?: number | null;
          opens_total_limit?: number | null;
          per_user_limit?: number | null;
          ends_at?: string | null;
          visibility?: "public" | "hidden" | "private";
          sort_order?: number;
          bank_name?: string | null;
          bank_account_name?: string | null;
          bank_account_number?: string | null;
          starts_at?: string | null;
          created_by?: string | null;
          is_test?: boolean;
          seed_run_id?: string | null;
          test_metadata?: Json;
          convert_deadline_days?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["draw_rounds"]["Insert"]>;
        Relationships: [];
      };
      seed_runs: {
        Row: { id: string; seed_key: string; label: string; environment: "local" | "staging" | "production"; status: "planned" | "dry_run" | "applied" | "hidden" | "cleanup_started" | "cleaned" | "failed"; applied_by_admin_id: string | null; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; seed_key: string; label: string; environment?: "local" | "staging" | "production"; status?: "planned" | "dry_run" | "applied" | "hidden" | "cleanup_started" | "cleaned" | "failed"; applied_by_admin_id?: string | null; metadata?: Json; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["seed_runs"]["Insert"]>;
        Relationships: [];
      };
      seed_run_items: {
        Row: { id: string; seed_run_id: string; table_name: string; row_id: string | null; row_key: string | null; action: "planned" | "upserted" | "hidden" | "voided" | "skipped" | "failed"; metadata: Json; created_at: string };
        Insert: { id?: string; seed_run_id: string; table_name: string; row_id?: string | null; row_key?: string | null; action: "planned" | "upserted" | "hidden" | "voided" | "skipped" | "failed"; metadata?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["seed_run_items"]["Insert"]>;
        Relationships: [];
      };
      store_categories: {
        Row: { id: string; slug: string; name_th: string; name_en: string; description: string | null; image_url: string | null; icon: string | null; legacy_series: "pokemon" | "one_piece" | null; sort_order: number; is_active: boolean; is_test: boolean; seed_run_id: string | null; metadata: Json; created_by_admin_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; slug: string; name_th: string; name_en: string; description?: string | null; image_url?: string | null; icon?: string | null; legacy_series?: "pokemon" | "one_piece" | null; sort_order?: number; is_active?: boolean; is_test?: boolean; seed_run_id?: string | null; metadata?: Json; created_by_admin_id?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["store_categories"]["Insert"]>;
        Relationships: [];
      };
      draw_round_categories: {
        Row: { draw_round_id: string; category_id: string; is_primary: boolean; created_at: string };
        Insert: { draw_round_id: string; category_id: string; is_primary?: boolean; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["draw_round_categories"]["Insert"]>;
        Relationships: [];
      };
      draw_round_testers: {
        Row: { draw_round_id: string; profile_id: string; added_by_admin_id: string | null; seed_run_id: string | null; created_at: string };
        Insert: { draw_round_id: string; profile_id: string; added_by_admin_id?: string | null; seed_run_id?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["draw_round_testers"]["Insert"]>;
        Relationships: [];
      };
      card_options: {
        Row: {
          id: string;
          kind: "set" | "variant" | "language" | "release_year" | "brand" | "catalog_category";
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind: "set" | "variant" | "language" | "release_year" | "brand" | "catalog_category";
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["card_options"]["Insert"]>;
        Relationships: [];
      };
      cards: {
        Row: {
          id: string;
          card_code: string | null;
          card_number: string | null;
          name: string;
          search_name: string;
          search_code: string | null;
          series: string;
          grade: string;
          prize_category: string;
          language: string | null;
          release_year: number | null;
          card_set: string | null;
          variant: string | null;
          catalog_category: string;
          condition: "sealed" | "raw" | "graded";
          grading_service: "psa" | "bgs" | "cgc" | "other" | null;
          cert_number: string | null;
          gemrate_id: string | null;
          image_url: string | null;
          image_storage_path: string | null;
          is_test: boolean;
          seed_run_id: string | null;
          asset_source: string | null;
          asset_license: string | null;
          asset_manifest_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          card_code?: string | null;
          card_number?: string | null;
          name: string;
          search_name: string;
          search_code?: string | null;
          series: string;
          grade: string;
          prize_category?: string;
          language?: string | null;
          release_year?: number | null;
          card_set?: string | null;
          variant?: string | null;
          catalog_category?: string;
          condition?: "sealed" | "raw" | "graded";
          grading_service?: "psa" | "bgs" | "cgc" | "other" | null;
          cert_number?: string | null;
          gemrate_id?: string | null;
          image_url?: string | null;
          image_storage_path?: string | null;
          is_test?: boolean;
          seed_run_id?: string | null;
          asset_source?: string | null;
          asset_license?: string | null;
          asset_manifest_key?: string | null;
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
          convert_coin_value: number;
          weight: number;
          unlock_at_sold_pct: number;
          planned_quantity: number;
          bundle_quantity: number;
          is_test: boolean;
          seed_run_id: string | null;
          metadata: Json;
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
          convert_coin_value?: number;
          weight?: number;
          unlock_at_sold_pct?: number;
          planned_quantity?: number;
          bundle_quantity?: number;
          is_test?: boolean;
          seed_run_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["draw_round_prizes"]["Insert"]>;
        Relationships: [];
      };
      draw_round_prize_units: {
        Row: { id: string; draw_round_id: string; draw_round_prize_id: string; card_id: string; card_stock_unit_id: string | null; status: "available" | "reserved" | "awarded" | "void"; profile_id: string | null; gacha_open_id: string | null; gacha_open_item_id: string | null; collection_item_id: string | null; seed_run_id: string | null; awarded_at: string | null; voided_at: string | null; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; draw_round_id: string; draw_round_prize_id: string; card_id: string; card_stock_unit_id?: string | null; status?: "available" | "reserved" | "awarded" | "void"; profile_id?: string | null; gacha_open_id?: string | null; gacha_open_item_id?: string | null; collection_item_id?: string | null; seed_run_id?: string | null; awarded_at?: string | null; voided_at?: string | null; metadata?: Json; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["draw_round_prize_units"]["Insert"]>;
        Relationships: [];
      };
      card_stock_units: {
        Row: { id: string; card_id: string; status: "available" | "reserved" | "allocated" | "archived" | "deleted"; source_type: string; source_id: string | null; created_by_admin_id: string | null; reserved_by_admin_id: string | null; allocated_draw_round_id: string | null; allocated_draw_round_prize_id: string | null; metadata: Json; condition: string; grade: string | null; grading_service: string | null; cert_number: string | null; gemrate_id: string | null; image_url: string | null; image_storage_path: string | null; quantity: number; created_at: string; updated_at: string };
        Insert: { id?: string; card_id: string; status?: "available" | "reserved" | "allocated" | "archived" | "deleted"; source_type?: string; source_id?: string | null; created_by_admin_id?: string | null; reserved_by_admin_id?: string | null; allocated_draw_round_id?: string | null; allocated_draw_round_prize_id?: string | null; metadata?: Json; condition?: string; grade?: string | null; grading_service?: string | null; cert_number?: string | null; gemrate_id?: string | null; image_url?: string | null; image_storage_path?: string | null; quantity?: number; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["card_stock_units"]["Insert"]>;
        Relationships: [];
      };
      card_stock_reservations: {
        Row: { id: string; stock_unit_id: string; draw_round_id: string; draw_round_prize_id: string; status: "reserved" | "allocated" | "released" | "expired" | "cancelled"; reserved_by_admin_id: string | null; allocated_by_admin_id: string | null; released_by_admin_id: string | null; reserved_at: string; allocated_at: string | null; released_at: string | null; expires_at: string | null; metadata: Json; created_at: string; updated_at: string };
        Insert: { id?: string; stock_unit_id: string; draw_round_id: string; draw_round_prize_id: string; status?: "reserved" | "allocated" | "released" | "expired" | "cancelled"; reserved_by_admin_id?: string | null; allocated_by_admin_id?: string | null; released_by_admin_id?: string | null; reserved_at?: string; allocated_at?: string | null; released_at?: string | null; expires_at?: string | null; metadata?: Json; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["card_stock_reservations"]["Insert"]>;
        Relationships: [];
      };
      card_stock_ledger: {
        Row: { id: string; stock_unit_id: string | null; card_id: string | null; draw_round_id: string | null; draw_round_prize_id: string | null; event_type: "stock_created" | "reserved" | "reservation_released" | "allocated" | "unit_materialized" | "archived" | "deleted" | "edited" | "approval_failed"; actor_admin_id: string | null; metadata: Json; created_at: string };
        Insert: { id?: string; stock_unit_id?: string | null; card_id?: string | null; draw_round_id?: string | null; draw_round_prize_id?: string | null; event_type: "stock_created" | "reserved" | "reservation_released" | "allocated" | "unit_materialized" | "archived" | "deleted" | "edited" | "approval_failed"; actor_admin_id?: string | null; metadata?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["card_stock_ledger"]["Insert"]>;
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
      payment_methods: {
        Row: {
          id: string;
          code: string;
          type: "bank_transfer" | "promptpay_qr";
          display_name: string;
          bank_name: string | null;
          account_name: string | null;
          account_number: string | null;
          promptpay_id: string | null;
          qr_image_path: string | null;
          instructions: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          type: "bank_transfer" | "promptpay_qr";
          display_name: string;
          bank_name?: string | null;
          account_name?: string | null;
          account_number?: string | null;
          promptpay_id?: string | null;
          qr_image_path?: string | null;
          instructions?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payment_methods"]["Insert"]>;
        Relationships: [];
      };
      top_up_requests: {
        Row: {
          id: string;
          public_code: string;
          profile_id: string;
          payment_method_id: string | null;
          amount_thb: number;
          coin_amount: number;
          status: "pending_slip" | "pending_review" | "approved" | "rejected" | "cancelled" | "expired";
          submitted_at: string | null;
          reviewed_by_admin_id: string | null;
          reviewed_at: string | null;
          admin_note: string | null;
          customer_note: string | null;
          idempotency_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          public_code?: string;
          profile_id: string;
          payment_method_id?: string | null;
          amount_thb: number;
          coin_amount: number;
          status?: "pending_slip" | "pending_review" | "approved" | "rejected" | "cancelled" | "expired";
          submitted_at?: string | null;
          reviewed_by_admin_id?: string | null;
          reviewed_at?: string | null;
          admin_note?: string | null;
          customer_note?: string | null;
          idempotency_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["top_up_requests"]["Insert"]>;
        Relationships: [];
      };
      wallet_accounts: {
        Row: { profile_id: string; balance_coins: number; version: number; created_at: string; updated_at: string };
        Insert: { profile_id: string; balance_coins?: number; version?: number; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["wallet_accounts"]["Insert"]>;
        Relationships: [];
      };
      coin_ledger: {
        Row: {
          id: string;
          profile_id: string;
          wallet_profile_id: string;
          entry_type: "top_up" | "gacha_spend" | "refund" | "admin_adjustment" | "exchange_fee" | "shipping_fee" | "exchange_credit";
          amount_coins: number;
          balance_before: number;
          balance_after: number;
          reference_type: string | null;
          reference_id: string | null;
          idempotency_key: string | null;
          created_by_admin_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          wallet_profile_id: string;
          entry_type: "top_up" | "gacha_spend" | "refund" | "admin_adjustment" | "exchange_fee" | "shipping_fee" | "exchange_credit";
          amount_coins: number;
          balance_before: number;
          balance_after: number;
          reference_type?: string | null;
          reference_id?: string | null;
          idempotency_key?: string | null;
          created_by_admin_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["coin_ledger"]["Insert"]>;
        Relationships: [];
      };
      gacha_opens: {
        Row: { id: string; public_code: string; profile_id: string; draw_round_id: string; cost_coins: number; quantity: number; status: "reserved" | "completed" | "failed" | "refunded"; ledger_entry_id: string | null; idempotency_key: string | null; metadata: Json; opened_at: string; created_at: string };
        Insert: { id?: string; public_code?: string; profile_id: string; draw_round_id: string; cost_coins: number; quantity?: number; status?: "reserved" | "completed" | "failed" | "refunded"; ledger_entry_id?: string | null; idempotency_key?: string | null; metadata?: Json; opened_at?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["gacha_opens"]["Insert"]>;
        Relationships: [];
      };
      gacha_open_items: {
        Row: { id: string; gacha_open_id: string; card_id: string; draw_round_prize_id: string | null; draw_round_prize_unit_id: string | null; bundle_quantity: number; tier: string | null; value_thb: number | null; result_position: number; created_at: string };
        Insert: { id?: string; gacha_open_id: string; card_id: string; draw_round_prize_id?: string | null; draw_round_prize_unit_id?: string | null; bundle_quantity?: number; tier?: string | null; value_thb?: number | null; result_position?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["gacha_open_items"]["Insert"]>;
        Relationships: [];
      };
      collection_items: {
        Row: { id: string; profile_id: string; card_id: string; source_type: "gacha_open" | "admin_grant" | "legacy_import"; source_id: string | null; status: "owned" | "locked" | "exchange_requested" | "exchanged" | "shipping_requested" | "shipped" | "void"; serial_no: string | null; acquired_at: string; convert_coin_value_snapshot: number | null; convert_expires_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; profile_id: string; card_id: string; source_type: "gacha_open" | "admin_grant" | "legacy_import"; source_id?: string | null; status?: "owned" | "locked" | "exchange_requested" | "exchanged" | "shipping_requested" | "shipped" | "void"; serial_no?: string | null; acquired_at?: string; convert_coin_value_snapshot?: number | null; convert_expires_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["collection_items"]["Insert"]>;
        Relationships: [];
      };
      exchange_orders: {
        Row: { id: string; public_code: string; profile_id: string; status: "draft" | "submitted" | "approved" | "rejected" | "completed" | "cancelled"; requested_coin_value: number; approved_coin_value: number | null; reviewed_by_admin_id: string | null; customer_note: string | null; admin_note: string | null; idempotency_key: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; public_code?: string; profile_id: string; status?: "draft" | "submitted" | "approved" | "rejected" | "completed" | "cancelled"; requested_coin_value?: number; approved_coin_value?: number | null; reviewed_by_admin_id?: string | null; customer_note?: string | null; admin_note?: string | null; idempotency_key?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["exchange_orders"]["Insert"]>;
        Relationships: [];
      };
      exchange_order_items: {
        Row: { exchange_order_id: string; collection_item_id: string; card_id: string; coin_value_snapshot: number; created_at: string };
        Insert: { exchange_order_id: string; collection_item_id: string; card_id: string; coin_value_snapshot?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["exchange_order_items"]["Insert"]>;
        Relationships: [];
      };
      shipping_requests: {
        Row: { id: string; public_code: string; profile_id: string; address_id: string | null; address_snapshot: Json; status: "draft" | "submitted" | "packing" | "ready_for_pickup" | "picked_up" | "shipped" | "delivered" | "cancelled"; shipping_fee_coins: number; tracking_provider: string | null; tracking_number: string | null; customer_note: string | null; admin_note: string | null; idempotency_key: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; public_code?: string; profile_id: string; address_id?: string | null; address_snapshot?: Json; status?: "draft" | "submitted" | "packing" | "ready_for_pickup" | "picked_up" | "shipped" | "delivered" | "cancelled"; shipping_fee_coins?: number; tracking_provider?: string | null; tracking_number?: string | null; customer_note?: string | null; admin_note?: string | null; idempotency_key?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["shipping_requests"]["Insert"]>;
        Relationships: [];
      };
      shipping_request_items: {
        Row: { shipping_request_id: string; collection_item_id: string; card_id: string; created_at: string };
        Insert: { shipping_request_id: string; collection_item_id: string; card_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["shipping_request_items"]["Insert"]>;
        Relationships: [];
      };
      account_merge_requests: {
        Row: { id: string; requested_by_profile_id: string | null; source_profile_id: string; target_profile_id: string; status: "pending" | "approved" | "rejected" | "completed" | "cancelled"; reason: string | null; risk_summary: Json; approved_by_admin_id: string | null; completed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; requested_by_profile_id?: string | null; source_profile_id: string; target_profile_id: string; status?: "pending" | "approved" | "rejected" | "completed" | "cancelled"; reason?: string | null; risk_summary?: Json; approved_by_admin_id?: string | null; completed_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["account_merge_requests"]["Insert"]>;
        Relationships: [];
      };
      account_merge_events: {
        Row: { id: string; merge_request_id: string; event_type: "created" | "risk_reviewed" | "approved" | "rejected" | "completed" | "cancelled" | "failed"; status_from: string | null; status_to: string | null; actor_profile_id: string | null; actor_admin_id: string | null; metadata: Json; created_at: string };
        Insert: { id?: string; merge_request_id: string; event_type: "created" | "risk_reviewed" | "approved" | "rejected" | "completed" | "cancelled" | "failed"; status_from?: string | null; status_to?: string | null; actor_profile_id?: string | null; actor_admin_id?: string | null; metadata?: Json; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["account_merge_events"]["Insert"]>;
        Relationships: [];
      };
      idempotency_keys: {
        Row: { id: string; key: string; scope: string; profile_id: string | null; request_hash: string | null; response_snapshot: Json | null; status: "started" | "completed" | "failed" | "expired"; expires_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; key: string; scope: string; profile_id?: string | null; request_hash?: string | null; response_snapshot?: Json | null; status?: "started" | "completed" | "failed" | "expired"; expires_at?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["idempotency_keys"]["Insert"]>;
        Relationships: [];
      };
      site_settings: {
        Row: { key: string; value: Json; updated_by_admin_id: string | null; updated_at: string };
        Insert: { key: string; value?: Json; updated_by_admin_id?: string | null; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["site_settings"]["Insert"]>;
        Relationships: [];
      };
      ranking_snapshots: {
        Row: { id: string; scope: string; period_start: string | null; period_end: string | null; profile_id: string; metric: string; rank: number; value: number; generated_at: string };
        Insert: { id?: string; scope?: string; period_start?: string | null; period_end?: string | null; profile_id: string; metric: string; rank: number; value?: number; generated_at?: string };
        Update: Partial<Database["public"]["Tables"]["ranking_snapshots"]["Insert"]>;
        Relationships: [];
      };
      payment_slips: {
        Row: {
          id: string;
          order_id: string | null;
          top_up_request_id: string | null;
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
          order_id?: string | null;
          top_up_request_id?: string | null;
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
          top_up_request_id: string | null;
          gacha_open_id: string | null;
          collection_item_id: string | null;
          exchange_order_id: string | null;
          shipping_request_id: string | null;
          auth_user_id: string | null;
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
          top_up_request_id?: string | null;
          gacha_open_id?: string | null;
          collection_item_id?: string | null;
          exchange_order_id?: string | null;
          shipping_request_id?: string | null;
          auth_user_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_events"]["Insert"]>;
        Relationships: [];
      };
      app_realtime_events: {
        Row: {
          id: string;
          topic:
            | "profile"
            | "wallet"
            | "topups"
            | "gacha"
            | "collection"
            | "exchange"
            | "shipping"
            | "admin"
            | "orders"
            | "payments"
            | "slots";
          profile_id: string | null;
          draw_round_id: string | null;
          order_id: string | null;
          entity_type: string | null;
          entity_id: string | null;
          admin_only: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          topic:
            | "profile"
            | "wallet"
            | "topups"
            | "gacha"
            | "collection"
            | "exchange"
            | "shipping"
            | "admin"
            | "orders"
            | "payments"
            | "slots";
          profile_id?: string | null;
          draw_round_id?: string | null;
          order_id?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          admin_only?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["app_realtime_events"]["Insert"]>;
        Relationships: [];
      };

      api_rate_limits: {
        Row: {
          key: string;
          window_start: string;
          expires_at: string;
          count: number;
          updated_at: string;
        };
        Insert: {
          key: string;
          window_start?: string;
          expires_at: string;
          count?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["api_rate_limits"]["Insert"]>;
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
          topic: "draw" | "slots" | "cards";
          draw_round_id?: string | null;
          order_id?: null;
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
      approve_top_up_request: { Args: { p_top_up_request_id: string; p_admin_id: string; p_admin_note?: string | null }; Returns: Json };
      reject_top_up_request: { Args: { p_top_up_request_id: string; p_admin_id: string; p_admin_note?: string | null }; Returns: Json };
      open_gacha_campaign: { Args: { p_profile_id: string; p_draw_round_id: string; p_quantity?: number; p_idempotency_key?: string | null }; Returns: Json };
      profile_can_open_test_draw_round: { Args: { p_draw_round_id: string; p_profile_id: string }; Returns: boolean };
      get_draw_round_inventory_summary: { Args: { p_draw_round_id?: string | null; p_profile_id?: string | null }; Returns: Json };
      ensure_draw_round_prize_units: { Args: { p_draw_round_prize_id: string; p_total_units: number; p_admin_id: string; p_seed_run_id?: string | null }; Returns: Json };
      get_card_stock_summary: { Args: { p_card_id?: string | null }; Returns: Json };
      get_admin_card_stock_subsku_summary: { Args: { p_card_id?: string | null }; Returns: Json };
      get_admin_prize_stock_summaries: { Args: { p_card_ids: string[] }; Returns: Json };
      adjust_card_stock_units: { Args: { p_card_id: string; p_quantity_delta: number; p_admin_id: string; p_source_type?: string | null; p_source_id?: string | null; p_metadata?: Json; p_condition?: string | null; p_grade?: string | null; p_grading_service?: string | null; p_cert_number?: string | null; p_gemrate_id?: string | null; p_image_url?: string | null; p_image_storage_path?: string | null }; Returns: Json };
      edit_card_stock_unit: {
        Args: {
          p_unit_id: string;
          p_admin_id: string;
          p_condition: string;
          p_grade?: string | null;
          p_grading_service?: string | null;
          p_cert_number?: string | null;
          p_gemrate_id?: string | null;
          p_image_url?: string | null;
          p_image_storage_path?: string | null;
        };
        Returns: Json;
      };
      delete_card_stock_unit: {
        Args: { p_unit_id: string; p_admin_id: string };
        Returns: Json;
      };
      card_stock_unit_matches_prize_filter: { Args: { p_unit: Database["public"]["Tables"]["card_stock_units"]["Row"]; p_prize_metadata: Json | null }; Returns: boolean };
      release_campaign_reservations: { Args: { p_draw_round_id: string; p_admin_id: string; p_reason?: string | null; p_note?: string | null }; Returns: Json };
      edit_live_campaign_inventory: { Args: { p_draw_round_id: string; p_admin_id: string; p_prizes: Json }; Returns: Json };
      submit_campaign_review: { Args: { p_draw_round_id: string; p_admin_id: string; p_logic_snapshot?: Json | null; p_note?: string | null }; Returns: Json };
      approve_campaign_inventory: { Args: { p_draw_round_id: string; p_owner_admin_id: string; p_logic_snapshot?: Json | null; p_note?: string | null }; Returns: Json };
      publish_campaign: { Args: { p_draw_round_id: string; p_owner_admin_id: string; p_note?: string | null }; Returns: Json };
      cancel_campaign_review: { Args: { p_draw_round_id: string; p_admin_id: string; p_note?: string | null }; Returns: Json };
      archive_campaign_inventory: { Args: { p_draw_round_id: string; p_admin_id: string; p_note?: string | null }; Returns: Json };
      delete_campaign_inventory: { Args: { p_draw_round_id: string; p_admin_id: string; p_note?: string | null }; Returns: Json };
      submit_card_conversion: { Args: { p_profile_id: string; p_collection_item_ids: string[]; p_idempotency_key?: string | null }; Returns: Json };
      complete_account_merge_request: { Args: { p_merge_request_id: string; p_admin_id: string; p_admin_note?: string | null }; Returns: Json };
      reject_account_merge_request: { Args: { p_merge_request_id: string; p_admin_id: string; p_admin_note?: string | null }; Returns: Json };
      approve_identity_review_request: { Args: { p_merge_request_id: string; p_admin_id: string; p_admin_note?: string | null }; Returns: Json };
      reject_identity_review_request: { Args: { p_merge_request_id: string; p_admin_id: string; p_admin_note?: string | null }; Returns: Json };
      request_shipping_for_items: { Args: { p_profile_id: string; p_address_id: string; p_collection_item_ids: string[]; p_customer_note?: string | null; p_idempotency_key?: string | null }; Returns: Json };
      update_shipping_request_status: {
        Args: {
          p_shipping_request_id: string;
          p_admin_id: string;
          p_status: "submitted" | "packing" | "ready_for_pickup" | "picked_up" | "shipped" | "delivered" | "cancelled";
          p_tracking_provider?: string | null;
          p_tracking_number?: string | null;
          p_admin_note?: string | null;
        };
        Returns: Json;
      };
      consume_api_rate_limit: { Args: { p_key: string; p_limit: number; p_window_seconds: number }; Returns: Json };
      purge_expired_api_rate_limits: { Args: Record<string, never>; Returns: number };
      link_identity_to_existing_profile: {
        Args: { p_source_profile_id: string; p_target_profile_id: string; p_reason?: string };
        Returns: string;
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
