"use client"

/**
 * LeadTemplateSetting — карточка выбора дефолтного шаблона лида для одного
 * источника входящих (этап 9 CRM-фрейма).
 *
 * Хранит маппинг в `workspaces.default_lead_template_per_source` (jsonb).
 * Когда webhook этого источника получает сообщение от незнакомого контакта
 * и не находит активного проекта — RPC route_incoming_to_project создаёт
 * новый лид по этому шаблону. Если шаблон не выбран — сообщение падает в
 * legacy-логику источника (например, gmail-webhook просто дропнет письмо).
 */

import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Target } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

export type LeadSource = 'email' | 'telegram' | 'telegram_business' | 'telegram_mtproto' | 'wazzup'

interface Props {
  workspaceId: string
  source: LeadSource
}

interface ProjectTemplateRow {
  id: string
  name: string
  is_lead_template: boolean
}

const SOURCE_LABELS: Record<LeadSource, string> = {
  email: 'Email',
  telegram: 'Telegram (групповые чаты, личка с ботом)',
  telegram_business: 'Telegram Business (личные диалоги сотрудников)',
  telegram_mtproto: 'Telegram MTProto (через номер телефона)',
  wazzup: 'WhatsApp / Instagram (Wazzup)',
}

const SOURCE_HINT: Record<LeadSource, string> = {
  email:
    'Если на ящик придёт письмо от неизвестного отправителя — система автоматически создаст лид по этому шаблону.',
  telegram:
    'Если в чат с ботом напишет незнакомый клиент — будет создан лид.',
  telegram_business:
    'Если клиент напишет в личный Telegram сотрудника — создаётся лид. Если шаблон не выбран — сообщение попадает в системный инбокс «Личные диалоги Telegram» как раньше.',
  telegram_mtproto:
    'Аналогично Telegram Business для MTProto-режима.',
  wazzup:
    'Если клиент напишет в WhatsApp/Instagram — создаётся лид. Если шаблон не выбран — сообщение попадает в системный инбокс Wazzup как раньше.',
}

export function LeadTemplateSetting({ workspaceId, source }: Props) {
  const queryClient = useQueryClient()

  const { data: settings } = useQuery({
    queryKey: ['workspace-default-lead-templates', workspaceId],
    queryFn: async (): Promise<Record<string, string | null>> => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('default_lead_template_per_source')
        .eq('id', workspaceId)
        .single()
      if (error) throw error
      return (data?.default_lead_template_per_source as Record<string, string | null>) ?? {}
    },
    enabled: !!workspaceId,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['project-templates-for-lead-routing', workspaceId],
    queryFn: async (): Promise<ProjectTemplateRow[]> => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, name, is_lead_template')
        .eq('workspace_id', workspaceId)
        .order('is_lead_template', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProjectTemplateRow[]
    },
    enabled: !!workspaceId,
  })

  const currentTemplateId = useMemo(() => settings?.[source] ?? null, [settings, source])

  const updateMut = useMutation({
    mutationFn: async (newTemplateId: string | null) => {
      const next = { ...(settings ?? {}) }
      if (newTemplateId) next[source] = newTemplateId
      else delete next[source]
      const { error } = await supabase
        .from('workspaces')
        .update({ default_lead_template_per_source: next })
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workspace-default-lead-templates', workspaceId],
      })
      toast.success('Шаблон лида обновлён')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить')
    },
  })

  return (
    <Card className="border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
            <Target className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-base">Авто-создание лидов из {SOURCE_LABELS[source]}</CardTitle>
            <CardDescription className="mt-0.5">{SOURCE_HINT[source]}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          <Label htmlFor={`lead-tpl-${source}`}>Шаблон лида</Label>
          <Select
            value={currentTemplateId ?? '__none__'}
            onValueChange={(v) => updateMut.mutate(v === '__none__' ? null : v)}
            disabled={updateMut.isPending}
          >
            <SelectTrigger id={`lead-tpl-${source}`}>
              <SelectValue placeholder="Не создавать автоматически" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— не создавать (legacy) —</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    {t.name}
                    {t.is_lead_template && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        Лид
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
