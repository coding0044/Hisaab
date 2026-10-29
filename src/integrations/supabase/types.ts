export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor: string | null;
          created_at: string;
          details: Json;
          entity: string;
          entity_id: string | null;
          id: number;
        };
        Insert: {
          action: string;
          actor?: string | null;
          created_at?: string;
          details?: Json;
          entity: string;
          entity_id?: string | null;
          id?: never;
        };
        Update: {
          action?: string;
          actor?: string | null;
          created_at?: string;
          details?: Json;
          entity?: string;
          entity_id?: string | null;
          id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_fkey";
            columns: ["actor"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          is_read: boolean;
          repayment_id: string | null;
          title: string;
          transaction_id: string | null;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          repayment_id?: string | null;
          title: string;
          transaction_id?: string | null;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          repayment_id?: string | null;
          title?: string;
          transaction_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_repayment_id_fkey";
            columns: ["repayment_id"];
            isOneToOne: false;
            referencedRelation: "repayments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transaction_summary";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_proofs: {
        Row: {
          created_at: string;
          file_name: string | null;
          id: string;
          mime_type: string | null;
          repayment_id: string | null;
          storage_path: string;
          transaction_id: string | null;
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          file_name?: string | null;
          id?: string;
          mime_type?: string | null;
          repayment_id?: string | null;
          storage_path: string;
          transaction_id?: string | null;
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          file_name?: string | null;
          id?: string;
          mime_type?: string | null;
          repayment_id?: string | null;
          storage_path?: string;
          transaction_id?: string | null;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_proofs_repayment_id_fkey";
            columns: ["repayment_id"];
            isOneToOne: false;
            referencedRelation: "repayments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_proofs_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transaction_summary";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_proofs_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_proofs_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          whatsapp_opted_in_at: string | null;
          whatsapp_phone: string | null;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          email: string;
          id: string;
          whatsapp_opted_in_at?: string | null;
          whatsapp_phone?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          whatsapp_opted_in_at?: string | null;
          whatsapp_phone?: string | null;
        };
        Relationships: [];
      };
      whatsapp_notifications: {
        Row: {
          attempt_count: number;
          created_at: string;
          current_attempt_id: string | null;
          id: string;
          last_error: string | null;
          provider_message_id: string | null;
          recipient_phone: string | null;
          repayment_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          created_at?: string;
          current_attempt_id?: string | null;
          id?: string;
          last_error?: string | null;
          provider_message_id?: string | null;
          recipient_phone?: string | null;
          repayment_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          created_at?: string;
          current_attempt_id?: string | null;
          id?: string;
          last_error?: string | null;
          provider_message_id?: string | null;
          recipient_phone?: string | null;
          repayment_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_notifications_repayment_id_fkey";
            columns: ["repayment_id"];
            isOneToOne: true;
            referencedRelation: "repayments";
            referencedColumns: ["id"];
          },
        ];
      };
      whatsapp_notification_attempts: {
        Row: {
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          notification_id: string;
          outcome: string;
          provider_message_id: string | null;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          notification_id: string;
          outcome?: string;
          provider_message_id?: string | null;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          notification_id?: string;
          outcome?: string;
          provider_message_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "whatsapp_notification_attempts_notification_id_fkey";
            columns: ["notification_id"];
            isOneToOne: false;
            referencedRelation: "whatsapp_notifications";
            referencedColumns: ["id"];
          },
        ];
      };
      repayments: {
        Row: {
          amount: number;
          client_request_id: string;
          created_at: string;
          id: string;
          method: string;
          note: string | null;
          payee: string;
          payer: string;
          ref_no: number;
          review_note: string | null;
          reviewed_at: string | null;
          status: string;
          transaction_id: string;
        };
        Insert: {
          amount: number;
          client_request_id: string;
          created_at?: string;
          id?: string;
          method: string;
          note?: string | null;
          payee: string;
          payer: string;
          ref_no?: never;
          review_note?: string | null;
          reviewed_at?: string | null;
          status?: string;
          transaction_id: string;
        };
        Update: {
          amount?: number;
          client_request_id?: string;
          created_at?: string;
          id?: string;
          method?: string;
          note?: string | null;
          payee?: string;
          payer?: string;
          ref_no?: never;
          review_note?: string | null;
          reviewed_at?: string | null;
          status?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "repayments_payee_fkey";
            columns: ["payee"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repayments_payer_fkey";
            columns: ["payer"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repayments_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transaction_summary";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "repayments_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          amount: number;
          category: string;
          client_request_id: string;
          created_at: string;
          created_by: string;
          description: string;
          id: string;
          owed_by: string;
          paid_by: string;
          ref_no: number;
          txn_date: string;
        };
        Insert: {
          amount: number;
          category: string;
          client_request_id: string;
          created_at?: string;
          created_by: string;
          description: string;
          id?: string;
          owed_by: string;
          paid_by: string;
          ref_no?: never;
          txn_date: string;
        };
        Update: {
          amount?: number;
          category?: string;
          client_request_id?: string;
          created_at?: string;
          created_by?: string;
          description?: string;
          id?: string;
          owed_by?: string;
          paid_by?: string;
          ref_no?: never;
          txn_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_owed_by_fkey";
            columns: ["owed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_paid_by_fkey";
            columns: ["paid_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      transaction_summary: {
        Row: {
          amount: number | null;
          awaiting: number | null;
          category: string | null;
          client_request_id: string | null;
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          id: string | null;
          outstanding: number | null;
          owed_by: string | null;
          paid_by: string | null;
          ref_no: number | null;
          repaid: number | null;
          status: string | null;
          txn_date: string | null;
        };
        Insert: {
          amount?: number | null;
          awaiting?: never;
          category?: string | null;
          client_request_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          id?: string | null;
          outstanding?: never;
          owed_by?: string | null;
          paid_by?: string | null;
          ref_no?: number | null;
          repaid?: never;
          status?: never;
          txn_date?: string | null;
        };
        Update: {
          amount?: number | null;
          awaiting?: never;
          category?: string | null;
          client_request_id?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          id?: string | null;
          outstanding?: never;
          owed_by?: string | null;
          paid_by?: string | null;
          ref_no?: number | null;
          repaid?: never;
          status?: never;
          txn_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_owed_by_fkey";
            columns: ["owed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_paid_by_fkey";
            columns: ["paid_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      allowed_display_name: { Args: { _email: string }; Returns: string };
      claim_whatsapp_notification: {
        Args: { _repayment_id: string; _recipient_phone: string | null };
        Returns: Json;
      };
      complete_whatsapp_notification: {
        Args: {
          _attempt_id: string;
          _error?: string;
          _notification_id: string;
          _provider_message_id?: string;
          _status: string;
        };
        Returns: undefined;
      };
      record_whatsapp_invocation_failure: {
        Args: { _error: string; _repayment_id: string };
        Returns: undefined;
      };
      create_transaction: {
        Args: {
          _amount: number;
          _category: string;
          _client_request_id: string;
          _description: string;
          _owed_by: string;
          _paid_by: string;
          _proof_mime?: string;
          _proof_name?: string;
          _proof_path?: string;
          _txn_date: string;
        };
        Returns: string;
      };
      is_member: { Args: { _uid: string }; Returns: boolean };
      mark_notifications_read: { Args: { _ids?: string[] }; Returns: undefined };
      review_repayment: {
        Args: {
          _decision: string;
          _repayment_id: string;
          _review_note?: string;
        };
        Returns: string;
      };
      submit_repayment: {
        Args: {
          _amount: number;
          _client_request_id: string;
          _method: string;
          _note: string;
          _proof_mime?: string;
          _proof_name?: string;
          _proof_path?: string;
          _transaction_id: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
