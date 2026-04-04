"use client"

/**
 * Хук загрузки данных участников проекта
 */

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { Database } from '@/types/database'
import type { Participant } from '@/types/entities'

type ProjectParticipant = Database['public']['Tables']['project_participants']['Row']
type ProjectRole = Database['public']['Tables']['project_roles']['Row']

export interface ParticipantWithUser extends ProjectParticipant {
  participant: Participant
}

interface UseProjectParticipantsDataParams {
  projectId: string
  workspaceId: string
  createdBy: string | null
}

export function useProjectParticipantsData({
  projectId,
  workspaceId,
  createdBy,
}: UseProjectParticipantsDataParams) {
  const [loading, setLoading] = useState(true)
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [projectParticipants, setProjectParticipants] = useState<ParticipantWithUser[]>([])
  const [creatorParticipant, setCreatorParticipant] = useState<Participant | null>(null)

  const loadProjectRoles = async () => {
    const { data, error } = await supabase
      .from('project_roles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('order_index')

    if (error) {
      logger.error('Ошибка загрузки ролей:', error)
      toast.error('Ошибка загрузки ролей')
      return []
    }

    return data || []
  }

  const loadWorkspaceParticipants = async () => {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('is_deleted', false)
      .order('name')

    if (error) {
      logger.error('Ошибка загрузки участников:', error)
      toast.error('Ошибка загрузки участников')
      return []
    }

    return data || []
  }

  const loadProjectParticipants = async () => {
    const { data, error } = await supabase
      .from('project_participants')
      .select(
        `
        *,
        participant:participants(*)
      `,
      )
      .eq('project_id', projectId)

    if (error) {
      logger.error('Ошибка загрузки участников проекта:', error)
      toast.error('Ошибка загрузки участников проекта')
      return []
    }

    return (data || []) as ParticipantWithUser[]
  }

  const loadCreator = async () => {
    if (!createdBy) return null

    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('user_id', createdBy)
      .eq('workspace_id', workspaceId)
      .eq('is_deleted', false)
      .single()

    if (error) {
      logger.error('Ошибка загрузки создателя проекта:', error)
      return null
    }

    return data
  }

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [roles, allParticipants, projParticipants, creator] = await Promise.all([
          loadProjectRoles(),
          loadWorkspaceParticipants(),
          loadProjectParticipants(),
          loadCreator(),
        ])
        setProjectRoles(roles)
        setParticipants(allParticipants)
        setProjectParticipants(projParticipants)
        setCreatorParticipant(creator)
      } catch (error) {
        logger.error('Ошибка загрузки данных участников:', error)
        toast.error('Ошибка загрузки данных участников')
      } finally {
        setLoading(false)
      }
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workspaceId, createdBy])

  const getParticipantsForRole = (roleName: string) => {
    return projectParticipants.filter((pp) => pp.project_roles.includes(roleName))
  }

  return {
    loading,
    projectRoles,
    participants,
    projectParticipants,
    setProjectParticipants,
    setParticipants,
    creatorParticipant,
    getParticipantsForRole,
    loadProjectParticipants,
    loadWorkspaceParticipants,
  }
}
