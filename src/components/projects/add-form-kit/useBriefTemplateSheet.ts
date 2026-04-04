"use client"

/**
 * Подхук: загрузка brief_template_sheet_id из шаблона проекта
 * и получение имени файла по ссылке на Google Sheet.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { extractGoogleSheetsId } from '@/utils/googleDrive'

interface UseBriefTemplateSheetParams {
  open: boolean
  projectId: string
  workspaceId: string
}

export function useBriefTemplateSheet({
  open,
  projectId,
  workspaceId,
}: UseBriefTemplateSheetParams) {
  const [briefTemplateSheetId, setBriefTemplateSheetId] = useState<string | null>(null)
  const [defaultBriefTemplateSheetId, setDefaultBriefTemplateSheetId] = useState<string | null>(
    null,
  )
  const [briefTemplateLink, setBriefTemplateLink] = useState('')
  const [briefTemplateSheetName, setBriefTemplateSheetName] = useState<string | null>(null)

  // Load brief template sheet ID from project template
  useEffect(() => {
    if (!open) return
    let cancelled = false
    supabase
      .from('projects')
      .select('template_id')
      .eq('id', projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.template_id) return
        supabase
          .from('project_templates')
          .select('brief_template_sheet_id')
          .eq('id', data.template_id)
          .maybeSingle()
          .then(({ data: tpl }) => {
            if (cancelled) return
            const id = tpl?.brief_template_sheet_id ?? null
            setBriefTemplateSheetId(id)
            setDefaultBriefTemplateSheetId(id)
            if (id) {
              setBriefTemplateLink(`https://docs.google.com/spreadsheets/d/${id}/edit`)
            }
          })
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  // Load sheet name when briefTemplateSheetId changes
  useEffect(() => {
    if (!briefTemplateSheetId || !workspaceId) return
    let cancelled = false
    supabase.functions
      .invoke('google-drive-get-folder-name', {
        body: { folderId: briefTemplateSheetId, workspaceId },
      })
      .then(({ data, error }) => {
        if (cancelled) return
        setBriefTemplateSheetName(!error && data?.name ? data.name : null)
      })
    return () => {
      cancelled = true
      setBriefTemplateSheetName(null)
    }
  }, [briefTemplateSheetId, workspaceId])

  const handleBriefTemplateLinkChange = (link: string) => {
    setBriefTemplateLink(link)
    const id = extractGoogleSheetsId(link)
    setBriefTemplateSheetId(id)
  }

  const reset = () => {
    setBriefTemplateLink(
      defaultBriefTemplateSheetId
        ? `https://docs.google.com/spreadsheets/d/${defaultBriefTemplateSheetId}/edit`
        : '',
    )
    setBriefTemplateSheetId(defaultBriefTemplateSheetId)
  }

  return {
    briefTemplateSheetId,
    briefTemplateLink,
    briefTemplateSheetName,
    hasBriefTemplate: !!briefTemplateSheetId,
    handleBriefTemplateLinkChange,
    reset,
  }
}
