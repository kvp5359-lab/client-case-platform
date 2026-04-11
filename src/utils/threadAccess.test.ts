import { describe, it, expect } from 'vitest'
import {
  canAccessThread,
  type ThreadAccessInfo,
  type ThreadAccessParams,
} from './threadAccess'

function makeThread(overrides: Partial<ThreadAccessInfo> = {}): ThreadAccessInfo {
  return {
    id: 't1',
    project_id: 'p1',
    access_type: 'all',
    access_roles: null,
    created_by: 'creator-id',
    ...overrides,
  }
}

function makeParams(overrides: Partial<ThreadAccessParams> = {}): ThreadAccessParams {
  return {
    thread: makeThread(),
    userId: 'user-1',
    participantId: 'participant-1',
    projectRoles: ['Член'],
    isAssignee: false,
    isMember: false,
    hasViewAllProjects: false,
    ...overrides,
  }
}

describe('canAccessThread', () => {
  describe('правило 1: workspace-level тред', () => {
    it('всегда доступен любому пользователю', () => {
      const params = makeParams({
        thread: makeThread({ project_id: null }),
        projectRoles: null,
      })
      expect(canAccessThread(params)).toBe(true)
    })
  })

  describe('правило 2: view_all_projects', () => {
    it('даёт доступ ко всем тредам', () => {
      const params = makeParams({
        projectRoles: null,
        hasViewAllProjects: true,
      })
      expect(canAccessThread(params)).toBe(true)
    })
  })

  describe('правило 3: администратор проекта', () => {
    it('имеет доступ ко всем тредам проекта', () => {
      const params = makeParams({
        projectRoles: ['Администратор'],
        thread: makeThread({ access_type: 'custom' }),
      })
      expect(canAccessThread(params)).toBe(true)
    })
  })

  describe('правило 4: создатель треда', () => {
    it('имеет доступ к своему треду', () => {
      const params = makeParams({
        userId: 'creator-id',
        thread: makeThread({ created_by: 'creator-id', access_type: 'custom' }),
      })
      expect(canAccessThread(params)).toBe(true)
    })
  })

  describe('правило 5: исполнитель задачи', () => {
    it('имеет доступ когда isAssignee=true', () => {
      const params = makeParams({
        isAssignee: true,
        thread: makeThread({ access_type: 'custom' }),
      })
      expect(canAccessThread(params)).toBe(true)
    })
  })

  describe('правило 6: access_type = all', () => {
    it('даёт доступ участнику проекта', () => {
      const params = makeParams({
        thread: makeThread({ access_type: 'all' }),
      })
      expect(canAccessThread(params)).toBe(true)
    })

    it('не даёт доступ если не участник проекта', () => {
      const params = makeParams({
        projectRoles: null,
        thread: makeThread({ access_type: 'all' }),
      })
      expect(canAccessThread(params)).toBe(false)
    })
  })

  describe('правило 7: access_type = roles', () => {
    it('даёт доступ при пересечении ролей', () => {
      const params = makeParams({
        projectRoles: ['Юрист'],
        thread: makeThread({
          access_type: 'roles',
          access_roles: ['Юрист', 'Стажёр'],
        }),
      })
      expect(canAccessThread(params)).toBe(true)
    })

    it('отказывает при отсутствии пересечения', () => {
      const params = makeParams({
        projectRoles: ['Стажёр'],
        thread: makeThread({
          access_type: 'roles',
          access_roles: ['Юрист'],
        }),
      })
      expect(canAccessThread(params)).toBe(false)
    })

    it('отказывает при пустом access_roles', () => {
      const params = makeParams({
        thread: makeThread({
          access_type: 'roles',
          access_roles: [],
        }),
      })
      expect(canAccessThread(params)).toBe(false)
    })
  })

  describe('правило 8: access_type = custom', () => {
    it('даёт доступ члену custom-треда', () => {
      const params = makeParams({
        isMember: true,
        thread: makeThread({ access_type: 'custom' }),
      })
      expect(canAccessThread(params)).toBe(true)
    })

    it('отказывает не-члену custom-треда', () => {
      const params = makeParams({
        isMember: false,
        thread: makeThread({ access_type: 'custom' }),
      })
      expect(canAccessThread(params)).toBe(false)
    })
  })

  describe('случай по умолчанию', () => {
    it('отказывает не-участнику без специальных прав', () => {
      const params = makeParams({
        projectRoles: null,
      })
      expect(canAccessThread(params)).toBe(false)
    })

    it('отказывает участнику без подходящего правила', () => {
      const params = makeParams({
        thread: makeThread({ access_type: 'unknown' }),
      })
      expect(canAccessThread(params)).toBe(false)
    })
  })
})
