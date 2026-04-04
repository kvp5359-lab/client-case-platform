"use client"

import { useState } from 'react'

/**
 * Универсальный хук для диалога создания/редактирования.
 * Используется в компонентах, где один диалог открывается как для создания (editing=null),
 * так и для редактирования существующей записи (editing=T).
 */
export function useEditDialog<T>() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<T | null>(null)

  const openCreate = () => {
    setEditing(null)
    setOpen(true)
  }

  const openEdit = (item: T) => {
    setEditing(item)
    setOpen(true)
  }

  const close = () => setOpen(false)

  return { open, editing, openCreate, openEdit, close, setOpen }
}
