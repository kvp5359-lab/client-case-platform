/**
 * MultiSelect Component
 * Компонент для выбора нескольких значений с отображением в виде бэйджей
 */

import * as React from 'react'
import { X, ChevronDown, Search, Crown, Users, Link, HandshakeIcon, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

/** Роли сотрудников workspace (не клиенты/внешние) — вынесен из компонента для стабильности */
const STAFF_ROLES = new Set(['Администратор', 'Сотрудник'])

/** Маппинг ролей на иконки — вынесен из компонента для стабильности ссылки */
const ROLE_ICONS: Record<string, React.ElementType> = {
  Администратор: Crown,
  Сотрудник: Users,
  'Внешний сотрудник': Link,
  Клиент: HandshakeIcon,
}

function getInitials(option: MultiSelectOption) {
  const first = option.firstName?.[0] || option.label?.[0] || ''
  const last = option.lastName?.[0] || ''
  return (first + last).toUpperCase()
}

function getFullName(option: MultiSelectOption) {
  if (option.firstName && option.lastName) {
    return `${option.firstName} ${option.lastName}`
  }
  return option.label
}

function getRoleIcon(role?: string) {
  if (!role) return null
  return ROLE_ICONS[role] || null
}

export interface MultiSelectOption {
  value: string
  label: string
  // Дополнительные поля для участников
  firstName?: string
  lastName?: string
  workspaceRole?: string
  email?: string
  avatarUrl?: string
  isProjectParticipant?: boolean // Уже участвует в проекте (в другой роли)
}

export interface MultiSelectProps {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  showSearch?: boolean // Показывать ли поиск
  showExtendedInfo?: boolean // Показывать ли расширенную информацию (аватар, фамилия, роль)
  onAddNew?: () => void // Callback для добавления нового участника
}

/** Строка опции — вынесена для переиспользования в группах */
function OptionRow({
  option,
  isSelected,
  showExtendedInfo,
  onSelect,
}: {
  option: MultiSelectOption
  isSelected: boolean
  showExtendedInfo: boolean
  onSelect: (value: string) => void
}) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={cn(
        'flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors',
        isSelected && 'bg-accent/50',
      )}
      onClick={() => onSelect(option.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(option.value)
        }
      }}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onSelect(option.value)}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0"
      />

      {showExtendedInfo ? (
        <>
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
              {getInitials(option)}
            </AvatarFallback>
          </Avatar>

          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className="font-medium truncate">{getFullName(option)}</span>
            {option.workspaceRole &&
              getRoleIcon(option.workspaceRole) &&
              React.createElement(getRoleIcon(option.workspaceRole)!, {
                className: 'h-3.5 w-3.5 text-muted-foreground shrink-0',
                title: option.workspaceRole,
              })}
            {option.email && (
              <span className="text-xs text-muted-foreground truncate ml-auto">{option.email}</span>
            )}
          </div>
        </>
      ) : (
        <span className="flex-1">{option.label}</span>
      )}
    </div>
  )
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Выберите...',
  className,
  disabled = false,
  showSearch = false,
  showExtendedInfo = false,
  onAddNew,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')

  const handleSelect = (optionValue: string) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue]
    onChange(newValue)
  }

  const handleRemove = (optionValue: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    onChange(value.filter((v) => v !== optionValue))
  }

  const selectedOptions = options.filter((opt) => value.includes(opt.value))

  // Фильтрация и группировка по поисковому запросу
  const { staffOptions, contactOptions } = React.useMemo(() => {
    let filtered = options

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = options.filter((option) => {
        const fullName = `${option.firstName || ''} ${option.lastName || ''}`.toLowerCase()
        const label = option.label.toLowerCase()
        const role = option.workspaceRole?.toLowerCase() || ''
        const email = option.email?.toLowerCase() || ''

        return (
          fullName.includes(query) ||
          label.includes(query) ||
          role.includes(query) ||
          email.includes(query)
        )
      })
    }

    // Сортировка: сначала участники проекта, потом остальные
    const sortByProjectParticipant = (a: MultiSelectOption, b: MultiSelectOption) => {
      if (a.isProjectParticipant && !b.isProjectParticipant) return -1
      if (!a.isProjectParticipant && b.isProjectParticipant) return 1
      return 0
    }

    const staff = filtered
      .filter((o) => o.workspaceRole && STAFF_ROLES.has(o.workspaceRole))
      .sort(sortByProjectParticipant)
    const contacts = filtered
      .filter((o) => !o.workspaceRole || !STAFF_ROLES.has(o.workspaceRole))
      .sort(sortByProjectParticipant)

    return { staffOptions: staff, contactOptions: contacts }
  }, [options, searchQuery])

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)
        if (!isOpen) setSearchQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between h-9 px-3',
            !selectedOptions.length && 'text-muted-foreground',
            className,
          )}
          disabled={disabled}
        >
          <div className="flex gap-1 flex-1 overflow-x-auto scrollbar-hide items-center">
            {selectedOptions.length === 0 ? (
              <span>{placeholder}</span>
            ) : (
              selectedOptions.map((option) => (
                <Badge
                  key={option.value}
                  variant="secondary"
                  className="text-xs font-normal pl-1 pr-1.5 py-0.5 flex items-center gap-1.5 bg-muted/60 hover:bg-muted/80 shrink-0"
                >
                  {showExtendedInfo ? (
                    <>
                      <Avatar className="h-5 w-5 shrink-0">
                        <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                          {getInitials(option)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate max-w-[120px]">{getFullName(option)}</span>
                    </>
                  ) : (
                    <span>{option.label}</span>
                  )}
                  <button
                    type="button"
                    tabIndex={0}
                    className="ml-0.5 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer inline-flex items-center"
                    aria-label={`Удалить ${option.label}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={(e) => handleRemove(option.value, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') handleRemove(option.value, e)
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-[280px] max-w-[420px] p-0" align="start">
        {/* Поиск */}
        {showSearch && (
          <div className="p-2 border-b">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск участников..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              {onAddNew && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen(false)
                    onAddNew()
                  }}
                  title="Добавить нового участника"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Список опций */}
        <div
          className="max-h-[512px] overflow-y-auto p-1"
          role="listbox"
          aria-multiselectable="true"
        >
          {staffOptions.length === 0 && contactOptions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {searchQuery ? 'Ничего не найдено' : 'Нет доступных вариантов'}
            </div>
          ) : (
            <>
              {showExtendedInfo && staffOptions.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Сотрудники
                  </div>
                  {staffOptions.map((option) => (
                    <OptionRow
                      key={option.value}
                      option={option}
                      isSelected={value.includes(option.value)}
                      showExtendedInfo={showExtendedInfo}
                      onSelect={handleSelect}
                    />
                  ))}
                </>
              )}
              {showExtendedInfo && contactOptions.length > 0 && (
                <>
                  {staffOptions.length > 0 && <div className="my-1 border-t" />}
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Контакты
                  </div>
                  {contactOptions.map((option) => (
                    <OptionRow
                      key={option.value}
                      option={option}
                      isSelected={value.includes(option.value)}
                      showExtendedInfo={showExtendedInfo}
                      onSelect={handleSelect}
                    />
                  ))}
                </>
              )}
              {!showExtendedInfo &&
                [...staffOptions, ...contactOptions].map((option) => (
                  <OptionRow
                    key={option.value}
                    option={option}
                    isSelected={value.includes(option.value)}
                    showExtendedInfo={showExtendedInfo}
                    onSelect={handleSelect}
                  />
                ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
