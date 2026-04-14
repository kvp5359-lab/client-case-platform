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
      board_lists: {
        Row: {
          board_id: string
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
          id: string
          name: string
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
          id?: string
          name: string
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
          id?: string
          name?: string
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
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
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
      docbuilder_templates: {
        Row: {
          context_definitions: Json
          created_at: string
          description: string | null
          document_analysis_prompt: string | null
          id: string
          name: string
          primary_language: string
          secondary_language: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          context_definitions?: Json
          created_at?: string
          description?: string | null
          document_analysis_prompt?: string | null
          id?: string
          name: string
          primary_language?: string
          secondary_language?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          context_definitions?: Json
          created_at?: string
          description?: string | null
          document_analysis_prompt?: string | null
          id?: string
          name?: string
          primary_language?: string
          secondary_language?: string
          updated_at?: string
          user_id?: string | null
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
          created_at: string
          description: string | null
          id: string
          kit_folder_id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          kit_folder_id: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          kit_folder_id?: string
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
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
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
          created_at: string | null
          email: string
          id: string
          is_active: boolean | null
          last_history_id: string | null
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
          watch_expires_at: string | null
          workspace_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          last_history_id?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
          watch_expires_at?: string | null
          workspace_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_history_id?: string | null
          refresh_token?: string | null
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
        }
        Relationships: []
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
      folder_slots: {
        Row: {
          assignee_id: string | null
          created_at: string
          deadline: string | null
          description: string | null
          document_id: string | null
          folder_id: string
          folder_template_slot_id: string | null
          id: string
          name: string
          project_id: string
          sort_order: number | null
          status: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          document_id?: string | null
          folder_id: string
          folder_template_slot_id?: string | null
          id?: string
          name: string
          project_id: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string | null
          document_id?: string | null
          folder_id?: string
          folder_template_slot_id?: string | null
          id?: string
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
          created_at: string
          description: string | null
          folder_template_id: string
          id: string
          name: string
          sort_order: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          folder_template_id: string
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          folder_template_id?: string
          id?: string
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
          updated_at: string
          value: string | null
        }
        Insert: {
          composite_field_id?: string | null
          created_at?: string
          field_definition_id: string
          form_kit_id: string
          id?: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          composite_field_id?: string | null
          created_at?: string
          field_definition_id?: string
          form_kit_id?: string
          id?: string
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
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          form_template_id: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          form_template_id?: string
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
          telegram_user_id: number | null
          telegram_user_name: string | null
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          participant_id?: string | null
          telegram_user_id?: number | null
          telegram_user_name?: string | null
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          participant_id?: string | null
          telegram_user_id?: number | null
          telegram_user_name?: string | null
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
      participants: {
        Row: {
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
          telegram_user_id: number | null
          updated_at: string
          user_id: string | null
          workspace_id: string
          workspace_roles: string[]
        }
        Insert: {
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
          telegram_user_id?: number | null
          updated_at?: string
          user_id?: string | null
          workspace_id: string
          workspace_roles?: string[]
        }
        Update: {
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
          telegram_user_id?: number | null
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
      project_messages: {
        Row: {
          channel: string
          content: string
          created_at: string
          email_metadata: Json | null
          forwarded_date: string | null
          forwarded_from_name: string | null
          has_attachments: boolean
          id: string
          is_draft: boolean
          is_edited: boolean
          project_id: string | null
          reply_to_message_id: string | null
          scheduled_send_at: string | null
          sender_name: string
          sender_participant_id: string | null
          sender_role: string | null
          source: Database["public"]["Enums"]["message_source"]
          telegram_attachments_delivered: boolean | null
          telegram_chat_id: number | null
          telegram_message_id: number | null
          telegram_retry_count: number
          thread_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel?: string
          content: string
          created_at?: string
          email_metadata?: Json | null
          forwarded_date?: string | null
          forwarded_from_name?: string | null
          has_attachments?: boolean
          id?: string
          is_draft?: boolean
          is_edited?: boolean
          project_id?: string | null
          reply_to_message_id?: string | null
          scheduled_send_at?: string | null
          sender_name: string
          sender_participant_id?: string | null
          sender_role?: string | null
          source?: Database["public"]["Enums"]["message_source"]
          telegram_attachments_delivered?: boolean | null
          telegram_chat_id?: number | null
          telegram_message_id?: number | null
          telegram_retry_count?: number
          thread_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string
          email_metadata?: Json | null
          forwarded_date?: string | null
          forwarded_from_name?: string | null
          has_attachments?: boolean
          id?: string
          is_draft?: boolean
          is_edited?: boolean
          project_id?: string | null
          reply_to_message_id?: string | null
          scheduled_send_at?: string | null
          sender_name?: string
          sender_participant_id?: string | null
          sender_role?: string | null
          source?: Database["public"]["Enums"]["message_source"]
          telegram_attachments_delivered?: boolean | null
          telegram_chat_id?: number | null
          telegram_message_id?: number | null
          telegram_retry_count?: number
          thread_id?: string | null
          updated_at?: string
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
      project_telegram_chats: {
        Row: {
          channel: string
          created_at: string
          id: string
          is_active: boolean
          project_id: string
          telegram_chat_id: number
          telegram_chat_title: string | null
          thread_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id: string
          telegram_chat_id: number
          telegram_chat_title?: string | null
          thread_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id?: string
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
      project_templates: {
        Row: {
          brief_template_sheet_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          enabled_modules: string[] | null
          id: string
          name: string
          root_folder_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brief_template_sheet_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled_modules?: string[] | null
          id?: string
          name: string
          root_folder_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brief_template_sheet_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enabled_modules?: string[] | null
          id?: string
          name?: string
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
          created_at: string
          created_by: string | null
          deadline: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          icon: string
          id: string
          is_default: boolean
          is_deleted: boolean
          is_pinned: boolean
          legacy_channel: string | null
          link_code: string | null
          name: string
          project_id: string | null
          sort_order: number
          source_template_id: string | null
          status_id: string | null
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accent_color?: string
          access_roles?: string[] | null
          access_type?: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_default?: boolean
          is_deleted?: boolean
          is_pinned?: boolean
          legacy_channel?: string | null
          link_code?: string | null
          name: string
          project_id?: string | null
          sort_order?: number
          source_template_id?: string | null
          status_id?: string | null
          type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accent_color?: string
          access_roles?: string[] | null
          access_type?: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          icon?: string
          id?: string
          is_default?: boolean
          is_deleted?: boolean
          is_pinned?: boolean
          legacy_channel?: string | null
          link_code?: string | null
          name?: string
          project_id?: string | null
          sort_order?: number
          source_template_id?: string | null
          status_id?: string | null
          type?: string
          updated_at?: string
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
            foreignKeyName: "project_threads_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
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
          source_folder_id: string | null
          status: string | null
          template_id: string | null
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
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
          source_folder_id?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
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
          source_folder_id?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
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
          content: string
          created_at: string
          group_id: string | null
          id: string
          name: string
          order_index: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          name: string
          order_index?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string | null
          id?: string
          name?: string
          order_index?: number
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
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          parent_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          parent_id?: string | null
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
          icon: string | null
          id: string
          is_default: boolean
          is_final: boolean
          is_system: boolean
          name: string
          order_index: number
          show_to_creator: boolean
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
          icon?: string | null
          id?: string
          is_default?: boolean
          is_final?: boolean
          is_system?: boolean
          name: string
          order_index?: number
          show_to_creator?: boolean
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
          icon?: string | null
          id?: string
          is_default?: boolean
          is_final?: boolean
          is_system?: boolean
          name?: string
          order_index?: number
          show_to_creator?: boolean
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
            foreignKeyName: "thread_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          created_at: string | null
          last_workspace_id: string | null
          notifications_enabled: boolean | null
          preferred_ai_model: string | null
          theme: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          last_workspace_id?: string | null
          notifications_enabled?: boolean | null
          preferred_ai_model?: string | null
          theme?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
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
      workspaces: {
        Row: {
          ai_model: Database["public"]["Enums"]["ai_model"] | null
          anthropic_api_key_id: string | null
          created_at: string
          default_ai_check_prompt: string | null
          default_ai_naming_prompt: string | null
          deleted_at: string | null
          description: string | null
          gemini_thinking_budget: number | null
          google_api_key_id: string | null
          id: string
          is_deleted: boolean
          knowledge_summary_prompt: string | null
          name: string
          notification_toast_duration: number
          send_delay_seconds: number
          updated_at: string
          voyageai_api_key_id: string | null
        }
        Insert: {
          ai_model?: Database["public"]["Enums"]["ai_model"] | null
          anthropic_api_key_id?: string | null
          created_at?: string
          default_ai_check_prompt?: string | null
          default_ai_naming_prompt?: string | null
          deleted_at?: string | null
          description?: string | null
          gemini_thinking_budget?: number | null
          google_api_key_id?: string | null
          id?: string
          is_deleted?: boolean
          knowledge_summary_prompt?: string | null
          name: string
          notification_toast_duration?: number
          send_delay_seconds?: number
          updated_at?: string
          voyageai_api_key_id?: string | null
        }
        Update: {
          ai_model?: Database["public"]["Enums"]["ai_model"] | null
          anthropic_api_key_id?: string | null
          created_at?: string
          default_ai_check_prompt?: string | null
          default_ai_naming_prompt?: string | null
          deleted_at?: string | null
          description?: string | null
          gemini_thinking_budget?: number | null
          google_api_key_id?: string | null
          id?: string
          is_deleted?: boolean
          knowledge_summary_prompt?: string | null
          name?: string
          notification_toast_duration?: number
          send_delay_seconds?: number
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
      add_document_version:
        | {
            Args: {
              p_checksum?: string
              p_document_id: string
              p_file_name: string
              p_file_path: string
              p_file_size: number
              p_mime_type: string
            }
            Returns: string
          }
        | {
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
      create_status_with_button_label:
        | {
            Args: {
              p_button_label: string
              p_color: string
              p_description: string
              p_entity_type: string
              p_is_default: boolean
              p_is_final: boolean
              p_name: string
              p_order_index: number
              p_workspace_id: string
            }
            Returns: {
              button_label: string | null
              color: string
              created_at: string
              description: string | null
              entity_type: Database["public"]["Enums"]["entity_type"]
              icon: string | null
              id: string
              is_default: boolean
              is_final: boolean
              is_system: boolean
              name: string
              order_index: number
              show_to_creator: boolean
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
        | {
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
              icon: string | null
              id: string
              is_default: boolean
              is_final: boolean
              is_system: boolean
              name: string
              order_index: number
              show_to_creator: boolean
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
      debug_auth_context: {
        Args: never
        Returns: {
          check_result: boolean
          current_auth_role: string
          current_auth_uid: string
        }[]
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
      fill_folder_slot: {
        Args: { p_document_id: string; p_project_id: string; p_slot_id: string }
        Returns: undefined
      }
      fill_slot_atomic: {
        Args: { p_document_id: string; p_project_id: string; p_slot_id: string }
        Returns: undefined
      }
      fn_write_audit_log:
        | {
            Args: {
              p_action: string
              p_details: Json
              p_resource_id: string
              p_resource_type: string
              p_workspace_id: string
            }
            Returns: undefined
          }
        | {
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
          created_at: string
          created_by: string
          deadline: string
          description: string
          export_folder_id: string
          google_drive_folder_link: string
          has_active_deadline_task: boolean
          id: string
          last_activity_at: string
          messenger_link_code: string
          name: string
          source_folder_id: string
          status: string
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
      get_board_lists: {
        Args: { p_board_id: string }
        Returns: {
          board_id: string
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
      get_inbox_threads: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          client_accent_color: string
          client_thread_id: string
          has_unread_reaction: boolean
          internal_accent_color: string
          internal_manually_unread: boolean
          internal_thread_id: string
          internal_unread_count: number
          last_message_at: string
          last_message_id: string
          last_message_text: string
          last_reaction_at: string
          last_reaction_emoji: string
          last_sender_name: string
          manually_unread: boolean
          project_id: string
          project_name: string
          project_status: string
          unread_count: number
        }[]
      }
      get_inbox_threads_v2: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          channel_type: string
          email_contact: string
          email_subject: string
          has_unread_reaction: boolean
          last_event_at: string
          last_event_text: string
          last_message_at: string
          last_message_text: string
          last_reaction_emoji: string
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
          unread_count: number
          unread_event_count: number
          unread_reaction_count: number
        }[]
      }
      get_my_urgent_tasks_count: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      get_owner_permissions: { Args: never; Returns: Json }
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
      get_sidebar_data: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: Json
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
          source_folder_id: string | null
          status: string | null
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
          created_at: string
          created_by: string
          description: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          workspace_id: string
        }[]
      }
      get_workspace_google_api_key: {
        Args: { workspace_uuid: string }
        Returns: string
      }
      get_workspace_threads: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: {
          accent_color: string
          created_at: string
          created_by: string
          deadline: string
          icon: string
          id: string
          is_pinned: boolean
          name: string
          project_id: string
          project_name: string
          sort_order: number
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
      is_feature_enabled: {
        Args: { p_feature: string; p_workspace_id: string }
        Returns: boolean
      }
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
      log_audit_action:
        | {
            Args: {
              p_action: string
              p_details?: Json
              p_ip_address?: unknown
              p_resource_id?: string
              p_resource_type: string
              p_workspace_id?: string
            }
            Returns: string
          }
        | {
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
      reorder_documents: { Args: { p_updates: Json }; Returns: undefined }
      restore_article_version: {
        Args: { p_version_id: string }
        Returns: string
      }
      restore_document_version: {
        Args: { p_document_id: string; p_version_id: string }
        Returns: string
      }
      retry_undelivered_telegram_messages: { Args: never; Returns: undefined }
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
      swap_board_list_sort_order: {
        Args: { p_list_a_id: string; p_list_b_id: string }
        Returns: undefined
      }
      sync_form_kit_structure: {
        Args: { p_kit_id: string }
        Returns: undefined
      }
      toggle_message_reaction: {
        Args: {
          p_emoji: string
          p_message_id: string
          p_participant_id: string
        }
        Returns: boolean
      }
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
      update_status_with_button_label:
        | {
            Args: {
              status_button_label: string
              status_color: string
              status_description: string
              status_id: string
              status_is_default: boolean
              status_is_final: boolean
              status_name: string
              status_order_index: number
            }
            Returns: {
              button_label: string | null
              color: string
              created_at: string
              description: string | null
              entity_type: Database["public"]["Enums"]["entity_type"]
              icon: string | null
              id: string
              is_default: boolean
              is_final: boolean
              is_system: boolean
              name: string
              order_index: number
              show_to_creator: boolean
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
        | {
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
              icon: string | null
              id: string
              is_default: boolean
              is_final: boolean
              is_system: boolean
              name: string
              order_index: number
              show_to_creator: boolean
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
      message_sender_type: "user" | "assistant" | "system"
      message_source: "web" | "telegram" | "telegram_service" | "email"
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
      ],
      message_sender_type: ["user", "assistant", "system"],
      message_source: ["web", "telegram", "telegram_service", "email"],
    },
  },
} as const
