/**
 * Shared tree connector lines — vertical and horizontal branches.
 * Used by GroupTreeItem (Knowledge Base) and QuickReplyGroupTreeItem (Quick Replies).
 */

import { INDENT, ICON_CENTER, getLineX } from './TreeConstants'

export function TreeConnector({ depth, isLast }: { depth: number; isLast: boolean }) {
  if (depth === 0) return null
  const x = getLineX(depth)
  const branchWidth = INDENT - ICON_CENTER + 2
  return (
    <>
      <div
        className="absolute border-l border-border/50"
        style={{ left: `${x}px`, top: 0, bottom: isLast ? '50%' : 0 }}
      />
      <div
        className="absolute border-t border-border/50"
        style={{ left: `${x}px`, top: '50%', width: `${branchWidth}px` }}
      />
    </>
  )
}
