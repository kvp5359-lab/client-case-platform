/**
 * Диалог привязки/отвязки email к чату.
 * Аналог TelegramLinkDialog, но для email-канала.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Unlink, Loader2, Mail } from 'lucide-react'
import { useCreateEmailLink, useRemoveEmailLink, type EmailLink } from '@/hooks/email/useEmailLink'
import { toast } from 'sonner'

interface EmailLinkDialogProps {
  open: boolean
  onClose: () => void
  chatId: string | undefined
  emailLink: EmailLink | null
}

export function EmailLinkDialog({ open, onClose, chatId, emailLink }: EmailLinkDialogProps) {
  const [contactEmail, setContactEmail] = useState('')
  const [subject, setSubject] = useState('')

  const createLink = useCreateEmailLink(chatId)
  const removeLink = useRemoveEmailLink(chatId)

  const isLinked = !!emailLink

  const handleLink = () => {
    const email = contactEmail.trim()
    if (!email) return

    createLink.mutate(
      { contactEmail: email, subject: subject.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Email привязан к чату')
          setContactEmail('')
          setSubject('')
          onClose()
        },
        onError: () => {
          toast.error('Не удалось привязать email')
        },
      },
    )
  }

  const handleUnlink = () => {
    if (!emailLink) return
    removeLink.mutate(emailLink.id, {
      onSuccess: () => {
        toast.success('Email отвязан от чата')
        onClose()
      },
      onError: () => {
        toast.error('Не удалось отвязать email')
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Email-интеграция</DialogTitle>
          <DialogDescription>
            {isLinked
              ? 'Email-переписка привязана к чату'
              : 'Привяжите email клиента для переписки через Gmail'}
          </DialogDescription>
        </DialogHeader>

        {isLinked ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-red-500" />
                <span className="font-medium text-sm">{emailLink.contact_email}</span>
              </div>
              {emailLink.subject && (
                <p className="text-xs text-muted-foreground mt-1">Тема: {emailLink.subject}</p>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              onClick={handleUnlink}
              disabled={removeLink.isPending}
            >
              {removeLink.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4 mr-2" />
              )}
              Отвязать email
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-email">Email клиента</Label>
              <Input
                id="link-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="client@company.com"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && contactEmail.trim()) handleLink()
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-subject">
                Тема <span className="text-muted-foreground">(опционально)</span>
              </Label>
              <Input
                id="link-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Тема email-переписки"
              />
            </div>
            <Button
              className="w-full"
              onClick={handleLink}
              disabled={!contactEmail.trim() || createLink.isPending}
            >
              {createLink.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Привязать email
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
