import type { SidebarNavKey } from '@/lib/sidebarSettings'

export type AvailableEntry =
  | { kind: 'nav'; id: string; label: string; navKey: SidebarNavKey }
  | { kind: 'board'; id: string; label: string; boardId: string }
  | { kind: 'list'; id: string; label: string; listId: string; entityType: 'thread' | 'project' }
  | { kind: 'section'; id: string; label: string; sectionId: string }
  | { kind: 'quickaction'; id: string; label: string; actionId: string; icon: string }
