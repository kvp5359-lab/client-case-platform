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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          project_id: string | null
          resource_id: string | null
          resource_type: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          project_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          project_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      board_list_item_order: {
        Row: {
          item_id: string
          item_type: string
          list_id: string
          position: number
          updated_at: string
        }
        Insert: {
          item_id: string
          item_type: string
          list_id: string
          position: number
          updated_at?: string
        }
        Update: {
          item_id?: string
          item_type?: string
          list_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_list_item_order_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "board_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      board_lists: {
        Row: {
          board_id: string
          calendar_settings: Json | null
          card_layout: Json | null
          column_index: number | null
          created_at: string | null
          display_mode: string | null
          entity_type: string
          filters: Json
          group_by: string | null
          header_color: string | null
          id: string
          list_height: string
          name: string
          sort_by: string | null
          sort_dir: string | null
          sort_order: number | null
          updated_at: string | null
          visible_fields: string[] | null
        }
        Insert: {
          board_id: string
          calendar_settings?: Json | null
          card_layout?: Json | null
          column_index?: number | null
          created_at?: string | null
          display_mode?: string | null
          entity_type: string
          filters?: Json
          group_by?: string | null
          header_color?: string | null
          id?: string
          list_height?: string
          name: string
          sort_by?: string | null
          sort_dir?: string | null
          sort_order?: number | null
          updated_at?: string | null
          visible_fields?: string[] | null
        }
        Update: {
          board_id?: string
          calendar_settings?: Json | null
          card_layout?: Json | null
          column_index?: number | null
          created_at?: string | null
          display_mode?: string | null
          entity_type?: string
          filters?: Json
          group_by?: string | null
          header_color?: string | null
          id?: string
          list_height?: string
          name?: string
          sort_by?: string | null
          sort_dir?: string | null
          sort_order?: number | null
          updated_at?: string | null
          visible_fields?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "board_lists_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      board_members: {
        Row: {
          added_at: string | null
          board_id: string
          id: string
          participant_id: string
        }
        Insert: {
          added_at?: string | null
          board_id: string
          id?: string
          participant_id: string
        }
        Update: {
          added_at?: string | null
          board_id?: string
          id?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_members_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_members_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          access_roles: string[] | null
          access_type: string
          column_widths: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          global_filter: Json
          id: string
          name: string
          short_id: number | null
          sort_order: number | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          access_roles?: string[] | null
          access_type?: string
          column_widths?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          global_filter?: Json
          id?: string
          name: string
          short_id?: number | null
          sort_order?: number | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          access_roles?: string[] | null
          access_type?: string
          column_widths?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          global_filter?: Json
          id?: string
          name?: string
          short_id?: number | null
          sort_order?: number | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendars: {
        Row: {
          color: string
          created_at: string
          google_account_user_id: string | null
          google_calendar_id: string | null
          id: string
          is_deleted: boolean
          is_visible: boolean
          name: string
          owner_user_id: string | null
          source: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          google_account_user_id?: string | null
          google_calendar_id?: string | null
          id?: string
          is_deleted?: boolean
          is_visible?: boolean
          name: string
          owner_user_id?: string | null
          source?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          google_account_user_id?: string | null
          google_calendar_id?: string | null
          id?: string
          is_deleted?: boolean
          is_visible?: boolean
          name?: string
          owner_user_id?: string | null
          source?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendars_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      case_profiles: {
        Row: {
          answers: Json
          computed_at: string | null
          country_id: string | null
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          result_snapshot: Json | null
          selected_residence_type_ids: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          answers?: Json
          computed_at?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          result_snapshot?: Json | null
          selected_residence_type_ids?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          answers?: Json
          computed_at?: string | null
          country_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          result_snapshot?: Json | null
          selected_residence_type_ids?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          id: string
          is_resolved: boolean
          parent_id: string | null
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          entity_id: string
          entity_type: string
          id?: string
          is_resolved?: boolean
          parent_id?: string | null
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          id?: string
          is_resolved?: boolean
          parent_id?: string | null
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_context: {
        Row: {
          context_id: string
          context_type: Database["public"]["Enums"]["conversation_context_type"]
          conversation_id: string
          created_at: string
          id: string
        }
        Insert: {
          context_id: string
          context_type?: Database["public"]["Enums"]["conversation_context_type"]
          conversation_id: string
          created_at?: string
          id?: string
        }
        Update: {
          context_id?: string
          context_type?: Database["public"]["Enums"]["conversation_context_type"]
          conversation_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_context_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string | null
          title: string | null
          type: Database["public"]["Enums"]["conversation_type"]
          updated_at: string
          visibility: Database["public"]["Enums"]["conversation_visibility"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["conversation_visibility"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["conversation_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["conversation_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_directories: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_archived: boolean
          name: string
          order_index: number
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          name: string
          order_index?: number
          slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          order_index?: number
          slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_directories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_directory_entries: {
        Row: {
          created_at: string
          created_by: string | null
          directory_id: string
          display_name: string
          id: string
          is_archived: boolean
          order_index: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          directory_id: string
          display_name?: string
          id?: string
          is_archived?: boolean
          order_index?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          directory_id?: string
          display_name?: string
          id?: string
          is_archived?: boolean
          order_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_directory_entries_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: false
            referencedRelation: "custom_directories"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_directory_fields: {
        Row: {
          created_at: string
          directory_id: string
          field_type: Database["public"]["Enums"]["custom_directory_field_type"]
          id: string
          is_primary: boolean
          is_required: boolean
          is_unique: boolean
          is_visible_in_list: boolean
          name: string
          options: Json
          order_index: number
        }
        Insert: {
          created_at?: string
          directory_id: string
          field_type?: Database["public"]["Enums"]["custom_directory_field_type"]
          id?: string
          is_primary?: boolean
          is_required?: boolean
          is_unique?: boolean
          is_visible_in_list?: boolean
          name: string
          options?: Json
          order_index?: number
        }
        Update: {
          created_at?: string
          directory_id?: string
          field_type?: Database["public"]["Enums"]["custom_directory_field_type"]
          id?: string
          is_primary?: boolean
          is_required?: boolean
          is_unique?: boolean
          is_visible_in_list?: boolean
          name?: string
          options?: Json
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_directory_fields_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: false
            referencedRelation: "custom_directories"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_directory_values: {
        Row: {
          entry_id: string
          field_id: string
          id: string
          value_bool: boolean | null
          value_date: string | null
          value_json: Json | null
          value_number: number | null
          value_ref: string | null
          value_text: string | null
        }
        Insert: {
          entry_id: string
          field_id: string
          id?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_ref?: string | null
          value_text?: string | null
        }
        Update: {
          entry_id?: string
          field_id?: string
          id?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_ref?: string | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_directory_values_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "custom_directory_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_directory_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_directory_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_directory_values_value_ref_fkey"
            columns: ["value_ref"]
            isOneToOne: false
            referencedRelation: "custom_directory_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_allowed_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          role?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      docbuilder_app_settings: {
        Row: {
          id: string
          settings: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      docbuilder_block_context: {
        Row: {
          content: Json | null
          created_at: string
          file_path: string | null
          id: string
          order_index: number
          project_block_id: string
          slot_name: string | null
          type: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          file_path?: string | null
          id?: string
          order_index?: number
          project_block_id: string
          slot_name?: string | null
          type: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          file_path?: string | null
          id?: string
          order_index?: number
          project_block_id?: string
          slot_name?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_block_context_project_block_id_fkey"
            columns: ["project_block_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_project_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_block_versions: {
        Row: {
          content_primary: string | null
          content_secondary: string | null
          created_at: string
          id: string
          project_block_id: string
          version_number: number
        }
        Insert: {
          content_primary?: string | null
          content_secondary?: string | null
          created_at?: string
          id?: string
          project_block_id: string
          version_number: number
        }
        Update: {
          content_primary?: string | null
          content_secondary?: string | null
          created_at?: string
          id?: string
          project_block_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_block_versions_project_block_id_fkey"
            columns: ["project_block_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_project_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_blocks: {
        Row: {
          block_type: string
          created_at: string
          generation_model_id: string | null
          heading: string | null
          id: string
          order_index: number
          prompt: string
          required_context: Json
          section_id: string | null
          source_context_id: string | null
          subsection_id: string | null
          title: string
          validation_prompt: string | null
        }
        Insert: {
          block_type?: string
          created_at?: string
          generation_model_id?: string | null
          heading?: string | null
          id?: string
          order_index?: number
          prompt: string
          required_context?: Json
          section_id?: string | null
          source_context_id?: string | null
          subsection_id?: string | null
          title: string
          validation_prompt?: string | null
        }
        Update: {
          block_type?: string
          created_at?: string
          generation_model_id?: string | null
          heading?: string | null
          id?: string
          order_index?: number
          prompt?: string
          required_context?: Json
          section_id?: string | null
          source_context_id?: string | null
          subsection_id?: string | null
          title?: string
          validation_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_blocks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docbuilder_blocks_subsection_id_fkey"
            columns: ["subsection_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_subsections"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_project_access: {
        Row: {
          created_at: string
          project_id: string
          user_email: string
        }
        Insert: {
          created_at?: string
          project_id: string
          user_email: string
        }
        Update: {
          created_at?: string
          project_id?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_project_blocks: {
        Row: {
          content_primary: string | null
          content_secondary: string | null
          created_at: string
          heading: string | null
          id: string
          issues: string[] | null
          project_id: string
          status: string
          template_block_id: string
          updated_at: string
        }
        Insert: {
          content_primary?: string | null
          content_secondary?: string | null
          created_at?: string
          heading?: string | null
          id?: string
          issues?: string[] | null
          project_id: string
          status?: string
          template_block_id: string
          updated_at?: string
        }
        Update: {
          content_primary?: string | null
          content_secondary?: string | null
          created_at?: string
          heading?: string | null
          id?: string
          issues?: string[] | null
          project_id?: string
          status?: string
          template_block_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_project_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docbuilder_project_blocks_template_block_id_fkey"
            columns: ["template_block_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_project_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          id: string
          ocr_error: string | null
          ocr_status: string
          ocr_text: string | null
          project_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_type: string
          id?: string
          ocr_error?: string | null
          ocr_status?: string
          ocr_text?: string | null
          project_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          ocr_error?: string | null
          ocr_status?: string
          ocr_text?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_project_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_projects: {
        Row: {
          created_at: string
          description: string | null
          document_summary: string | null
          general_context: Json
          google_doc_id: string | null
          google_doc_last_export_at: string | null
          google_doc_url: string | null
          id: string
          name: string
          settings: Json
          status: string
          style_id: string | null
          template_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_summary?: string | null
          general_context?: Json
          google_doc_id?: string | null
          google_doc_last_export_at?: string | null
          google_doc_url?: string | null
          id?: string
          name: string
          settings?: Json
          status?: string
          style_id?: string | null
          template_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          document_summary?: string | null
          general_context?: Json
          google_doc_id?: string | null
          google_doc_last_export_at?: string | null
          google_doc_url?: string | null
          id?: string
          name?: string
          settings?: Json
          status?: string
          style_id?: string | null
          template_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_projects_style_id_fkey"
            columns: ["style_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_styles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docbuilder_projects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_sections: {
        Row: {
          created_at: string
          id: string
          order_index: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_styles: {
        Row: {
          chart_heading_bold: boolean
          chart_heading_color: string
          chart_heading_font_size: number
          chart_heading_italic: boolean
          chart_heading_underline: boolean
          cover_image_path: string | null
          created_at: string
          heading_bold: boolean
          heading_color: string
          heading_font_size: number
          heading_italic: boolean
          heading_underline: boolean
          id: string
          is_default: boolean
          list_bold: boolean
          list_color: string
          list_font_size: number
          list_italic: boolean
          list_underline: boolean
          name: string
          subheading_bold: boolean
          subheading_color: string
          subheading_font_size: number
          subheading_italic: boolean
          subheading_underline: boolean
          table_heading_bold: boolean
          table_heading_color: string
          table_heading_font_size: number
          table_heading_italic: boolean
          table_heading_underline: boolean
          template_id: string
          title_bold: boolean
          title_color: string
          title_font_size: number
          title_italic: boolean
          title_underline: boolean
          updated_at: string
        }
        Insert: {
          chart_heading_bold?: boolean
          chart_heading_color?: string
          chart_heading_font_size?: number
          chart_heading_italic?: boolean
          chart_heading_underline?: boolean
          cover_image_path?: string | null
          created_at?: string
          heading_bold?: boolean
          heading_color?: string
          heading_font_size?: number
          heading_italic?: boolean
          heading_underline?: boolean
          id?: string
          is_default?: boolean
          list_bold?: boolean
          list_color?: string
          list_font_size?: number
          list_italic?: boolean
          list_underline?: boolean
          name: string
          subheading_bold?: boolean
          subheading_color?: string
          subheading_font_size?: number
          subheading_italic?: boolean
          subheading_underline?: boolean
          table_heading_bold?: boolean
          table_heading_color?: string
          table_heading_font_size?: number
          table_heading_italic?: boolean
          table_heading_underline?: boolean
          template_id: string
          title_bold?: boolean
          title_color?: string
          title_font_size?: number
          title_italic?: boolean
          title_underline?: boolean
          updated_at?: string
        }
        Update: {
          chart_heading_bold?: boolean
          chart_heading_color?: string
          chart_heading_font_size?: number
          chart_heading_italic?: boolean
          chart_heading_underline?: boolean
          cover_image_path?: string | null
          created_at?: string
          heading_bold?: boolean
          heading_color?: string
          heading_font_size?: number
          heading_italic?: boolean
          heading_underline?: boolean
          id?: string
          is_default?: boolean
          list_bold?: boolean
          list_color?: string
          list_font_size?: number
          list_italic?: boolean
          list_underline?: boolean
          name?: string
          subheading_bold?: boolean
          subheading_color?: string
          subheading_font_size?: number
          subheading_italic?: boolean
          subheading_underline?: boolean
          table_heading_bold?: boolean
          table_heading_color?: string
          table_heading_font_size?: number
          table_heading_italic?: boolean
          table_heading_underline?: boolean
          template_id?: string
          title_bold?: boolean
          title_color?: string
          title_font_size?: number
          title_italic?: boolean
          title_underline?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_styles_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_subsections: {
        Row: {
          created_at: string
          id: string
          order_index: number
          section_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index?: number
          section_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          section_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_subsections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_template_access: {
        Row: {
          created_at: string
          template_id: string
          user_email: string
        }
        Insert: {
          created_at?: string
          template_id: string
          user_email: string
        }
        Update: {
          created_at?: string
          template_id?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "docbuilder_template_access_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "docbuilder_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      docbuilder_templates: {
        Row: {
          content_markers: string[]
          context_definitions: Json
          created_at: string
          default_validation_prompt: string | null
          description: string | null
          document_analysis_prompt: string | null
          generation_model_id: string | null
          generation_system_prompt: string | null
          id: string
          name: string
          primary_language: string
          secondary_language: string
          translation_model_id: string | null
          updated_at: string
          user_id: string | null
          validation_system_prompt: string | null
        }
        Insert: {
          content_markers?: string[]
          context_definitions?: Json
          created_at?: string
          default_validation_prompt?: string | null
          description?: string | null
          document_analysis_prompt?: string | null
          generation_model_id?: string | null
          generation_system_prompt?: string | null
          id?: string
          name: string
          primary_language?: string
          secondary_language?: string
          translation_model_id?: string | null
          updated_at?: string
          user_id?: string | null
          validation_system_prompt?: string | null
        }
        Update: {
          content_markers?: string[]
          context_definitions?: Json
          created_at?: string
          default_validation_prompt?: string | null
          description?: string | null
          document_analysis_prompt?: string | null
          generation_model_id?: string | null
          generation_system_prompt?: string | null
          id?: string
          name?: string
          primary_language?: string
          secondary_language?: string
          translation_model_id?: string | null
          updated_at?: string
          user_id?: string | null
          validation_system_prompt?: string | null
        }
        Relationships: []
      }
      docbuilder_user_settings: {
        Row: {
          created_at: string
          id: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      document_files: {
        Row: {
          checksum: string | null
          created_at: string
          document_id: string
          file_id: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          is_compressed: boolean
          is_current: boolean | null
          mime_type: string
          uploaded_by: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          document_id: string
          file_id?: string | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          is_compressed?: boolean
          is_current?: boolean | null
          mime_type: string
          uploaded_by?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          checksum?: string | null
          created_at?: string
          document_id?: string
          file_id?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          is_compressed?: boolean
          is_current?: boolean | null
          mime_type?: string
          uploaded_by?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_generations: {
        Row: {
          created_at: string
          created_by: string | null
          document_template_id: string
          id: string
          name: string
          placeholder_values: Json
          project_id: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_template_id: string
          id?: string
          name: string
          placeholder_values?: Json
          project_id: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_template_id?: string
          id?: string
          name?: string
          placeholder_values?: Json
          project_id?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_generations_document_template_id_fkey"
            columns: ["document_template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_generations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_generations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_kit_template_folder_slots: {
        Row: {
          ai_check_prompt: string | null
          ai_naming_prompt: string | null
          created_at: string
          description: string | null
          id: string
          kit_folder_id: string
          knowledge_article_id: string | null
          name: string
          sort_order: number
        }
        Insert: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kit_folder_id: string
          knowledge_article_id?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          kit_folder_id?: string
          knowledge_article_id?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_kit_template_folder_slots_kit_folder_id_fkey"
            columns: ["kit_folder_id"]
            isOneToOne: false
            referencedRelation: "document_kit_template_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_kit_template_folder_slots_knowledge_article_id_fkey"
            columns: ["knowledge_article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_kit_template_folders: {
        Row: {
          ai_check_prompt: string | null
          ai_naming_prompt: string | null
          created_at: string
          description: string | null
          folder_template_id: string | null
          id: string
          kit_template_id: string
          knowledge_article_id: string | null
          name: string
          order_index: number
        }
        Insert: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          folder_template_id?: string | null
          id?: string
          kit_template_id: string
          knowledge_article_id?: string | null
          name: string
          order_index?: number
        }
        Update: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          folder_template_id?: string | null
          id?: string
          kit_template_id?: string
          knowledge_article_id?: string | null
          name?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_kit_template_folders_folder_template_id_fkey"
            columns: ["folder_template_id"]
            isOneToOne: false
            referencedRelation: "folder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_kit_template_folders_kit_template_id_fkey"
            columns: ["kit_template_id"]
            isOneToOne: false
            referencedRelation: "document_kit_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_kit_template_folders_knowledge_article_id_fkey"
            columns: ["knowledge_article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_kit_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          order_index: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          order_index?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          order_index?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_kit_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_kits: {
        Row: {
          created_at: string
          description: string | null
          export_folder_id: string | null
          id: string
          name: string
          project_id: string
          sort_order: number
          source_folder_id: string | null
          template_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          export_folder_id?: string | null
          id?: string
          name: string
          project_id: string
          sort_order?: number
          source_folder_id?: string | null
          template_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          export_folder_id?: string | null
          id?: string
          name?: string
          project_id?: string
          sort_order?: number
          source_folder_id?: string | null
          template_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_kits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_kits_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_kit_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_kits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          form_template_id: string | null
          id: string
          name: string
          placeholders: Json | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          form_template_id?: string | null
          id?: string
          name: string
          placeholders?: Json | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          form_template_id?: string | null
          id?: string
          name?: string
          placeholders?: Json | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          ai_check_result: string | null
          ai_checked_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          document_kit_id: string | null
          folder_id: string | null
          id: string
          is_deleted: boolean
          name: string
          project_id: string
          sort_order: number
          source_document_id: string | null
          status: string | null
          text_content: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_check_result?: string | null
          ai_checked_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          document_kit_id?: string | null
          folder_id?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          project_id: string
          sort_order?: number
          source_document_id?: string | null
          status?: string | null
          text_content?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_check_result?: string | null
          ai_checked_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          document_kit_id?: string | null
          folder_id?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          project_id?: string
          sort_order?: number
          source_document_id?: string | null
          status?: string | null
          text_content?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_document_kit_id_fkey"
            columns: ["document_kit_id"]
            isOneToOne: false
            referencedRelation: "document_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          access_token: string | null
          auth_type: string
          created_at: string | null
          display_name: string | null
          email: string
          forward_setup_status: string
          forward_target_address: string | null
          forward_verified_at: string | null
          id: string
          imap_host: string | null
          imap_port: number | null
          is_active: boolean | null
          last_history_id: string | null
          last_inbound_at: string | null
          refresh_token: string | null
          signature_html: string | null
          smtp_host: string | null
          smtp_password_encrypted: string | null
          smtp_port: number | null
          smtp_use_tls: boolean
          smtp_username: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
          watch_expires_at: string | null
          workspace_id: string
        }
        Insert: {
          access_token?: string | null
          auth_type?: string
          created_at?: string | null
          display_name?: string | null
          email: string
          forward_setup_status?: string
          forward_target_address?: string | null
          forward_verified_at?: string | null
          id?: string
          imap_host?: string | null
          imap_port?: number | null
          is_active?: boolean | null
          last_history_id?: string | null
          last_inbound_at?: string | null
          refresh_token?: string | null
          signature_html?: string | null
          smtp_host?: string | null
          smtp_password_encrypted?: string | null
          smtp_port?: number | null
          smtp_use_tls?: boolean
          smtp_username?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
          watch_expires_at?: string | null
          workspace_id: string
        }
        Update: {
          access_token?: string | null
          auth_type?: string
          created_at?: string | null
          display_name?: string | null
          email?: string
          forward_setup_status?: string
          forward_target_address?: string | null
          forward_verified_at?: string | null
          id?: string
          imap_host?: string | null
          imap_port?: number | null
          is_active?: boolean | null
          last_history_id?: string | null
          last_inbound_at?: string | null
          refresh_token?: string | null
          signature_html?: string | null
          smtp_host?: string | null
          smtp_password_encrypted?: string | null
          smtp_port?: number | null
          smtp_use_tls?: boolean
          smtp_username?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
          watch_expires_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_inbound_unmatched: {
        Row: {
          cc_addresses: string[] | null
          from_address: string
          from_name: string | null
          id: string
          in_reply_to: string | null
          message_id_header: string | null
          original_to: string | null
          raw_mime_path: string
          reason: string
          received_at: string
          references_headers: string[] | null
          resend_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_thread_id: string | null
          spam_score: number | null
          subject: string | null
          to_addresses: string[]
          workspace_id: string | null
        }
        Insert: {
          cc_addresses?: string[] | null
          from_address: string
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          message_id_header?: string | null
          original_to?: string | null
          raw_mime_path: string
          reason: string
          received_at?: string
          references_headers?: string[] | null
          resend_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_thread_id?: string | null
          spam_score?: number | null
          subject?: string | null
          to_addresses: string[]
          workspace_id?: string | null
        }
        Update: {
          cc_addresses?: string[] | null
          from_address?: string
          from_name?: string | null
          id?: string
          in_reply_to?: string | null
          message_id_header?: string | null
          original_to?: string | null
          raw_mime_path?: string
          reason?: string
          received_at?: string
          references_headers?: string[] | null
          resend_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_thread_id?: string | null
          spam_score?: number | null
          subject?: string | null
          to_addresses?: string[]
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_inbound_unmatched_resolved_thread_id_fkey"
            columns: ["resolved_thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_inbound_unmatched_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_virtual_addresses: {
        Row: {
          auto_reply_enabled: boolean
          auto_reply_text: string | null
          created_at: string
          created_by: string | null
          default_assignee_user_id: string | null
          default_thread_template_id: string | null
          description: string | null
          display_name: string | null
          id: string
          is_active: boolean
          local_part: string
          routing_mode: string
          target_project_id: string | null
          target_thread_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          auto_reply_enabled?: boolean
          auto_reply_text?: string | null
          created_at?: string
          created_by?: string | null
          default_assignee_user_id?: string | null
          default_thread_template_id?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          local_part: string
          routing_mode?: string
          target_project_id?: string | null
          target_thread_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          auto_reply_enabled?: boolean
          auto_reply_text?: string | null
          created_at?: string
          created_by?: string | null
          default_assignee_user_id?: string | null
          default_thread_template_id?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          local_part?: string
          routing_mode?: string
          target_project_id?: string | null
          target_thread_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_virtual_addresses_default_thread_template_id_fkey"
            columns: ["default_thread_template_id"]
            isOneToOne: false
            referencedRelation: "thread_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_virtual_addresses_target_project_id_fkey"
            columns: ["target_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_virtual_addresses_target_thread_id_fkey"
            columns: ["target_thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_virtual_addresses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      export_progress: {
        Row: {
          created_at: string | null
          document_id: string
          error_message: string | null
          id: string
          session_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          document_id: string
          error_message?: string | null
          id?: string
          session_id: string
          status: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          document_id?: string
          error_message?: string | null
          id?: string
          session_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_progress_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      external_calendar_events: {
        Row: {
          all_day: boolean
          calendar_id: string
          description: string | null
          end_at: string
          external_id: string
          html_link: string | null
          id: string
          location: string | null
          start_at: string
          synced_at: string
          title: string | null
          updated_at_external: string | null
        }
        Insert: {
          all_day?: boolean
          calendar_id: string
          description?: string | null
          end_at: string
          external_id: string
          html_link?: string | null
          id?: string
          location?: string | null
          start_at: string
          synced_at?: string
          title?: string | null
          updated_at_external?: string | null
        }
        Update: {
          all_day?: boolean
          calendar_id?: string
          description?: string | null
          end_at?: string
          external_id?: string
          html_link?: string | null
          id?: string
          location?: string | null
          start_at?: string
          synced_at?: string
          title?: string | null
          updated_at_external?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_calendar_events_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      external_outgoing_dedup: {
        Row: {
          channel: string
          created_at: string
          message_id: string
          reason: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          message_id: string
          reason?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          message_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      field_definition_composite_items: {
        Row: {
          composite_field_id: string
          created_at: string
          id: string
          nested_field_id: string
          order_index: number
          updated_at: string
        }
        Insert: {
          composite_field_id: string
          created_at?: string
          id?: string
          nested_field_id: string
          order_index?: number
          updated_at?: string
        }
        Update: {
          composite_field_id?: string
          created_at?: string
          id?: string
          nested_field_id?: string
          order_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_definition_composite_items_composite_field_id_fkey"
            columns: ["composite_field_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_definition_composite_items_nested_field_id_fkey"
            columns: ["nested_field_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      field_definition_select_options: {
        Row: {
          color: string | null
          created_at: string | null
          field_definition_id: string
          id: string
          label: string
          order_index: number
          updated_at: string | null
          value: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          field_definition_id: string
          id?: string
          label: string
          order_index?: number
          updated_at?: string | null
          value: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          field_definition_id?: string
          id?: string
          label?: string
          order_index?: number
          updated_at?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_definition_select_options_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      field_definitions: {
        Row: {
          created_at: string
          description: string | null
          field_type: Database["public"]["Enums"]["field_type"]
          help_text: string | null
          id: string
          name: string
          options: Json | null
          placeholder: string | null
          updated_at: string
          validation: Json | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          field_type: Database["public"]["Enums"]["field_type"]
          help_text?: string | null
          id?: string
          name: string
          options?: Json | null
          placeholder?: string | null
          updated_at?: string
          validation?: Json | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          field_type?: Database["public"]["Enums"]["field_type"]
          help_text?: string | null
          id?: string
          name?: string
          options?: Json | null
          placeholder?: string | null
          updated_at?: string
          validation?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_definitions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          bucket: string
          checksum: string | null
          created_at: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          storage_path: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          bucket?: string
          checksum?: string | null
          created_at?: string
          file_name: string
          file_size: number
          id?: string
          mime_type?: string
          storage_path: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          bucket?: string
          checksum?: string | null
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_services: {
        Row: {
          base_price: number
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_price?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_price?: number
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_services_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_tax_rates: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_default: boolean
          is_deleted: boolean
          name: string
          rate: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_default?: boolean
          is_deleted?: boolean
          name: string
          rate: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_default?: boolean
          is_deleted?: boolean
          name?: string
          rate?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_tax_rates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_transaction_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          kind: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          kind: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          kind?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_transaction_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_slots: {
        Row: {
          ai_check_prompt: string | null
          ai_naming_prompt: string | null
          assignee_id: string | null
          created_at: string
          deadline: string | null
          description: string | null
          document_id: string | null
          folder_id: string
          folder_template_slot_id: string | null
          id: string
          knowledge_article_id: string | null
          name: string
          project_id: string
          sort_order: number | null
          status: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          assignee_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          document_id?: string | null
          folder_id: string
          folder_template_slot_id?: string | null
          id?: string
          knowledge_article_id?: string | null
          name: string
          project_id: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          assignee_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          document_id?: string | null
          folder_id?: string
          folder_template_slot_id?: string | null
          id?: string
          knowledge_article_id?: string | null
          name?: string
          project_id?: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_slots_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_slots_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_slots_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_slots_folder_template_slot_id_fkey"
            columns: ["folder_template_slot_id"]
            isOneToOne: false
            referencedRelation: "folder_template_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_slots_knowledge_article_id_fkey"
            columns: ["knowledge_article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_slots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_slots_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_slots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_template_slots: {
        Row: {
          ai_check_prompt: string | null
          ai_naming_prompt: string | null
          created_at: string
          description: string | null
          folder_template_id: string
          id: string
          knowledge_article_id: string | null
          name: string
          sort_order: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          folder_template_id: string
          id?: string
          knowledge_article_id?: string | null
          name: string
          sort_order?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          folder_template_id?: string
          id?: string
          knowledge_article_id?: string | null
          name?: string
          sort_order?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_template_slots_folder_template_id_fkey"
            columns: ["folder_template_id"]
            isOneToOne: false
            referencedRelation: "folder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_template_slots_knowledge_article_id_fkey"
            columns: ["knowledge_article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_template_slots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      folder_templates: {
        Row: {
          ai_check_prompt: string | null
          ai_naming_prompt: string | null
          created_at: string
          description: string | null
          id: string
          knowledge_article_id: string | null
          name: string
          settings: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          knowledge_article_id?: string | null
          name: string
          settings?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          knowledge_article_id?: string | null
          name?: string
          settings?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folder_templates_knowledge_article_id_fkey"
            columns: ["knowledge_article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folder_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          ai_check_prompt: string | null
          ai_naming_prompt: string | null
          assignee_id: string | null
          created_at: string
          deadline: string | null
          description: string | null
          document_kit_id: string
          folder_template_id: string | null
          id: string
          kit_template_folder_id: string | null
          knowledge_article_id: string | null
          name: string
          project_id: string
          sort_order: number | null
          status: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          assignee_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          document_kit_id: string
          folder_template_id?: string | null
          id?: string
          kit_template_folder_id?: string | null
          knowledge_article_id?: string | null
          name: string
          project_id: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          assignee_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          document_kit_id?: string
          folder_template_id?: string | null
          id?: string
          kit_template_folder_id?: string | null
          knowledge_article_id?: string | null
          name?: string
          project_id?: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_document_kit_id_fkey"
            columns: ["document_kit_id"]
            isOneToOne: false
            referencedRelation: "document_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_folder_template_id_fkey"
            columns: ["folder_template_id"]
            isOneToOne: false
            referencedRelation: "folder_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_kit_template_folder_id_fkey"
            columns: ["kit_template_folder_id"]
            isOneToOne: false
            referencedRelation: "document_kit_template_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_knowledge_article_id_fkey"
            columns: ["knowledge_article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      form_kit_field_values: {
        Row: {
          composite_field_id: string | null
          created_at: string
          field_definition_id: string
          form_kit_id: string
          id: string
          risk_level: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          composite_field_id?: string | null
          created_at?: string
          field_definition_id: string
          form_kit_id: string
          id?: string
          risk_level?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          composite_field_id?: string | null
          created_at?: string
          field_definition_id?: string
          form_kit_id?: string
          id?: string
          risk_level?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_kit_field_values_composite_field_id_fkey"
            columns: ["composite_field_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_kit_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_kit_field_values_form_kit_id_fkey"
            columns: ["form_kit_id"]
            isOneToOne: false
            referencedRelation: "form_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      form_kit_fields: {
        Row: {
          created_at: string | null
          description: string | null
          field_definition_id: string
          field_type: string
          form_kit_id: string
          form_kit_section_id: string | null
          help_text: string | null
          id: string
          is_required: boolean | null
          name: string
          options: Json | null
          placeholder: string | null
          risk_assessment_enabled: boolean
          sort_order: number
          updated_at: string | null
          validation: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          field_definition_id: string
          field_type: string
          form_kit_id: string
          form_kit_section_id?: string | null
          help_text?: string | null
          id?: string
          is_required?: boolean | null
          name: string
          options?: Json | null
          placeholder?: string | null
          risk_assessment_enabled?: boolean
          sort_order?: number
          updated_at?: string | null
          validation?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          field_definition_id?: string
          field_type?: string
          form_kit_id?: string
          form_kit_section_id?: string | null
          help_text?: string | null
          id?: string
          is_required?: boolean | null
          name?: string
          options?: Json | null
          placeholder?: string | null
          risk_assessment_enabled?: boolean
          sort_order?: number
          updated_at?: string | null
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_kit_fields_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_kit_fields_form_kit_id_fkey"
            columns: ["form_kit_id"]
            isOneToOne: false
            referencedRelation: "form_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_kit_fields_form_kit_section_id_fkey"
            columns: ["form_kit_section_id"]
            isOneToOne: false
            referencedRelation: "form_kit_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      form_kit_sections: {
        Row: {
          created_at: string | null
          description: string | null
          form_kit_id: string
          header_color: string | null
          id: string
          name: string
          sort_order: number
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          form_kit_id: string
          header_color?: string | null
          id?: string
          name: string
          sort_order?: number
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          form_kit_id?: string
          header_color?: string | null
          id?: string
          name?: string
          sort_order?: number
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_kit_sections_form_kit_id_fkey"
            columns: ["form_kit_id"]
            isOneToOne: false
            referencedRelation: "form_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_kit_sections_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      form_kits: {
        Row: {
          brief_sheet_id: string | null
          created_at: string | null
          description: string | null
          google_sheet_id: string | null
          id: string
          name: string
          project_id: string
          structure_synced_at: string | null
          template_id: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          brief_sheet_id?: string | null
          created_at?: string | null
          description?: string | null
          google_sheet_id?: string | null
          id?: string
          name: string
          project_id: string
          structure_synced_at?: string | null
          template_id?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          brief_sheet_id?: string | null
          created_at?: string | null
          description?: string | null
          google_sheet_id?: string | null
          id?: string
          name?: string
          project_id?: string
          structure_synced_at?: string | null
          template_id?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_kits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_kits_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_kits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template_fields: {
        Row: {
          created_at: string
          description: string | null
          field_definition_id: string
          form_template_id: string
          form_template_section_id: string | null
          id: string
          is_required: boolean | null
          options: Json | null
          risk_assessment_enabled: boolean
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          field_definition_id: string
          form_template_id: string
          form_template_section_id?: string | null
          id?: string
          is_required?: boolean | null
          options?: Json | null
          risk_assessment_enabled?: boolean
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          field_definition_id?: string
          form_template_id?: string
          form_template_section_id?: string | null
          id?: string
          is_required?: boolean | null
          options?: Json | null
          risk_assessment_enabled?: boolean
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "form_template_fields_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_template_fields_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_template_fields_form_template_section_id_fkey"
            columns: ["form_template_section_id"]
            isOneToOne: false
            referencedRelation: "form_template_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      form_template_sections: {
        Row: {
          created_at: string
          description: string | null
          form_template_id: string
          header_color: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          form_template_id: string
          header_color?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          form_template_id?: string
          header_color?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_template_sections_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          ai_extraction_prompt: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          order_index: number
          slug: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_extraction_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          order_index?: number
          slug?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_extraction_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          order_index?: number
          slug?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          google_email: string | null
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          google_email?: string | null
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_drive_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      history_read_status: {
        Row: {
          last_read_at: string
          project_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          project_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "history_read_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          ended_at: string | null
          expires_at: string
          id: string
          ip: string | null
          jti: string
          owner_user_id: string
          started_at: string
          target_user_id: string
          user_agent: string | null
          workspace_id: string
        }
        Insert: {
          ended_at?: string | null
          expires_at: string
          id?: string
          ip?: string | null
          jti: string
          owner_user_id: string
          started_at?: string
          target_user_id: string
          user_agent?: string | null
          workspace_id: string
        }
        Update: {
          ended_at?: string | null
          expires_at?: string
          id?: string
          ip?: string | null
          jti?: string
          owner_user_id?: string
          started_at?: string
          target_user_id?: string
          user_agent?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      item_lists: {
        Row: {
          color: string | null
          columns: Json
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          entity_type: string
          filter_config: Json
          icon: string | null
          id: string
          is_deleted: boolean
          name: string
          owner_user_id: string | null
          sort_by: string | null
          sort_dir: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          columns?: Json
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          entity_type: string
          filter_config?: Json
          icon?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          owner_user_id?: string | null
          sort_by?: string | null
          sort_dir?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          columns?: Json
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          entity_type?: string
          filter_config?: Json
          icon?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          owner_user_id?: string | null
          sort_by?: string | null
          sort_dir?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_lists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_article_groups: {
        Row: {
          article_id: string
          group_id: string
          id: string
          sort_order: number
        }
        Insert: {
          article_id: string
          group_id: string
          id?: string
          sort_order?: number
        }
        Update: {
          article_id?: string
          group_id?: string
          id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_article_groups_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "knowledge_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_article_tags: {
        Row: {
          article_id: string
          tag_id: string
        }
        Insert: {
          article_id: string
          tag_id: string
        }
        Update: {
          article_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_article_tags_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "knowledge_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_article_templates: {
        Row: {
          article_id: string
          created_at: string
          id: string
          project_template_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          project_template_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          project_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_article_templates_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_templates_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_article_versions: {
        Row: {
          article_id: string
          comment: string | null
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          is_current: boolean | null
          title: string
          version: number
          workspace_id: string
        }
        Insert: {
          article_id: string
          comment?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean | null
          title: string
          version?: number
          workspace_id: string
        }
        Update: {
          article_id?: string
          comment?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_current?: boolean | null
          title?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_article_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          access_mode: string
          author_email: string | null
          author_name: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          indexed_at: string | null
          indexing_error: string | null
          indexing_status: string | null
          is_published: boolean
          search_vector: unknown
          status_id: string | null
          summary: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_mode?: string
          author_email?: string | null
          author_name?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          indexed_at?: string | null
          indexing_error?: string | null
          indexing_status?: string | null
          is_published?: boolean
          search_vector?: unknown
          status_id?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_mode?: string
          author_email?: string | null
          author_name?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          indexed_at?: string | null
          indexing_error?: string | null
          indexing_status?: string | null
          is_published?: boolean
          search_vector?: unknown
          status_id?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_conversations: {
        Row: {
          created_at: string | null
          id: string
          project_id: string | null
          sources: Json | null
          thread_id: string | null
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          sources?: Json | null
          thread_id?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string | null
          sources?: Json | null
          thread_id?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_conversations_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_embeddings: {
        Row: {
          article_id: string | null
          chunk_index: number
          chunk_text: string
          created_at: string | null
          embedding: string
          id: string
          qa_id: string | null
          workspace_id: string
        }
        Insert: {
          article_id?: string | null
          chunk_index: number
          chunk_text: string
          created_at?: string | null
          embedding: string
          id?: string
          qa_id?: string | null
          workspace_id: string
        }
        Update: {
          article_id?: string | null
          chunk_index?: number
          chunk_text?: string
          created_at?: string | null
          embedding?: string
          id?: string
          qa_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_embeddings_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_embeddings_qa_id_fkey"
            columns: ["qa_id"]
            isOneToOne: false
            referencedRelation: "knowledge_qa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_embeddings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_group_templates: {
        Row: {
          created_at: string
          group_id: string
          id: string
          project_template_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          project_template_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          project_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_group_templates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "knowledge_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_group_templates_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_groups: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "knowledge_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_groups_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
          sources: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
          sources?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "knowledge_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_qa: {
        Row: {
          answer: string
          created_at: string | null
          created_by: string | null
          feeling: string | null
          id: string
          indexed_at: string | null
          indexing_error: string | null
          indexing_status: string | null
          is_published: boolean | null
          original_answers: string | null
          original_question: string | null
          qa_date: string | null
          question: string
          residency_type: string | null
          source: string | null
          topic: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          answer: string
          created_at?: string | null
          created_by?: string | null
          feeling?: string | null
          id?: string
          indexed_at?: string | null
          indexing_error?: string | null
          indexing_status?: string | null
          is_published?: boolean | null
          original_answers?: string | null
          original_question?: string | null
          qa_date?: string | null
          question: string
          residency_type?: string | null
          source?: string | null
          topic?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          answer?: string
          created_at?: string | null
          created_by?: string | null
          feeling?: string | null
          id?: string
          indexed_at?: string | null
          indexing_error?: string | null
          indexing_status?: string | null
          is_published?: boolean | null
          original_answers?: string | null
          original_question?: string | null
          qa_date?: string | null
          question?: string
          residency_type?: string | null
          source?: string | null
          topic?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_qa_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_qa_groups: {
        Row: {
          group_id: string
          id: string
          qa_id: string
          sort_order: number | null
        }
        Insert: {
          group_id: string
          id?: string
          qa_id: string
          sort_order?: number | null
        }
        Update: {
          group_id?: string
          id?: string
          qa_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_qa_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "knowledge_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_qa_groups_qa_id_fkey"
            columns: ["qa_id"]
            isOneToOne: false
            referencedRelation: "knowledge_qa"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_qa_tags: {
        Row: {
          id: string
          qa_id: string
          tag_id: string
        }
        Insert: {
          id?: string
          qa_id: string
          tag_id: string
        }
        Update: {
          id?: string
          qa_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_qa_tags_qa_id_fkey"
            columns: ["qa_id"]
            isOneToOne: false
            referencedRelation: "knowledge_qa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_qa_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "knowledge_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_tags: {
        Row: {
          color: string
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          file_id: string | null
          file_name: string
          file_size: number | null
          id: string
          message_id: string
          mime_type: string | null
          storage_path: string
          telegram_file_id: string | null
          transcription: string | null
        }
        Insert: {
          created_at?: string
          file_id?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          message_id: string
          mime_type?: string | null
          storage_path: string
          telegram_file_id?: string | null
          transcription?: string | null
        }
        Update: {
          created_at?: string
          file_id?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          message_id?: string
          mime_type?: string | null
          storage_path?: string
          telegram_file_id?: string | null
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "project_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_context: {
        Row: {
          context_id: string
          context_type: Database["public"]["Enums"]["conversation_context_type"]
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          context_id: string
          context_type?: Database["public"]["Enums"]["conversation_context_type"]
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          context_id?: string
          context_type?: Database["public"]["Enums"]["conversation_context_type"]
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_context_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          participant_id: string | null
          telegram_source_message_id: number | null
          telegram_user_id: number | null
          telegram_user_name: string | null
          tg_emoji_message_id: number | null
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          participant_id?: string | null
          telegram_source_message_id?: number | null
          telegram_user_id?: number | null
          telegram_user_name?: string | null
          tg_emoji_message_id?: number | null
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          participant_id?: string | null
          telegram_source_message_id?: number | null
          telegram_user_id?: number | null
          telegram_user_name?: string | null
          tg_emoji_message_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "project_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_read_status: {
        Row: {
          channel: string
          last_read_at: string
          manually_unread: boolean
          participant_id: string
          project_id: string | null
          thread_id: string
        }
        Insert: {
          channel?: string
          last_read_at?: string
          manually_unread?: boolean
          participant_id: string
          project_id?: string | null
          thread_id: string
        }
        Update: {
          channel?: string
          last_read_at?: string
          manually_unread?: boolean
          participant_id?: string
          project_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_read_status_chat_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_read_status_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_read_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      message_send_dispatch: {
        Row: {
          dispatched_at: string
          function_name: string
          message_id: string
          processed_at: string | null
          request_id: number
        }
        Insert: {
          dispatched_at?: string
          function_name: string
          message_id: string
          processed_at?: string | null
          request_id: number
        }
        Update: {
          dispatched_at?: string
          function_name?: string
          message_id?: string
          processed_at?: string | null
          request_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_send_dispatch_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "project_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_send_failures: {
        Row: {
          attachment_names: string[] | null
          content: string | null
          created_at: string
          error_code: string | null
          error_text: string
          id: string
          integration_id: string | null
          metadata: Json | null
          participant_id: string | null
          project_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          source: string | null
          thread_id: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          attachment_names?: string[] | null
          content?: string | null
          created_at?: string
          error_code?: string | null
          error_text: string
          id?: string
          integration_id?: string | null
          metadata?: Json | null
          participant_id?: string | null
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          thread_id?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          attachment_names?: string[] | null
          content?: string | null
          created_at?: string
          error_code?: string | null
          error_text?: string
          id?: string
          integration_id?: string | null
          metadata?: Json | null
          participant_id?: string | null
          project_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source?: string | null
          thread_id?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_send_failures_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "workspace_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_send_failures_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_send_failures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_send_failures_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_send_failures_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      message_translations: {
        Row: {
          created_at: string
          created_by: string | null
          message_id: string
          model: string | null
          source_language: string | null
          target_language: string
          translated_content: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          message_id: string
          model?: string | null
          source_language?: string | null
          target_language: string
          translated_content: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          message_id?: string
          model?: string | null
          source_language?: string | null
          target_language?: string
          translated_content?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_translations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "project_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_type: Database["public"]["Enums"]["message_sender_type"]
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender_type"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          origin: string | null
          state_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          origin?: string | null
          state_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          origin?: string | null
          state_token?: string
          user_id?: string
        }
        Relationships: []
      }
      participant_channels: {
        Row: {
          channel_type: string
          created_at: string
          external_id: string
          id: string
          is_primary: boolean
          label: string | null
          participant_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel_type: string
          created_at?: string
          external_id: string
          id?: string
          is_primary?: boolean
          label?: string | null
          participant_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel_type?: string
          created_at?: string
          external_id?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          participant_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participant_channels_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          avatar_fetched_at: string | null
          avatar_url: string | null
          can_login: boolean
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          is_deleted: boolean
          last_name: string | null
          name: string
          notes: string | null
          phone: string | null
          preferred_language: string
          search_vector: unknown
          telegram_user_id: number | null
          telegram_username: string | null
          updated_at: string
          user_id: string | null
          workspace_id: string
          workspace_roles: string[]
        }
        Insert: {
          avatar_fetched_at?: string | null
          avatar_url?: string | null
          can_login?: boolean
          created_at?: string
          deleted_at?: string | null
          email: string
          id?: string
          is_deleted?: boolean
          last_name?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          preferred_language?: string
          search_vector?: unknown
          telegram_user_id?: number | null
          telegram_username?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id: string
          workspace_roles?: string[]
        }
        Update: {
          avatar_fetched_at?: string | null
          avatar_url?: string | null
          can_login?: boolean
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          is_deleted?: boolean
          last_name?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          preferred_language?: string
          search_vector?: unknown
          telegram_user_id?: number | null
          telegram_username?: string | null
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
          workspace_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "participants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_boards: {
        Row: {
          board_id: string
          created_at: string | null
          position: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          board_id: string
          created_at?: string | null
          position?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          board_id?: string
          created_at?: string | null
          position?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_boards_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_boards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_projects: {
        Row: {
          created_at: string
          id: string
          position: number
          project_id: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          project_id: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          project_id?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_context_items: {
        Row: {
          content_html: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          extracted_text: string | null
          extraction_error: string | null
          extraction_kind: string | null
          extraction_status: string
          extraction_updated_at: string | null
          file_id: string | null
          id: string
          is_deleted: boolean
          item_type: string
          name: string
          project_id: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_html?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_kind?: string | null
          extraction_status?: string
          extraction_updated_at?: string | null
          file_id?: string | null
          id?: string
          is_deleted?: boolean
          item_type: string
          name: string
          project_id: string
          sort_order?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_html?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_kind?: string | null
          extraction_status?: string
          extraction_updated_at?: string | null
          file_id?: string | null
          id?: string
          is_deleted?: boolean
          item_type?: string
          name?: string
          project_id?: string
          sort_order?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_context_items_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_context_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_context_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_digests: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          digest_type: string
          events_count: number
          generation_mode: string
          id: string
          model: string | null
          period_end: string
          period_start: string
          project_id: string
          raw_events: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          digest_type?: string
          events_count?: number
          generation_mode: string
          id?: string
          model?: string | null
          period_end: string
          period_start: string
          project_id: string
          raw_events?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          digest_type?: string
          events_count?: number
          generation_mode?: string
          id?: string
          model?: string | null
          period_end?: string
          period_start?: string
          project_id?: string
          raw_events?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_digests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_digests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_field_values: {
        Row: {
          created_at: string
          field_definition_id: string
          id: string
          project_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          field_definition_id: string
          id?: string
          project_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          field_definition_id?: string
          id?: string
          project_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_field_values_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_messages: {
        Row: {
          attachment_error: Json | null
          attachment_status: string | null
          channel: string
          content: string
          created_at: string
          email_delivery_status: string | null
          email_in_reply_to: string | null
          email_message_id: string | null
          email_metadata: Json | null
          email_raw_mime_path: string | null
          email_references: string[] | null
          email_resend_id: string | null
          email_send_account_id: string | null
          email_send_method: string | null
          email_subject: string | null
          forwarded_date: string | null
          forwarded_from_name: string | null
          has_attachments: boolean
          id: string
          deleted_at: string | null
          is_deleted: boolean
          is_draft: boolean
          is_edited: boolean
          original_content: string | null
          original_language: string | null
          project_id: string | null
          recipient_read_at: string | null
          reply_to_message_id: string | null
          scheduled_send_at: string | null
          search_vector: unknown
          send_attempted_at: string | null
          send_failed_reason: string | null
          send_status: Database["public"]["Enums"]["outgoing_send_status"]
          sender_name: string
          sender_participant_id: string | null
          sender_role: string | null
          source: Database["public"]["Enums"]["message_source"]
          telegram_attachments_delivered: boolean | null
          telegram_bot_integration_id: string | null
          telegram_chat_id: number | null
          telegram_error_detail: string | null
          telegram_file_unique_id: string | null
          telegram_grouped_id: number | null
          telegram_message_date: string | null
          telegram_message_id: number | null
          telegram_message_ids: number[]
          telegram_sender_user_id: number | null
          thread_id: string | null
          updated_at: string
          wazzup_message_id: string | null
          wazzup_status: string | null
          workspace_id: string
        }
        Insert: {
          attachment_error?: Json | null
          attachment_status?: string | null
          channel?: string
          content: string
          created_at?: string
          email_delivery_status?: string | null
          email_in_reply_to?: string | null
          email_message_id?: string | null
          email_metadata?: Json | null
          email_raw_mime_path?: string | null
          email_references?: string[] | null
          email_resend_id?: string | null
          email_send_account_id?: string | null
          email_send_method?: string | null
          email_subject?: string | null
          forwarded_date?: string | null
          forwarded_from_name?: string | null
          has_attachments?: boolean
          id?: string
          deleted_at?: string | null
          is_deleted?: boolean
          is_draft?: boolean
          is_edited?: boolean
          original_content?: string | null
          original_language?: string | null
          project_id?: string | null
          recipient_read_at?: string | null
          reply_to_message_id?: string | null
          scheduled_send_at?: string | null
          search_vector?: unknown
          send_attempted_at?: string | null
          send_failed_reason?: string | null
          send_status?: Database["public"]["Enums"]["outgoing_send_status"]
          sender_name: string
          sender_participant_id?: string | null
          sender_role?: string | null
          source?: Database["public"]["Enums"]["message_source"]
          telegram_attachments_delivered?: boolean | null
          telegram_bot_integration_id?: string | null
          telegram_chat_id?: number | null
          telegram_error_detail?: string | null
          telegram_file_unique_id?: string | null
          telegram_grouped_id?: number | null
          telegram_message_date?: string | null
          telegram_message_id?: number | null
          telegram_message_ids?: number[]
          telegram_sender_user_id?: number | null
          thread_id?: string | null
          updated_at?: string
          wazzup_message_id?: string | null
          wazzup_status?: string | null
          workspace_id: string
        }
        Update: {
          attachment_error?: Json | null
          attachment_status?: string | null
          channel?: string
          content?: string
          created_at?: string
          email_delivery_status?: string | null
          email_in_reply_to?: string | null
          email_message_id?: string | null
          email_metadata?: Json | null
          email_raw_mime_path?: string | null
          email_references?: string[] | null
          email_resend_id?: string | null
          email_send_account_id?: string | null
          email_send_method?: string | null
          email_subject?: string | null
          forwarded_date?: string | null
          forwarded_from_name?: string | null
          has_attachments?: boolean
          id?: string
          deleted_at?: string | null
          is_deleted?: boolean
          is_draft?: boolean
          is_edited?: boolean
          original_content?: string | null
          original_language?: string | null
          project_id?: string | null
          recipient_read_at?: string | null
          reply_to_message_id?: string | null
          scheduled_send_at?: string | null
          search_vector?: unknown
          send_attempted_at?: string | null
          send_failed_reason?: string | null
          send_status?: Database["public"]["Enums"]["outgoing_send_status"]
          sender_name?: string
          sender_participant_id?: string | null
          sender_role?: string | null
          source?: Database["public"]["Enums"]["message_source"]
          telegram_attachments_delivered?: boolean | null
          telegram_bot_integration_id?: string | null
          telegram_chat_id?: number | null
          telegram_error_detail?: string | null
          telegram_file_unique_id?: string | null
          telegram_grouped_id?: number | null
          telegram_message_date?: string | null
          telegram_message_id?: number | null
          telegram_message_ids?: number[]
          telegram_sender_user_id?: number | null
          thread_id?: string | null
          updated_at?: string
          wazzup_message_id?: string | null
          wazzup_status?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_messages_chat_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_messages_email_send_account_id_fkey"
            columns: ["email_send_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "project_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_messages_sender_participant_id_fkey"
            columns: ["sender_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_messages_telegram_bot_integration_id_fkey"
            columns: ["telegram_bot_integration_id"]
            isOneToOne: false
            referencedRelation: "workspace_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_money_movements: {
        Row: {
          amount: number
          comment: string | null
          created_at: string
          date: string
          deleted_at: string | null
          id: string
          movement_type: string
          payer_id: string | null
          project_id: string
          receiver_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          comment?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          movement_type: string
          payer_id?: string | null
          project_id: string
          receiver_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          comment?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          id?: string
          movement_type?: string
          payer_id?: string | null
          project_id?: string
          receiver_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_money_movements_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_money_movements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_money_movements_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_participants: {
        Row: {
          added_at: string
          id: string
          participant_id: string
          project_id: string
          project_roles: string[]
        }
        Insert: {
          added_at?: string
          id?: string
          participant_id: string
          project_id: string
          project_roles?: string[]
        }
        Update: {
          added_at?: string
          id?: string
          participant_id?: string
          project_id?: string
          project_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "project_participants_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_plan_blocks: {
        Row: {
          block_type: string
          content: string | null
          created_at: string
          folder_slot_id: string | null
          id: string
          project_id: string
          sort_order: number
          thread_id: string | null
          updated_at: string
          visible_to_client: boolean
          workspace_id: string
        }
        Insert: {
          block_type: string
          content?: string | null
          created_at?: string
          folder_slot_id?: string | null
          id?: string
          project_id: string
          sort_order?: number
          thread_id?: string | null
          updated_at?: string
          visible_to_client?: boolean
          workspace_id: string
        }
        Update: {
          block_type?: string
          content?: string | null
          created_at?: string
          folder_slot_id?: string | null
          id?: string
          project_id?: string
          sort_order?: number
          thread_id?: string | null
          updated_at?: string
          visible_to_client?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_plan_blocks_folder_slot_id_fkey"
            columns: ["folder_slot_id"]
            isOneToOne: false
            referencedRelation: "folder_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plan_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plan_blocks_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_plan_blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_roles: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          module_access: Json
          name: string
          order_index: number
          permissions: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          module_access?: Json
          name: string
          order_index?: number
          permissions?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          module_access?: Json
          name?: string
          order_index?: number
          permissions?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_service_groups: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          project_id: string
          service_id: string
          sort_order: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          project_id: string
          service_id: string
          sort_order?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          project_id?: string
          service_id?: string
          sort_order?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_service_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_groups_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      project_service_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          executor_id: string
          group_id: string | null
          id: string
          price: number
          project_id: string
          quantity: number
          service_id: string
          sort_order: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          executor_id: string
          group_id?: string | null
          id?: string
          price: number
          project_id: string
          quantity: number
          service_id: string
          sort_order?: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          executor_id?: string
          group_id?: string | null
          id?: string
          price?: number
          project_id?: string
          quantity?: number
          service_id?: string
          sort_order?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_service_items_executor_id_fkey"
            columns: ["executor_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "project_service_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_service_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      project_services: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          name: string
          price: number
          project_id: string
          quantity: number
          service_id: string | null
          sort_order: number
          tax_rate: number | null
          tax_rate_id: string | null
          total: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          price?: number
          project_id: string
          quantity?: number
          service_id?: string | null
          sort_order?: number
          tax_rate?: number | null
          tax_rate_id?: string | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          price?: number
          project_id?: string
          quantity?: number
          service_id?: string | null
          sort_order?: number
          tax_rate?: number | null
          tax_rate_id?: string | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_services_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "finance_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_services_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "finance_tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_telegram_chats: {
        Row: {
          bot_version: string
          channel: string
          created_at: string
          id: string
          integration_id: string | null
          is_active: boolean
          project_id: string | null
          telegram_chat_id: number
          telegram_chat_title: string | null
          thread_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          bot_version?: string
          channel?: string
          created_at?: string
          id?: string
          integration_id?: string | null
          is_active?: boolean
          project_id?: string | null
          telegram_chat_id: number
          telegram_chat_title?: string | null
          thread_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          bot_version?: string
          channel?: string
          created_at?: string
          id?: string
          integration_id?: string | null
          is_active?: boolean
          project_id?: string | null
          telegram_chat_id?: number
          telegram_chat_title?: string | null
          thread_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_telegram_chats_chat_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_telegram_chats_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "workspace_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_telegram_chats_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_telegram_chats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_document_kits: {
        Row: {
          created_at: string
          document_kit_template_id: string
          id: string
          order_index: number
          project_template_id: string
        }
        Insert: {
          created_at?: string
          document_kit_template_id: string
          id?: string
          order_index?: number
          project_template_id: string
        }
        Update: {
          created_at?: string
          document_kit_template_id?: string
          id?: string
          order_index?: number
          project_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_document_kits_document_kit_template_id_fkey"
            columns: ["document_kit_template_id"]
            isOneToOne: false
            referencedRelation: "document_kit_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_template_document_kits_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_field_links: {
        Row: {
          created_at: string
          field_definition_id: string
          id: string
          is_required: boolean
          order_index: number
          template_id: string
        }
        Insert: {
          created_at?: string
          field_definition_id: string
          id?: string
          is_required?: boolean
          order_index?: number
          template_id: string
        }
        Update: {
          created_at?: string
          field_definition_id?: string
          id?: string
          is_required?: boolean
          order_index?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_field_links_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_template_field_links_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_forms: {
        Row: {
          created_at: string
          form_template_id: string
          id: string
          order_index: number
          project_template_id: string
        }
        Insert: {
          created_at?: string
          form_template_id: string
          id?: string
          order_index?: number
          project_template_id: string
        }
        Update: {
          created_at?: string
          form_template_id?: string
          id?: string
          order_index?: number
          project_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_forms_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_template_forms_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_plan_blocks: {
        Row: {
          block_type: string
          content: string | null
          created_at: string
          id: string
          project_template_id: string
          slot_template_id: string | null
          sort_order: number
          thread_template_id: string | null
          updated_at: string
          visible_to_client: boolean
          workspace_id: string
        }
        Insert: {
          block_type: string
          content?: string | null
          created_at?: string
          id?: string
          project_template_id: string
          slot_template_id?: string | null
          sort_order?: number
          thread_template_id?: string | null
          updated_at?: string
          visible_to_client?: boolean
          workspace_id: string
        }
        Update: {
          block_type?: string
          content?: string | null
          created_at?: string
          id?: string
          project_template_id?: string
          slot_template_id?: string | null
          sort_order?: number
          thread_template_id?: string | null
          updated_at?: string
          visible_to_client?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_plan_blocks_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_template_plan_blocks_slot_template_id_fkey"
            columns: ["slot_template_id"]
            isOneToOne: false
            referencedRelation: "document_kit_template_folder_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_template_plan_blocks_thread_template_id_fkey"
            columns: ["thread_template_id"]
            isOneToOne: false
            referencedRelation: "thread_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_template_plan_blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_statuses: {
        Row: {
          created_at: string
          is_default: boolean
          is_final: boolean
          order_index: number
          status_id: string
          template_id: string
        }
        Insert: {
          created_at?: string
          is_default?: boolean
          is_final?: boolean
          order_index?: number
          status_id: string
          template_id: string
        }
        Update: {
          created_at?: string
          is_default?: boolean
          is_final?: boolean
          order_index?: number
          status_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_statuses_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_template_statuses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          brief_template_sheet_id: string | null
          created_at: string
          created_by: string | null
          default_panel_tabs: Json | null
          description: string | null
          enabled_modules: string[] | null
          file_size_danger_mb: number | null
          file_size_warn_mb: number | null
          folder_name_replace_spaces: boolean
          folder_name_template: string | null
          icon: string
          icon_color: string
          icon_color_mode: string
          id: string
          default_name_prefix: string | null
          is_lead_template: boolean
          name: string
          order_index: number
          root_folder_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brief_template_sheet_id?: string | null
          created_at?: string
          created_by?: string | null
          default_panel_tabs?: Json | null
          description?: string | null
          enabled_modules?: string[] | null
          file_size_danger_mb?: number | null
          file_size_warn_mb?: number | null
          folder_name_replace_spaces?: boolean
          folder_name_template?: string | null
          icon?: string
          icon_color?: string
          icon_color_mode?: string
          id?: string
          default_name_prefix?: string | null
          is_lead_template?: boolean
          name: string
          order_index?: number
          root_folder_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brief_template_sheet_id?: string | null
          created_at?: string
          created_by?: string | null
          default_panel_tabs?: Json | null
          description?: string | null
          enabled_modules?: string[] | null
          file_size_danger_mb?: number | null
          file_size_warn_mb?: number | null
          folder_name_replace_spaces?: boolean
          folder_name_template?: string | null
          icon?: string
          icon_color?: string
          icon_color_mode?: string
          id?: string
          default_name_prefix?: string | null
          is_lead_template?: boolean
          name?: string
          order_index?: number
          root_folder_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_thread_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          participant_id: string
          thread_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          participant_id: string
          thread_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          participant_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_thread_assignees_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_thread_assignees_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      project_thread_email_links: {
        Row: {
          contact_email: string
          created_at: string | null
          gmail_thread_id: string | null
          id: string
          is_active: boolean | null
          subject: string | null
          thread_id: string
        }
        Insert: {
          contact_email: string
          created_at?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_active?: boolean | null
          subject?: string | null
          thread_id: string
        }
        Update: {
          contact_email?: string
          created_at?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_active?: boolean | null
          subject?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_chat_email_links_chat_id_fkey"
            columns: ["thread_id"]
            isOneToOne: true
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      project_thread_members: {
        Row: {
          added_at: string
          id: string
          participant_id: string
          thread_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          participant_id: string
          thread_id: string
        }
        Update: {
          added_at?: string
          id?: string
          participant_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_chat_members_chat_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_chat_members_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_threads: {
        Row: {
          accent_color: string
          access_roles: string[] | null
          access_type: string
          business_client_tg_user_id: number | null
          business_connection_id: string | null
          contact_participant_id: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          email_last_external_address: string | null
          email_send_account_id: string | null
          email_send_method: string
          email_subject_root: string | null
          end_at: string | null
          icon: string
          id: string
          inbox_sort_at: string | null
          is_default: boolean
          is_deleted: boolean
          is_pinned: boolean
          legacy_channel: string | null
          link_code: string | null
          mtproto_client_tg_user_id: number | null
          mtproto_session_user_id: string | null
          name: string
          owner_user_id: string | null
          project_id: string | null
          search_vector: unknown
          short_id: number | null
          sort_order: number
          source_template_id: string | null
          start_at: string | null
          status_id: string | null
          type: string
          updated_at: string
          wazzup_channel_id: string | null
          wazzup_chat_id: string | null
          wazzup_chat_type: string | null
          wazzup_contact_avatar_url: string | null
          workspace_id: string
        }
        Insert: {
          accent_color?: string
          access_roles?: string[] | null
          access_type?: string
          business_client_tg_user_id?: number | null
          business_connection_id?: string | null
          contact_participant_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          email_last_external_address?: string | null
          email_send_account_id?: string | null
          email_send_method?: string
          email_subject_root?: string | null
          end_at?: string | null
          icon?: string
          id?: string
          inbox_sort_at?: string | null
          is_default?: boolean
          is_deleted?: boolean
          is_pinned?: boolean
          legacy_channel?: string | null
          link_code?: string | null
          mtproto_client_tg_user_id?: number | null
          mtproto_session_user_id?: string | null
          name: string
          owner_user_id?: string | null
          project_id?: string | null
          search_vector?: unknown
          short_id?: number | null
          sort_order?: number
          source_template_id?: string | null
          start_at?: string | null
          status_id?: string | null
          type?: string
          updated_at?: string
          wazzup_channel_id?: string | null
          wazzup_chat_id?: string | null
          wazzup_chat_type?: string | null
          wazzup_contact_avatar_url?: string | null
          workspace_id: string
        }
        Update: {
          accent_color?: string
          access_roles?: string[] | null
          access_type?: string
          business_client_tg_user_id?: number | null
          business_connection_id?: string | null
          contact_participant_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          email_last_external_address?: string | null
          email_send_account_id?: string | null
          email_send_method?: string
          email_subject_root?: string | null
          end_at?: string | null
          icon?: string
          id?: string
          inbox_sort_at?: string | null
          is_default?: boolean
          is_deleted?: boolean
          is_pinned?: boolean
          legacy_channel?: string | null
          link_code?: string | null
          mtproto_client_tg_user_id?: number | null
          mtproto_session_user_id?: string | null
          name?: string
          owner_user_id?: string | null
          project_id?: string | null
          search_vector?: unknown
          short_id?: number | null
          sort_order?: number
          source_template_id?: string | null
          start_at?: string | null
          status_id?: string | null
          type?: string
          updated_at?: string
          wazzup_channel_id?: string | null
          wazzup_chat_id?: string | null
          wazzup_chat_type?: string | null
          wazzup_contact_avatar_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_chats_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_chats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_threads_business_connection_id_fkey"
            columns: ["business_connection_id"]
            isOneToOne: false
            referencedRelation: "telegram_business_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_threads_contact_participant_id_fkey"
            columns: ["contact_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_threads_email_send_account_id_fkey"
            columns: ["email_send_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_threads_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "thread_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_threads_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_threads_wazzup_channel_id_fkey"
            columns: ["wazzup_channel_id"]
            isOneToOne: false
            referencedRelation: "wazzup_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      project_transactions: {
        Row: {
          amount: number
          category_id: string | null
          comment: string | null
          created_at: string
          date: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          participant_id: string | null
          project_id: string
          tax_rate: number | null
          tax_rate_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          comment?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          participant_id?: string | null
          project_id: string
          tax_rate?: number | null
          tax_rate_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          comment?: string | null
          created_at?: string
          date?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          participant_id?: string | null
          project_id?: string
          tax_rate?: number | null
          tax_rate_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_transaction_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_transactions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_transactions_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "finance_tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          contact_participant_id: string | null
          created_at: string | null
          created_by: string | null
          deadline: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          export_folder_id: string | null
          google_drive_folder_link: string | null
          id: string
          is_deleted: boolean
          last_activity_at: string
          messenger_link_code: string | null
          name: string
          search_vector: unknown
          short_id: number | null
          source_folder_id: string | null
          status_id: string | null
          template_id: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          contact_participant_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          export_folder_id?: string | null
          google_drive_folder_link?: string | null
          id?: string
          is_deleted?: boolean
          last_activity_at?: string
          messenger_link_code?: string | null
          name: string
          search_vector?: unknown
          short_id?: number | null
          source_folder_id?: string | null
          status_id?: string | null
          template_id?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          contact_participant_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          export_folder_id?: string | null
          google_drive_folder_link?: string | null
          id?: string
          is_deleted?: boolean
          last_activity_at?: string
          messenger_link_code?: string | null
          name?: string
          search_vector?: unknown
          short_id?: number | null
          source_folder_id?: string | null
          status_id?: string | null
          template_id?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_contact_participant_id_fkey"
            columns: ["contact_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          access_inherits: boolean
          content: string
          created_at: string
          group_id: string | null
          id: string
          name: string
          order_index: number
          personal_only: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_inherits?: boolean
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          name: string
          order_index?: number
          personal_only?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_inherits?: boolean
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          name?: string
          order_index?: number
          personal_only?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_folder_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "quick_reply_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_reply_group_templates: {
        Row: {
          created_at: string
          group_id: string
          id: string
          project_template_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          project_template_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          project_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_reply_group_templates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "quick_reply_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_reply_group_templates_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_reply_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          order_index: number
          parent_id: string | null
          personal_only: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          parent_id?: string | null
          personal_only?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          parent_id?: string | null
          personal_only?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_reply_folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_reply_groups_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "quick_reply_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_reply_templates: {
        Row: {
          id: string
          project_template_id: string
          reply_id: string
        }
        Insert: {
          id?: string
          project_template_id: string
          reply_id: string
        }
        Update: {
          id?: string
          project_template_id?: string
          reply_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_reply_templates_project_template_id_fkey"
            columns: ["project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_reply_templates_reply_id_fkey"
            columns: ["reply_id"]
            isOneToOne: false
            referencedRelation: "quick_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      perf_traces: {
        Row: {
          channel: string | null
          created_at: string
          id: string
          marks: Json
          outcome: string | null
          thread_id: string | null
          thread_type: string | null
          total_ms: number | null
          user_agent: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string
          id?: string
          marks: Json
          outcome?: string | null
          thread_id?: string | null
          thread_type?: string | null
          total_ms?: number | null
          user_agent?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string
          id?: string
          marks?: Json
          outcome?: string | null
          thread_id?: string | null
          thread_type?: string | null
          total_ms?: number | null
          user_agent?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      recently_viewed: {
        Row: {
          entity_id: string
          entity_type: Database["public"]["Enums"]["recent_entity_type"]
          opened_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          entity_id: string
          entity_type: Database["public"]["Enums"]["recent_entity_type"]
          opened_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["recent_entity_type"]
          opened_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recently_viewed_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          base_price: number
          created_at: string
          default_assignee_id: string | null
          deleted_at: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          base_price?: number
          created_at?: string
          default_assignee_id?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          base_price?: number
          created_at?: string
          default_assignee_id?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_default_assignee_id_fkey"
            columns: ["default_assignee_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_templates: {
        Row: {
          ai_check_prompt: string | null
          ai_naming_prompt: string | null
          created_at: string
          description: string | null
          id: string
          knowledge_article_id: string | null
          name: string
          sort_order: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          knowledge_article_id?: string | null
          name: string
          sort_order?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          ai_check_prompt?: string | null
          ai_naming_prompt?: string | null
          created_at?: string
          description?: string | null
          id?: string
          knowledge_article_id?: string | null
          name?: string
          sort_order?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_templates_knowledge_article_id_fkey"
            columns: ["knowledge_article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      source_documents: {
        Row: {
          created_at: string | null
          created_time: string | null
          document_kit_id: string | null
          file_size: number | null
          google_drive_file_id: string
          icon_link: string | null
          id: string
          is_hidden: boolean
          mime_type: string | null
          modified_time: string | null
          name: string
          parent_folder_name: string | null
          project_id: string
          synced_at: string | null
          updated_at: string | null
          web_view_link: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_time?: string | null
          document_kit_id?: string | null
          file_size?: number | null
          google_drive_file_id: string
          icon_link?: string | null
          id?: string
          is_hidden?: boolean
          mime_type?: string | null
          modified_time?: string | null
          name: string
          parent_folder_name?: string | null
          project_id: string
          synced_at?: string | null
          updated_at?: string | null
          web_view_link?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_time?: string | null
          document_kit_id?: string | null
          file_size?: number | null
          google_drive_file_id?: string
          icon_link?: string | null
          id?: string
          is_hidden?: boolean
          mime_type?: string | null
          modified_time?: string | null
          name?: string
          parent_folder_name?: string | null
          project_id?: string
          synced_at?: string | null
          updated_at?: string | null
          web_view_link?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_documents_document_kit_id_fkey"
            columns: ["document_kit_id"]
            isOneToOne: false
            referencedRelation: "document_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      statuses: {
        Row: {
          button_label: string | null
          color: string
          created_at: string
          description: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          final_kind: Database["public"]["Enums"]["status_final_kind"] | null
          icon: string | null
          id: string
          is_default: boolean
          is_final: boolean
          is_system: boolean
          name: string
          order_index: number
          show_to_creator: boolean
          silent_transition: boolean
          text_color: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          button_label?: string | null
          color: string
          created_at?: string
          description?: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          final_kind?: Database["public"]["Enums"]["status_final_kind"] | null
          icon?: string | null
          id?: string
          is_default?: boolean
          is_final?: boolean
          is_system?: boolean
          name: string
          order_index?: number
          show_to_creator?: boolean
          silent_transition?: boolean
          text_color?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          button_label?: string | null
          color?: string
          created_at?: string
          description?: string | null
          entity_type?: Database["public"]["Enums"]["entity_type"]
          final_kind?: Database["public"]["Enums"]["status_final_kind"] | null
          icon?: string | null
          id?: string
          is_default?: boolean
          is_final?: boolean
          is_system?: boolean
          name?: string
          order_index?: number
          show_to_creator?: boolean
          silent_transition?: boolean
          text_color?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statuses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          id: string
          participant_id: string
          thread_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          participant_id: string
          thread_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          participant_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      task_google_event_map: {
        Row: {
          calendar_id: string
          google_event_id: string
          last_pushed_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          calendar_id: string
          google_event_id: string
          last_pushed_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          calendar_id?: string
          google_event_id?: string
          last_pushed_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_google_event_map_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_google_event_map_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "project_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      task_panel_tabs: {
        Row: {
          active_tab_id: string | null
          contact_participant_id: string | null
          id: string
          project_id: string | null
          tabs: Json
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          active_tab_id?: string | null
          contact_participant_id?: string | null
          id?: string
          project_id?: string | null
          tabs?: Json
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          active_tab_id?: string | null
          contact_participant_id?: string | null
          id?: string
          project_id?: string | null
          tabs?: Json
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_panel_tabs_contact_participant_id_fkey"
            columns: ["contact_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_panel_tabs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_panel_tabs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          created_by: string
          deadline: string | null
          description: string | null
          document_id: string | null
          document_kit_id: string | null
          form_kit_id: string | null
          id: string
          is_deleted: boolean
          project_id: string
          sort_order: number
          status_id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deadline?: string | null
          description?: string | null
          document_id?: string | null
          document_kit_id?: string | null
          form_kit_id?: string | null
          id?: string
          is_deleted?: boolean
          project_id: string
          sort_order?: number
          status_id: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deadline?: string | null
          description?: string | null
          document_id?: string | null
          document_kit_id?: string | null
          form_kit_id?: string | null
          id?: string
          is_deleted?: boolean
          project_id?: string
          sort_order?: number
          status_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_document_kit_id_fkey"
            columns: ["document_kit_id"]
            isOneToOne: false
            referencedRelation: "document_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_form_kit_id_fkey"
            columns: ["form_kit_id"]
            isOneToOne: false
            referencedRelation: "form_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_sessions: {
        Row: {
          context: Json
          created_at: string
          expires_at: string
          id: string
          state: string
          telegram_chat_id: number
          telegram_user_id: number
          updated_at: string
        }
        Insert: {
          context?: Json
          created_at?: string
          expires_at?: string
          id?: string
          state: string
          telegram_chat_id: number
          telegram_user_id: number
          updated_at?: string
        }
        Update: {
          context?: Json
          created_at?: string
          expires_at?: string
          id?: string
          state?: string
          telegram_chat_id?: number
          telegram_user_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_business_connections: {
        Row: {
          business_connection_id: string
          can_reply: boolean
          connected_at: string
          disconnected_at: string | null
          id: string
          is_enabled: boolean
          tg_first_name: string | null
          tg_last_name: string | null
          tg_user_id: number
          tg_username: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          business_connection_id: string
          can_reply?: boolean
          connected_at?: string
          disconnected_at?: string | null
          id?: string
          is_enabled?: boolean
          tg_first_name?: string | null
          tg_last_name?: string | null
          tg_user_id: number
          tg_username?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          business_connection_id?: string
          can_reply?: boolean
          connected_at?: string
          disconnected_at?: string | null
          id?: string
          is_enabled?: boolean
          tg_first_name?: string | null
          tg_last_name?: string | null
          tg_user_id?: number
          tg_username?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_business_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_business_link_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          token: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          token?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          token?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_business_link_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_link_tokens: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          participant_id: string
          token: string
          workspace_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          participant_id: string
          token?: string
          workspace_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          participant_id?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_link_tokens_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_link_tokens_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_mtproto_auth_states: {
        Row: {
          created_at: string
          expires_at: string
          pending_session_encrypted: string
          phone: string
          phone_code_hash: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          pending_session_encrypted: string
          phone: string
          phone_code_hash: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          pending_session_encrypted?: string
          phone?: string
          phone_code_hash?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_mtproto_auth_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_mtproto_sessions: {
        Row: {
          connected_at: string
          disconnected_at: string | null
          is_active: boolean
          last_seen_at: string | null
          session_encrypted: string
          tg_first_name: string | null
          tg_last_name: string | null
          tg_phone: string | null
          tg_user_id: number
          tg_username: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          connected_at?: string
          disconnected_at?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          session_encrypted: string
          tg_first_name?: string | null
          tg_last_name?: string | null
          tg_phone?: string | null
          tg_user_id: number
          tg_username?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          connected_at?: string
          disconnected_at?: string | null
          is_active?: boolean
          last_seen_at?: string | null
          session_encrypted?: string
          tg_first_name?: string | null
          tg_last_name?: string | null
          tg_phone?: string | null
          tg_user_id?: number
          tg_username?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_mtproto_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_user_avatars: {
        Row: {
          avatar_url: string | null
          fetched_at: string
          is_missing: boolean
          tg_user_id: number
        }
        Insert: {
          avatar_url?: string | null
          fetched_at?: string
          is_missing?: boolean
          tg_user_id: number
        }
        Update: {
          avatar_url?: string | null
          fetched_at?: string
          is_missing?: boolean
          tg_user_id?: number
        }
        Relationships: []
      }
      thread_template_assignees: {
        Row: {
          id: string
          participant_id: string
          template_id: string
        }
        Insert: {
          id?: string
          participant_id: string
          template_id: string
        }
        Update: {
          id?: string
          participant_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_template_assignees_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_template_assignees_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "thread_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_templates: {
        Row: {
          accent_color: string
          access_roles: string[] | null
          access_type: string
          created_at: string
          created_by: string | null
          deadline_days: number | null
          default_contact_email: string | null
          default_status_id: string | null
          description: string | null
          email_subject_template: string | null
          icon: string
          id: string
          initial_message_html: string | null
          is_email: boolean
          name: string
          on_complete_set_project_status_id: string | null
          owner_project_template_id: string | null
          sort_order: number
          thread_name_template: string | null
          thread_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accent_color?: string
          access_roles?: string[] | null
          access_type?: string
          created_at?: string
          created_by?: string | null
          deadline_days?: number | null
          default_contact_email?: string | null
          default_status_id?: string | null
          description?: string | null
          email_subject_template?: string | null
          icon?: string
          id?: string
          initial_message_html?: string | null
          is_email?: boolean
          name: string
          on_complete_set_project_status_id?: string | null
          owner_project_template_id?: string | null
          sort_order?: number
          thread_name_template?: string | null
          thread_type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accent_color?: string
          access_roles?: string[] | null
          access_type?: string
          created_at?: string
          created_by?: string | null
          deadline_days?: number | null
          default_contact_email?: string | null
          default_status_id?: string | null
          description?: string | null
          email_subject_template?: string | null
          icon?: string
          id?: string
          initial_message_html?: string | null
          is_email?: boolean
          name?: string
          on_complete_set_project_status_id?: string | null
          owner_project_template_id?: string | null
          sort_order?: number
          thread_name_template?: string | null
          thread_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_templates_default_status_id_fkey"
            columns: ["default_status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_templates_on_complete_set_project_status_id_fkey"
            columns: ["on_complete_set_project_status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_templates_owner_project_template_id_fkey"
            columns: ["owner_project_template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_calendar_mirror_settings: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          target_calendar_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          target_calendar_id: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          target_calendar_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_calendar_mirror_settings_target_calendar_id_fkey"
            columns: ["target_calendar_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_calendar_mirror_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          audio_playback_rate: number
          created_at: string | null
          last_workspace_id: string | null
          notifications_enabled: boolean | null
          preferred_ai_model: string | null
          theme: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          audio_playback_rate?: number
          created_at?: string | null
          last_workspace_id?: string | null
          notifications_enabled?: boolean | null
          preferred_ai_model?: string | null
          theme?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          audio_playback_rate?: number
          created_at?: string | null
          last_workspace_id?: string | null
          notifications_enabled?: boolean | null
          preferred_ai_model?: string | null
          theme?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_last_workspace_id_fkey"
            columns: ["last_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_telegram_links: {
        Row: {
          linked_at: string
          tg_first_name: string | null
          tg_last_name: string | null
          tg_user_id: number
          tg_username: string | null
          user_id: string
        }
        Insert: {
          linked_at?: string
          tg_first_name?: string | null
          tg_last_name?: string | null
          tg_user_id: number
          tg_username?: string | null
          user_id: string
        }
        Update: {
          linked_at?: string
          tg_first_name?: string | null
          tg_last_name?: string | null
          tg_user_id?: number
          tg_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wazzup_channels: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          name: string | null
          phone: string | null
          state: string | null
          transport: string
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          name?: string | null
          phone?: string | null
          state?: string | null
          transport: string
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          name?: string | null
          phone?: string | null
          state?: string | null
          transport?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wazzup_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wazzup_settings: {
        Row: {
          api_key: string
          created_at: string
          created_by: string | null
          updated_at: string
          webhook_secret: string
          workspace_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          created_by?: string | null
          updated_at?: string
          webhook_secret?: string
          workspace_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          created_by?: string | null
          updated_at?: string
          webhook_secret?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wazzup_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_counters: {
        Row: {
          entity_type: string
          next_id: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          entity_type: string
          next_id?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          entity_type?: string
          next_id?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_counters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_digest_settings: {
        Row: {
          min_events_for_llm: number
          model: string
          system_prompt: string | null
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          min_events_for_llm?: number
          model?: string
          system_prompt?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          min_events_for_llm?: number
          model?: string
          system_prompt?: string | null
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_digest_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_email_settings: {
        Row: {
          created_at: string
          default_send_method: string
          inbox_address: string | null
          notify_managers_on_unmatched: boolean
          reply_quote_style: string
          signature_html: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          default_send_method?: string
          inbox_address?: string | null
          notify_managers_on_unmatched?: boolean
          reply_quote_style?: string
          signature_html?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          default_send_method?: string
          inbox_address?: string | null
          notify_managers_on_unmatched?: boolean
          reply_quote_style?: string
          signature_html?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_email_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_features: {
        Row: {
          created_at: string
          features: Json
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_features_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          secrets: Json
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          secrets?: Json
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          secrets?: Json
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_roles: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_owner: boolean
          is_system: boolean
          name: string
          order_index: number
          permissions: Json
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_owner?: boolean
          is_system?: boolean
          name: string
          order_index?: number
          permissions?: Json
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_owner?: boolean
          is_system?: boolean
          name?: string
          order_index?: number
          permissions?: Json
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_sections: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          icon: string | null
          id: string
          is_deleted: boolean
          name: string
          order_index: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string
          icon?: string | null
          id?: string
          is_deleted?: boolean
          name: string
          order_index?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          icon?: string | null
          id?: string
          is_deleted?: boolean
          name?: string
          order_index?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_sections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_section_items: {
        Row: {
          item_id: string
          item_type: string
          order_index: number
          section_id: string
        }
        Insert: {
          item_id: string
          item_type: string
          order_index?: number
          section_id: string
        }
        Update: {
          item_id?: string
          item_type?: string
          order_index?: number
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_section_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "workspace_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_sidebar_settings: {
        Row: {
          slots: Json
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          slots?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          slots?: Json
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_sidebar_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          ai_model: Database["public"]["Enums"]["ai_model"] | null
          anthropic_api_key_id: string | null
          created_at: string
          custom_domain: string | null
          custom_domain_status: string | null
          custom_domain_verified_at: string | null
          deadline_far_format: string
          deadline_near_format: string
          default_ai_check_prompt: string | null
          default_ai_naming_prompt: string | null
          default_task_accent: string
          default_task_icon: string
          default_lead_template_per_source: Json
          deleted_at: string | null
          description: string | null
          email_activated_at: string | null
          email_active: boolean
          email_dkim_verified: boolean
          email_mx_verified: boolean
          email_resend_domain_id: string | null
          email_return_path_verified: boolean
          gemini_thinking_budget: number | null
          google_api_key_id: string | null
          id: string
          is_deleted: boolean
          knowledge_summary_prompt: string | null
          name: string
          notification_toast_duration: number
          send_delay_seconds: number
          slug: string | null
          translation_model: string | null
          translation_use_thread_context: boolean
          updated_at: string
          voyageai_api_key_id: string | null
        }
        Insert: {
          ai_model?: Database["public"]["Enums"]["ai_model"] | null
          anthropic_api_key_id?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_status?: string | null
          custom_domain_verified_at?: string | null
          deadline_far_format?: string
          deadline_near_format?: string
          default_ai_check_prompt?: string | null
          default_ai_naming_prompt?: string | null
          default_task_accent?: string
          default_task_icon?: string
          default_lead_template_per_source?: Json
          deleted_at?: string | null
          description?: string | null
          email_activated_at?: string | null
          email_active?: boolean
          email_dkim_verified?: boolean
          email_mx_verified?: boolean
          email_resend_domain_id?: string | null
          email_return_path_verified?: boolean
          gemini_thinking_budget?: number | null
          google_api_key_id?: string | null
          id?: string
          is_deleted?: boolean
          knowledge_summary_prompt?: string | null
          name: string
          notification_toast_duration?: number
          send_delay_seconds?: number
          slug?: string | null
          translation_model?: string | null
          translation_use_thread_context?: boolean
          updated_at?: string
          voyageai_api_key_id?: string | null
        }
        Update: {
          ai_model?: Database["public"]["Enums"]["ai_model"] | null
          anthropic_api_key_id?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_status?: string | null
          custom_domain_verified_at?: string | null
          deadline_far_format?: string
          deadline_near_format?: string
          default_ai_check_prompt?: string | null
          default_ai_naming_prompt?: string | null
          default_task_accent?: string
          default_task_icon?: string
          default_lead_template_per_source?: Json
          deleted_at?: string | null
          description?: string | null
          email_activated_at?: string | null
          email_active?: boolean
          email_dkim_verified?: boolean
          email_mx_verified?: boolean
          email_resend_domain_id?: string | null
          email_return_path_verified?: boolean
          gemini_thinking_budget?: number | null
          google_api_key_id?: string | null
          id?: string
          is_deleted?: boolean
          knowledge_summary_prompt?: string | null
          name?: string
          notification_toast_duration?: number
          send_delay_seconds?: number
          slug?: string | null
          translation_model?: string | null
          translation_use_thread_context?: boolean
          updated_at?: string
          voyageai_api_key_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _board_compile_condition: {
        Args: { p_entity: string; p_node: Json }
        Returns: string
      }
      _board_compile_group: {
        Args: { p_entity: string; p_group: Json }
        Returns: string
      }
      _board_filter_text_list: { Args: { p_value: Json }; Returns: string }
      _board_filter_uuid_list: { Args: { p_value: Json }; Returns: string }
      _board_value_has_sentinel: {
        Args: { p_sentinel: string; p_value: Json }
        Returns: boolean
      }
      add_document_version: {
        Args: {
          p_checksum?: string
          p_document_id: string
          p_file_id?: string
          p_file_name: string
          p_file_path: string
          p_file_size: number
          p_mime_type: string
        }
        Returns: string
      }
      add_document_version_service: {
        Args: {
          p_checksum?: string
          p_document_id: string
          p_file_id?: string
          p_file_name: string
          p_file_path: string
          p_file_size: number
          p_mime_type: string
          p_uploaded_by?: string
        }
        Returns: string
      }
      add_folders_to_kit_template: {
        Args: {
          p_folder_template_ids: string[]
          p_kit_template_id: string
          p_start_order_index?: number
        }
        Returns: string[]
      }
      add_message_pair: {
        Args: {
          p_assistant_message: string
          p_conversation_id: string
          p_document_ids?: string[]
          p_user_id: string
          p_user_message: string
        }
        Returns: Json
      }
      append_telegram_message_id: {
        Args: { p_chat_id: number; p_message_id: string; p_tg_msg_id: number }
        Returns: undefined
      }
      can_user_access_thread:
        | { Args: { p_thread_id: string; p_user_id: string }; Returns: boolean }
        | {
            Args: {
              p_user_id: string
              t: Database["public"]["Tables"]["project_threads"]["Row"]
            }
            Returns: boolean
          }
      can_view_conversation: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: boolean
      }
      can_view_thread: {
        Args: {
          p_access_type: string
          p_project_id: string
          p_thread_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      check_workspace_participant: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      cleanup_expired_oauth_states: { Args: never; Returns: undefined }
      cleanup_old_export_progress: { Args: never; Returns: undefined }
      convert_external_event_to_task: {
        Args: {
          p_calendar_id: string
          p_end_at: string
          p_google_event_id: string
          p_name: string
          p_project_id: string
          p_start_at: string
          p_workspace_id: string
        }
        Returns: string
      }
      copy_form_template: {
        Args: {
          p_new_name: string
          p_source_template_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      copy_thread_template: { Args: { p_template_id: string }; Returns: string }
      create_article_version: {
        Args: { p_article_id: string; p_comment?: string }
        Returns: string
      }
      create_article_with_group: {
        Args: { p_group_id?: string; p_workspace_id: string }
        Returns: string
      }
      create_conversation_with_context: {
        Args: {
          p_created_by: string
          p_document_ids?: string[]
          p_project_id: string
          p_title?: string
          p_type?: string
          p_visibility?: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_document_kit_from_template: {
        Args: {
          p_project_id: string
          p_template_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_document_version_atomic: {
        Args: {
          p_document_id: string
          p_file_id?: string
          p_file_name: string
          p_file_path: string
          p_file_size: number
          p_is_compressed?: boolean
          p_mime_type: string
          p_uploaded_by: string
          p_version: number
          p_workspace_id: string
        }
        Returns: Json
      }
      create_form_kit_from_template: {
        Args: {
          p_project_id: string
          p_template_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_status_with_button_label: {
        Args: {
          p_button_label: string
          p_color: string
          p_description: string
          p_entity_type: string
          p_is_default: boolean
          p_is_final: boolean
          p_name: string
          p_order_index: number
          p_text_color?: string
          p_workspace_id: string
        }
        Returns: {
          button_label: string | null
          color: string
          created_at: string
          description: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          final_kind: Database["public"]["Enums"]["status_final_kind"] | null
          icon: string | null
          id: string
          is_default: boolean
          is_final: boolean
          is_system: boolean
          name: string
          order_index: number
          show_to_creator: boolean
          silent_transition: boolean
          text_color: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "statuses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_task_with_assignees: {
        Args: {
          p_assignee_ids?: string[]
          p_created_by?: string
          p_deadline?: string
          p_description?: string
          p_document_id?: string
          p_document_kit_id?: string
          p_form_kit_id?: string
          p_project_id: string
          p_title: string
          p_workspace_id: string
        }
        Returns: string
      }
      delete_status: { Args: { p_status_id: string }; Returns: undefined }
      delete_workspace_api_key: {
        Args: { workspace_uuid: string }
        Returns: boolean
      }
      delete_workspace_google_api_key: {
        Args: { workspace_uuid: string }
        Returns: boolean
      }
      delete_workspace_voyageai_api_key: {
        Args: { workspace_uuid: string }
        Returns: boolean
      }
      dispatch_message_to_channels: {
        Args: { p_force_attachments?: boolean; p_message_id: string }
        Returns: undefined
      }
      dispatch_scheduled_messages: { Args: never; Returns: number }
      dispatch_send_http: {
        Args: {
          p_body: Json
          p_function_name: string
          p_message_id: string
          p_url: string
        }
        Returns: number
      }
      docbuilder_has_project_access: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      docbuilder_has_template_access: {
        Args: { p_template_id: string }
        Returns: boolean
      }
      docbuilder_is_admin: { Args: never; Returns: boolean }
      docbuilder_user_email: { Args: never; Returns: string }
      duplicate_project_template: {
        Args: { p_new_name?: string; p_template_id: string }
        Returns: string
      }
      end_impersonation_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      fill_folder_slot: {
        Args: { p_document_id: string; p_project_id: string; p_slot_id: string }
        Returns: undefined
      }
      fill_slot_atomic: {
        Args: { p_document_id: string; p_project_id: string; p_slot_id: string }
        Returns: undefined
      }
      fill_slot_atomic_service: {
        Args: { p_document_id: string; p_project_id: string; p_slot_id: string }
        Returns: undefined
      }
      find_or_create_contact_participant: {
        Args: {
          p_email?: string
          p_name: string
          p_phone?: string
          p_telegram_user_id?: number
          p_workspace_id: string
        }
        Returns: string
      }
      fn_write_audit_log: {
        Args: {
          p_action: string
          p_details: Json
          p_project_id: string
          p_resource_id: string
          p_resource_type: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      generate_chat_link_code: { Args: never; Returns: string }
      generate_messenger_link_code: { Args: never; Returns: string }
      generate_thread_link_code: { Args: never; Returns: string }
      get_accessible_projects: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          contact_participant_id: string
          created_at: string
          created_by: string
          deadline: string
          description: string
          export_folder_id: string
          final_kind: Database["public"]["Enums"]["status_final_kind"]
          google_drive_folder_link: string
          has_active_deadline_task: boolean
          id: string
          is_lead_template: boolean
          last_activity_at: string
          messenger_link_code: string
          name: string
          source_folder_id: string
          status_id: string
          template_id: string
          template_name: string
          updated_at: string
          workspace_id: string
        }[]
      }
      get_admin_permissions: { Args: never; Returns: Json }
      get_article_version_history: {
        Args: { p_article_id: string }
        Returns: {
          comment: string
          created_at: string
          created_by: string
          id: string
          is_current: boolean
          title: string
          version: number
        }[]
      }
      get_board_filtered_projects: {
        Args: { p_filter: Json; p_user_id: string; p_workspace_id: string }
        Returns: {
          contact_participant_id: string
          created_at: string
          created_by: string
          deadline: string
          description: string
          export_folder_id: string
          final_kind: Database["public"]["Enums"]["status_final_kind"]
          google_drive_folder_link: string
          has_active_deadline_task: boolean
          id: string
          is_lead_template: boolean
          last_activity_at: string
          messenger_link_code: string
          name: string
          next_task_deadline: string
          next_task_id: string
          next_task_name: string
          source_folder_id: string
          status_id: string
          template_id: string
          template_name: string
          updated_at: string
          workspace_id: string
        }[]
      }
      get_board_filtered_threads: {
        Args: { p_filter: Json; p_user_id: string; p_workspace_id: string }
        Returns: {
          accent_color: string
          created_at: string
          created_by: string
          deadline: string
          end_at: string
          icon: string
          id: string
          is_pinned: boolean
          name: string
          project_id: string
          project_name: string
          sort_order: number
          start_at: string
          status_color: string
          status_id: string
          status_name: string
          status_order: number
          status_show_to_creator: boolean
          type: string
          updated_at: string
          workspace_id: string
        }[]
      }
      get_board_lists: {
        Args: { p_board_id: string }
        Returns: {
          board_id: string
          calendar_settings: Json
          card_layout: Json
          column_index: number
          created_at: string
          display_mode: string
          entity_type: string
          filters: Json
          group_by: string
          header_color: string
          id: string
          list_height: string
          name: string
          sort_by: string
          sort_dir: string
          sort_order: number
          updated_at: string
          visible_fields: string[]
        }[]
      }
      get_chat_state: {
        Args: {
          p_project_id?: string
          p_thread_id: string
          p_user_id: string
          p_workspace_id?: string
        }
        Returns: Json
      }
      get_client_ws_permissions: { Args: never; Returns: Json }
      get_current_document_file: {
        Args: { p_document_id: string }
        Returns: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          version: number
        }[]
      }
      get_document_file_history: {
        Args: { p_document_id: string }
        Returns: {
          created_at: string
          file_name: string
          file_size: number
          id: string
          is_current: boolean
          uploaded_by: string
          version: number
        }[]
      }
      get_employee_permissions: { Args: never; Returns: Json }
      get_history_unread_count: {
        Args: { p_project_id: string }
        Returns: number
      }
      get_inbox_message_status: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          delivery_status: string
          thread_id: string
        }[]
      }
      get_inbox_search_threads: {
        Args: {
          p_limit?: number
          p_query: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          channel_type: string
          counterpart_avatar_url: string
          counterpart_name: string
          email_contact: string
          email_subject: string
          has_unread_reaction: boolean
          last_event_at: string
          last_event_status_color: string
          last_event_text: string
          last_message_at: string
          last_message_attachment_count: number
          last_message_attachment_mime: string
          last_message_attachment_name: string
          last_message_text: string
          last_reaction_at: string
          last_reaction_emoji: string
          last_reaction_message_preview: string
          last_reaction_sender_avatar_url: string
          last_reaction_sender_name: string
          last_read_at: string
          last_sender_avatar_url: string
          last_sender_name: string
          legacy_channel: string
          manually_unread: boolean
          project_id: string
          project_name: string
          thread_accent_color: string
          thread_icon: string
          thread_id: string
          thread_name: string
          thread_type: string
          unread_count: number
          unread_event_count: number
          unread_reaction_count: number
        }[]
      }
      get_inbox_thread_aggregates: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          has_external: boolean
          has_unread_reaction: boolean
          last_from_staff: boolean
          last_message_at: string
          last_reaction_emoji: string
          legacy_channel: string
          manually_unread: boolean
          project_id: string
          thread_accent_color: string
          thread_id: string
          unread_count: number
          unread_event_count: number
          unread_reaction_count: number
        }[]
      }
      reconcile_inbox_report: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_inbox_thread_one: {
        Args: { p_thread_id: string; p_user_id: string; p_workspace_id: string }
        Returns: {
          channel_type: string
          counterpart_avatar_url: string
          counterpart_name: string
          email_contact: string
          email_subject: string
          has_unread_reaction: boolean
          last_event_at: string
          last_event_status_color: string
          last_event_text: string
          last_message_at: string
          last_message_attachment_count: number
          last_message_attachment_mime: string
          last_message_attachment_name: string
          last_message_text: string
          last_reaction_at: string
          last_reaction_emoji: string
          last_reaction_message_preview: string
          last_reaction_sender_avatar_url: string
          last_reaction_sender_name: string
          last_read_at: string
          last_sender_avatar_url: string
          last_sender_name: string
          legacy_channel: string
          manually_unread: boolean
          project_id: string
          project_name: string
          thread_accent_color: string
          thread_icon: string
          thread_id: string
          thread_name: string
          thread_type: string
          unread_count: number
          unread_event_count: number
          unread_reaction_count: number
        }[]
      }
      get_inbox_threads_page: {
        Args: {
          p_cursor_sort_at?: string
          p_cursor_thread_id?: string
          p_limit?: number
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          channel_type: string
          counterpart_avatar_url: string
          counterpart_name: string
          email_contact: string
          email_subject: string
          has_unread_reaction: boolean
          last_event_at: string
          last_event_status_color: string
          last_event_text: string
          last_message_at: string
          last_message_attachment_count: number
          last_message_attachment_mime: string
          last_message_attachment_name: string
          last_message_text: string
          last_reaction_at: string
          last_reaction_emoji: string
          last_reaction_message_preview: string
          last_reaction_sender_avatar_url: string
          last_reaction_sender_name: string
          last_read_at: string
          last_sender_avatar_url: string
          last_sender_name: string
          legacy_channel: string
          manually_unread: boolean
          project_id: string
          project_name: string
          sort_at: string
          thread_accent_color: string
          thread_icon: string
          thread_id: string
          thread_name: string
          thread_type: string
          unread_count: number
          unread_event_count: number
          unread_reaction_count: number
        }[]
      }
      get_inbox_threads_v2: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          channel_type: string
          counterpart_avatar_url: string
          counterpart_name: string
          email_contact: string
          email_subject: string
          has_unread_reaction: boolean
          last_event_at: string
          last_event_status_color: string
          last_event_text: string
          last_message_at: string
          last_message_attachment_count: number
          last_message_attachment_mime: string
          last_message_attachment_name: string
          last_message_text: string
          last_reaction_at: string
          last_reaction_emoji: string
          last_reaction_message_preview: string
          last_reaction_sender_avatar_url: string
          last_reaction_sender_name: string
          last_read_at: string
          last_sender_avatar_url: string
          last_sender_name: string
          legacy_channel: string
          manually_unread: boolean
          project_id: string
          project_name: string
          thread_accent_color: string
          thread_icon: string
          thread_id: string
          thread_name: string
          thread_type: string
          unread_count: number
          unread_event_count: number
          unread_reaction_count: number
        }[]
      }
      get_inbox_needs_reply_threads: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          channel_type: string
          counterpart_avatar_url: string
          counterpart_name: string
          email_contact: string
          email_subject: string
          has_unread_reaction: boolean
          last_event_at: string
          last_event_status_color: string
          last_event_text: string
          last_message_at: string
          last_message_attachment_count: number
          last_message_attachment_mime: string
          last_message_attachment_name: string
          last_message_text: string
          last_reaction_at: string
          last_reaction_emoji: string
          last_reaction_message_preview: string
          last_reaction_sender_avatar_url: string
          last_reaction_sender_name: string
          last_read_at: string
          last_sender_avatar_url: string
          last_sender_name: string
          legacy_channel: string
          manually_unread: boolean
          project_id: string
          project_name: string
          thread_accent_color: string
          thread_icon: string
          thread_id: string
          thread_name: string
          thread_type: string
          unread_count: number
          unread_event_count: number
          unread_reaction_count: number
        }[]
      }
      get_inbox_awaiting_reply_threads: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          channel_type: string
          counterpart_avatar_url: string
          counterpart_name: string
          email_contact: string
          email_subject: string
          has_unread_reaction: boolean
          last_event_at: string
          last_event_status_color: string
          last_event_text: string
          last_message_at: string
          last_message_attachment_count: number
          last_message_attachment_mime: string
          last_message_attachment_name: string
          last_message_text: string
          last_reaction_at: string
          last_reaction_emoji: string
          last_reaction_message_preview: string
          last_reaction_sender_avatar_url: string
          last_reaction_sender_name: string
          last_read_at: string
          last_sender_avatar_url: string
          last_sender_name: string
          legacy_channel: string
          manually_unread: boolean
          project_id: string
          project_name: string
          thread_accent_color: string
          thread_icon: string
          thread_id: string
          thread_name: string
          thread_type: string
          unread_count: number
          unread_event_count: number
          unread_reaction_count: number
        }[]
      }
      get_inbox_unread_threads: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          channel_type: string
          counterpart_avatar_url: string
          counterpart_name: string
          email_contact: string
          email_subject: string
          has_unread_reaction: boolean
          last_event_at: string
          last_event_status_color: string
          last_event_text: string
          last_message_at: string
          last_message_attachment_count: number
          last_message_attachment_mime: string
          last_message_attachment_name: string
          last_message_text: string
          last_reaction_at: string
          last_reaction_emoji: string
          last_reaction_message_preview: string
          last_reaction_sender_avatar_url: string
          last_reaction_sender_name: string
          last_read_at: string
          last_sender_avatar_url: string
          last_sender_name: string
          legacy_channel: string
          manually_unread: boolean
          project_id: string
          project_name: string
          thread_accent_color: string
          thread_icon: string
          thread_id: string
          thread_name: string
          thread_type: string
          unread_count: number
          unread_event_count: number
          unread_reaction_count: number
        }[]
      }
      get_my_task_counts: { Args: { p_workspace_id: string }; Returns: Json }
      get_owner_permissions: { Args: never; Returns: Json }
      get_personal_dialogs: {
        Args: { p_target_user_id: string; p_workspace_id: string }
        Returns: {
          channel: string
          contact_participant_id: string
          email_contact: string
          email_subject: string
          last_message_at: string
          last_message_attachment_count: number
          last_message_attachment_name: string
          last_message_text: string
          last_sender_avatar_url: string
          last_sender_name: string
          legacy_channel: string
          manually_unread: boolean
          owner_user_id: string
          project_id: string
          project_name: string
          thread_accent_color: string
          thread_icon: string
          thread_id: string
          thread_name: string
          thread_type: string
          unread_count: number
        }[]
      }
      get_project_admin_module_access: { Args: never; Returns: Json }
      get_project_admin_permissions: { Args: never; Returns: Json }
      get_project_client_module_access: { Args: never; Returns: Json }
      get_project_client_permissions: { Args: never; Returns: Json }
      get_project_executor_module_access: { Args: never; Returns: Json }
      get_project_executor_permissions: { Args: never; Returns: Json }
      get_project_history: {
        Args: {
          p_actions?: string[]
          p_cursor?: string
          p_limit?: number
          p_project_id: string
          p_resource_types?: string[]
          p_user_id?: string
        }
        Returns: {
          action: string
          actor_email: string
          actor_name: string
          actor_user_id: string
          created_at: string
          details: Json
          id: string
          resource_id: string
          resource_type: string
        }[]
      }
      get_project_participant_module_access: { Args: never; Returns: Json }
      get_project_participant_permissions: { Args: never; Returns: Json }
      get_projects_with_activity: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_workspace_id: string
        }
        Returns: {
          events_count: number
          has_digest: boolean
          project_id: string
          project_name: string
        }[]
      }
      get_recently_viewed: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          accent_color: string
          entity_id: string
          entity_type: string
          opened_at: string
          project_id: string
          project_status_id: string
          project_template_id: string
          subtitle: string
          thread_type: string
          title: string
        }[]
      }
      get_short_id_by_uuid: {
        Args: { p_entity_type: string; p_uuid: string }
        Returns: number
      }
      get_sidebar_data: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: Json
      }
      get_thread_email_address: {
        Args: { p_thread_id: string }
        Returns: string
      }
      get_total_unread_count: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: number
      }
      get_unread_messages_count: {
        Args: {
          p_channel?: string
          p_participant_id: string
          p_project_id: string
          p_thread_id?: string
        }
        Returns: number
      }
      get_user_projects: {
        Args: {
          p_can_view_all?: boolean
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          contact_participant_id: string | null
          created_at: string | null
          created_by: string | null
          deadline: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          export_folder_id: string | null
          google_drive_folder_link: string | null
          id: string
          is_deleted: boolean
          last_activity_at: string
          messenger_link_code: string | null
          name: string
          search_vector: unknown
          short_id: number | null
          source_folder_id: string | null
          status_id: string | null
          template_id: string | null
          updated_at: string | null
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_workspace_api_key: {
        Args: { workspace_uuid: string }
        Returns: string
      }
      get_workspace_boards: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          access_roles: string[]
          access_type: string
          column_widths: Json
          created_at: string
          created_by: string
          description: string
          global_filter: Json
          id: string
          name: string
          short_id: number
          sort_order: number
          updated_at: string
          workspace_id: string
        }[]
      }
      get_workspace_google_api_key: {
        Args: { workspace_uuid: string }
        Returns: string
      }
      get_workspace_slug_by_id: {
        Args: { p_id: string }
        Returns: {
          custom_domain: string
          id: string
          slug: string
        }[]
      }
      get_workspace_threads: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          accent_color: string
          created_at: string
          created_by: string
          deadline: string
          end_at: string
          icon: string
          id: string
          is_pinned: boolean
          name: string
          project_id: string
          project_name: string
          sort_order: number
          start_at: string
          status_color: string
          status_id: string
          status_name: string
          status_order: number
          status_show_to_creator: boolean
          type: string
          updated_at: string
          workspace_id: string
        }[]
      }
      get_workspace_voyageai_api_key: {
        Args: { workspace_uuid: string }
        Returns: string
      }
      get_workspaces_with_counts: {
        Args: { p_user_id: string }
        Returns: {
          participants_count: number
          workspace_id: string
        }[]
      }
      global_search: {
        Args: { p_limit?: number; p_query: string; p_workspace_id: string }
        Returns: {
          accent_color: string
          entity_id: string
          entity_type: string
          project_id: string
          project_status_id: string
          project_template_id: string
          rank: number
          snippet: string
          subtitle: string
          thread_id: string
          thread_type: string
          title: string
        }[]
      }
      has_project_module_access: {
        Args: { p_module: string; p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      has_project_permission: {
        Args: {
          p_module: string
          p_permission: string
          p_project_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      has_workspace_permission: {
        Args: {
          p_permission: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: boolean
      }
      impersonating_owner_id: { Args: never; Returns: string }
      is_feature_enabled: {
        Args: { p_feature: string; p_workspace_id: string }
        Returns: boolean
      }
      is_impersonating: { Args: never; Returns: boolean }
      is_internal_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      is_project_participant: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      is_workspace_participant: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      is_workspace_team_member: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: boolean
      }
      log_audit_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_ip_address?: unknown
          p_project_id?: string
          p_resource_id?: string
          p_resource_type: string
          p_user_id?: string
          p_workspace_id?: string
        }
        Returns: string
      }
      match_inbound_email: {
        Args: {
          p_from_address: string
          p_in_reply_to: string
          p_references: string[]
          p_workspace_id: string
        }
        Returns: {
          match_method: string
          project_id: string
          thread_id: string
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          match_count?: number
          match_threshold?: number
          match_workspace_id: string
          query_embedding: string
        }
        Returns: {
          article_id: string
          chunk_index: number
          chunk_text: string
          id: string
          qa_id: string
          similarity: number
        }[]
      }
      match_knowledge_chunks_by_articles: {
        Args: {
          article_ids: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          article_id: string
          chunk_index: number
          chunk_text: string
          id: string
          qa_id: string
          similarity: number
        }[]
      }
      match_knowledge_chunks_by_sources: {
        Args: {
          filter_article_ids?: string[]
          filter_qa_ids?: string[]
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          article_id: string
          chunk_index: number
          chunk_text: string
          id: string
          qa_id: string
          similarity: number
        }[]
      }
      merge_participants: {
        Args: { p_source_id: string; p_target_id: string }
        Returns: Json
      }
      merge_telegram_contact: {
        Args: {
          p_source_id: string
          p_target_id: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      move_article_to_group: {
        Args: {
          p_article_id: string
          p_from_group_id?: string
          p_to_group_id?: string
        }
        Returns: undefined
      }
      is_thread_subscribed_me: {
        Args: { p_thread_id: string }
        Returns: boolean
      }
      set_my_thread_subscription: {
        Args: { p_subscribed: boolean; p_thread_id: string }
        Returns: boolean
      }
      move_thread_to_project: {
        Args: { p_target_project_id: string | null; p_thread_id: string }
        Returns: undefined
      }
      next_short_id: {
        Args: { p_entity_type: string; p_workspace_id: string }
        Returns: number
      }
      publish_scheduled_message: {
        Args: { p_message_id: string }
        Returns: undefined
      }
      reorder_board_list_items: {
        Args: { p_item_ids: string[]; p_item_type: string; p_list_id: string }
        Returns: undefined
      }
      reorder_documents: { Args: { p_updates: Json }; Returns: undefined }
      resolve_email_thread_assignee: {
        Args: {
          p_thread: Database["public"]["Tables"]["project_threads"]["Row"]
        }
        Returns: string
      }
      resolve_inbound_email_address: {
        Args: { p_address: string }
        Returns: {
          auto_reply_enabled: boolean
          auto_reply_text: string
          default_assignee_user_id: string
          default_thread_template_id: string
          project_id: string
          resolution_type: string
          resolved_email_account_id: string
          resolved_user_id: string
          routing_mode: string
          target_project_id: string
          target_thread_id: string
          thread_id: string
          virtual_address_id: string
          workspace_id: string
          workspace_slug: string
        }[]
      }
      resolve_short_id: {
        Args: {
          p_entity_type: string
          p_short_id: number
          p_workspace_id: string
        }
        Returns: string
      }
      resolve_workspace_by_host: {
        Args: { p_host: string }
        Returns: {
          custom_domain: string
          id: string
          name: string
          resolved_via: string
          slug: string
        }[]
      }
      restore_article_version: {
        Args: { p_version_id: string }
        Returns: string
      }
      restore_document_version: {
        Args: { p_document_id: string; p_version_id: string }
        Returns: string
      }
      revoke_all_user_sessions: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      route_incoming_to_project: {
        Args: {
          p_channel_type: string
          p_external_id: string
          p_sender_name?: string
          p_source: string
          p_thread_name?: string
          p_workspace_id: string
        }
        Returns: {
          participant_id: string
          project_id: string
          status: string
          thread_id: string
        }[]
      }
      scan_dispatch_failures: { Args: never; Returns: number }
      set_my_preferred_language: {
        Args: { p_language: string }
        Returns: undefined
      }
      set_workspace_api_key: {
        Args: { api_key: string; workspace_uuid: string }
        Returns: string
      }
      set_workspace_google_api_key: {
        Args: { api_key: string; workspace_uuid: string }
        Returns: string
      }
      set_workspace_voyageai_api_key: {
        Args: { api_key: string; workspace_uuid: string }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_impersonation_session: {
        Args: {
          p_expires_at: string
          p_ip?: string
          p_jti: string
          p_owner_user_id: string
          p_target_user_id: string
          p_user_agent?: string
          p_workspace_id: string
        }
        Returns: string
      }
      swap_board_list_sort_order: {
        Args: { p_list_a_id: string; p_list_b_id: string }
        Returns: undefined
      }
      sync_form_kit_structure: {
        Args: { p_kit_id: string }
        Returns: undefined
      }
      today_madrid_midnight: { Args: never; Returns: string }
      toggle_message_reaction: {
        Args: {
          p_emoji: string
          p_message_id: string
          p_participant_id: string
        }
        Returns: boolean
      }
      track_recent_view: {
        Args: {
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["recent_entity_type"]
          p_workspace_id: string
        }
        Returns: undefined
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_article_groups: {
        Args: { p_article_id: string; p_group_ids: string[] }
        Returns: undefined
      }
      update_article_tags: {
        Args: { p_article_id: string; p_tag_ids: string[] }
        Returns: undefined
      }
      update_qa_groups: {
        Args: { p_group_ids: string[]; p_qa_id: string }
        Returns: undefined
      }
      update_qa_tags: {
        Args: { p_qa_id: string; p_tag_ids: string[] }
        Returns: undefined
      }
      update_status_with_button_label: {
        Args: {
          status_button_label: string
          status_color: string
          status_description: string
          status_id: string
          status_is_default: boolean
          status_is_final: boolean
          status_name: string
          status_order_index: number
          status_text_color?: string
        }
        Returns: {
          button_label: string | null
          color: string
          created_at: string
          description: string | null
          entity_type: Database["public"]["Enums"]["entity_type"]
          final_kind: Database["public"]["Enums"]["status_final_kind"] | null
          icon: string | null
          id: string
          is_default: boolean
          is_final: boolean
          is_system: boolean
          name: string
          order_index: number
          show_to_creator: boolean
          silent_transition: boolean
          text_color: string
          updated_at: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "statuses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_task_assignees: {
        Args: {
          p_assigned_by: string
          p_assignee_ids: string[]
          p_task_id: string
        }
        Returns: undefined
      }
      update_thread_template_with_assignees: {
        Args: {
          p_assignee_ids: string[]
          p_template_id: string
          p_updates: Json
        }
        Returns: undefined
      }
      upsert_knowledge_embeddings: {
        Args: {
          p_article_id?: string
          p_embeddings?: Json
          p_qa_id?: string
          p_workspace_id?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      ai_model:
        | "claude-sonnet-4-20250514"
        | "claude-3-5-haiku-20241022"
        | "claude-haiku-4-5-20251001"
        | "claude-sonnet-4-5-20250929"
        | "claude-sonnet-4-6"
        | "gemini-2.5-flash"
        | "gemini-2.5-pro"
        | "gemini-3.1-pro-preview"
        | "gemini-3-flash-preview"
        | "gemini-3.1-flash-lite-preview"
        | "gemini-2.5-flash-lite"
      conversation_context_type: "document" | "folder" | "form"
      conversation_type: "ai_documents" | "ai_general" | "team_chat"
      conversation_visibility: "private" | "team" | "all"
      custom_directory_field_type:
        | "text"
        | "textarea"
        | "number"
        | "date"
        | "checkbox"
        | "select"
        | "multi_select"
        | "directory_ref"
        | "email"
        | "phone"
        | "url"
      entity_type:
        | "project"
        | "task"
        | "document"
        | "form"
        | "document_kit"
        | "knowledge_article"
      field_type:
        | "text"
        | "number"
        | "date"
        | "checkbox"
        | "select"
        | "email"
        | "phone"
        | "textarea"
        | "url"
        | "composite"
        | "key-value-table"
        | "divider"
        | "directory_ref"
      message_sender_type: "user" | "assistant" | "system"
      message_source:
        | "web"
        | "telegram"
        | "telegram_service"
        | "email"
        | "bot_event"
        | "telegram_business"
        | "telegram_mtproto"
        | "wazzup"
        | "email_internal"
      outgoing_send_status: "pending" | "sent" | "failed"
      recent_entity_type:
        | "thread"
        | "project"
        | "knowledge_article"
        | "participant"
      status_final_kind: "won" | "lost" | "abandoned"
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
      ai_model: [
        "claude-sonnet-4-20250514",
        "claude-3-5-haiku-20241022",
        "claude-haiku-4-5-20251001",
        "claude-sonnet-4-5-20250929",
        "claude-sonnet-4-6",
        "gemini-2.5-flash",
        "gemini-2.5-pro",
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite-preview",
        "gemini-2.5-flash-lite",
      ],
      conversation_context_type: ["document", "folder", "form"],
      conversation_type: ["ai_documents", "ai_general", "team_chat"],
      conversation_visibility: ["private", "team", "all"],
      custom_directory_field_type: [
        "text",
        "textarea",
        "number",
        "date",
        "checkbox",
        "select",
        "multi_select",
        "directory_ref",
        "email",
        "phone",
        "url",
      ],
      entity_type: [
        "project",
        "task",
        "document",
        "form",
        "document_kit",
        "knowledge_article",
      ],
      field_type: [
        "text",
        "number",
        "date",
        "checkbox",
        "select",
        "email",
        "phone",
        "textarea",
        "url",
        "composite",
        "key-value-table",
        "divider",
        "directory_ref",
      ],
      message_sender_type: ["user", "assistant", "system"],
      message_source: [
        "web",
        "telegram",
        "telegram_service",
        "email",
        "bot_event",
        "telegram_business",
        "telegram_mtproto",
        "wazzup",
        "email_internal",
      ],
      outgoing_send_status: ["pending", "sent", "failed"],
      recent_entity_type: [
        "thread",
        "project",
        "knowledge_article",
        "participant",
      ],
      status_final_kind: ["won", "lost", "abandoned"],
    },
  },
} as const
