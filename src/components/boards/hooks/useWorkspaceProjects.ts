"use client"

// Хук useWorkspaceProjects (полная выборка projects воркспейса) удалён после
// перехода досок на серверную фильтрацию (get_board_filtered_projects, 2026-06-11)
// — чтобы никто случайно не вернул full-table-запрос. Остался только тип
// BoardProject (его импортируют 8 файлов досок).

// BoardProject переехал в нейтральный @/types/board (T1) — реэкспорт для
// 8+ файлов досок, импортирующих тип отсюда.
export type { BoardProject } from '@/types/board'
