import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getGroupColor, getTagColors, NotionPill } from '@/utils/notionPill'
import type { KnowledgeArticle, useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

export function InlineGroupsCell({
  article,
  page,
}: {
  article: KnowledgeArticle
  page: PageReturn
}) {
  const [open, setOpen] = useState(false)
  const currentGroupIds = article.knowledge_article_groups.map((ag) => ag.group_id)

  const handleToggle = (groupId: string) => {
    const newIds = currentGroupIds.includes(groupId)
      ? currentGroupIds.filter((id) => id !== groupId)
      : [...currentGroupIds, groupId]
    page.updateArticleGroupsMutation.mutate({ articleId: article.id, groupIds: newIds })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="flex gap-1 items-center min-h-[20px] cursor-pointer rounded px-1 -mx-1 hover:bg-gray-50 transition-colors overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {article.knowledge_article_groups.map((ag) => {
            if (!ag.knowledge_groups) return null
            const c = getGroupColor(ag.knowledge_groups.name, ag.knowledge_groups.color)
            return (
              <NotionPill
                key={ag.group_id}
                name={ag.knowledge_groups.name}
                bg={c.bg}
                text={c.text}
              />
            )
          })}
          {article.knowledge_article_groups.length === 0 && (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-0.5 max-h-60 overflow-auto">
          {page.groups.map((group) => {
            const c = getGroupColor(group.name, group.color)
            return (
              <label
                key={group.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <Checkbox
                  checked={currentGroupIds.includes(group.id)}
                  onCheckedChange={() => handleToggle(group.id)}
                />
                <NotionPill name={group.name} bg={c.bg} text={c.text} />
              </label>
            )
          })}
          {page.groups.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-3 text-center">Нет групп</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function InlineTagsCell({ article, page }: { article: KnowledgeArticle; page: PageReturn }) {
  const [open, setOpen] = useState(false)
  const currentTagIds = (article.knowledge_article_tags || []).map((at) => at.tag_id)

  const handleToggle = (tagId: string) => {
    const newIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId]
    page.updateArticleTagsMutation.mutate({ articleId: article.id, tagIds: newIds })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          className="flex items-center gap-1 min-h-[20px] cursor-pointer rounded px-1 -mx-1 hover:bg-gray-50 transition-colors overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {article.knowledge_article_tags?.map((at) => {
            if (!at.knowledge_tags) return null
            const c = getTagColors(at.knowledge_tags.color)
            return (
              <NotionPill key={at.tag_id} name={at.knowledge_tags.name} bg={c.bg} text={c.text} />
            )
          })}
          {(!article.knowledge_article_tags || article.knowledge_article_tags.length === 0) && (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-0.5 max-h-60 overflow-auto">
          {page.tags.map((tag) => {
            const c = getTagColors(tag.color)
            return (
              <label
                key={tag.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <Checkbox
                  checked={currentTagIds.includes(tag.id)}
                  onCheckedChange={() => handleToggle(tag.id)}
                />
                <NotionPill name={tag.name} bg={c.bg} text={c.text} />
              </label>
            )
          })}
          {page.tags.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-3 text-center">Нет тегов</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
