import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface MessageSearchProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  isOpen: boolean
  onToggle: () => void
  resultCount: number
  isSearching: boolean
}

export function MessageSearch({
  searchQuery,
  onSearchChange,
  isOpen,
  onToggle,
  resultCount,
  isSearching,
}: MessageSearchProps) {
  if (!isOpen) {
    return (
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle}>
        <Search className="h-3.5 w-3.5" />
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Поиск..."
          className="h-7 w-40 text-xs pr-6"
          autoFocus
        />
        {searchQuery && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
            {isSearching ? '...' : resultCount}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => {
          onSearchChange('')
          onToggle()
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
