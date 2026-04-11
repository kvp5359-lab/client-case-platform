/**
 * Тесты для useDocumentKitUIStore — главного стора DocumentKitUI.
 *
 * Покрываем:
 *  - экшены UISlice (collapse, hover, tabs, фильтры)
 *  - select-функции (через прямой вызов на снимке state)
 *  - resetState (полный сброс к дефолтам)
 *
 * Стор собирается из 4 слайсов (UI, Dialogs, Operations, GoogleDrive)
 * + глобальный resetState. Тут фокусируемся на UI слайсе и общих
 * структурных проверках; остальные слайсы покрываются доп. тестами
 * по необходимости.
 *
 * localStorage мокается через vi.stubGlobal: uiSlice читает его
 * синхронно при инициализации (и при setSystemSectionTab пишет).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useDocumentKitUIStore } from './store'
import {
  selectUI,
  selectDialogs,
  selectOperations,
  selectGoogleDrive,
  selectEditDialog,
  selectContentView,
  selectMoveDialog,
  selectMergeDialog,
  selectExportDialog,
  selectFolderDialogs,
  selectBatchCheck,
  selectCompress,
  selectSourceConnection,
  selectSourceSettings,
  selectConnectSource,
  selectKitSettings,
} from './selectFunctions'

// ─── Mock localStorage ───
function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    clear() {
      store = {}
    },
    getItem(key: string) {
      return key in store ? store[key] : null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
  // Сбрасываем стор к чистому состоянию через resetState
  useDocumentKitUIStore.getState().resetState()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ============================================================
// UI Slice — экшены
// ============================================================

describe('toggleFolderCollapse', () => {
  it('добавляет folderId в collapsedFolders при первом вызове', () => {
    useDocumentKitUIStore.getState().toggleFolderCollapse('folder-1')
    const state = useDocumentKitUIStore.getState()
    expect(state.collapsedFolders.has('folder-1')).toBe(true)
  })

  it('удаляет folderId из collapsedFolders при повторном вызове', () => {
    useDocumentKitUIStore.getState().toggleFolderCollapse('folder-1')
    useDocumentKitUIStore.getState().toggleFolderCollapse('folder-1')
    expect(useDocumentKitUIStore.getState().collapsedFolders.has('folder-1')).toBe(false)
  })

  it('создаёт новый Set, не мутирует старый (immutability)', () => {
    const before = useDocumentKitUIStore.getState().collapsedFolders
    useDocumentKitUIStore.getState().toggleFolderCollapse('folder-1')
    const after = useDocumentKitUIStore.getState().collapsedFolders
    // Ссылка должна быть новая
    expect(after).not.toBe(before)
    // Старый Set не изменился
    expect(before.has('folder-1')).toBe(false)
  })

  it('независимо обрабатывает несколько папок', () => {
    useDocumentKitUIStore.getState().toggleFolderCollapse('f-1')
    useDocumentKitUIStore.getState().toggleFolderCollapse('f-2')
    useDocumentKitUIStore.getState().toggleFolderCollapse('f-3')

    const folders = useDocumentKitUIStore.getState().collapsedFolders
    expect(folders.has('f-1')).toBe(true)
    expect(folders.has('f-2')).toBe(true)
    expect(folders.has('f-3')).toBe(true)
    expect(folders.size).toBe(3)
  })
})

describe('setUploadingFiles', () => {
  it('заменяет список загружаемых файлов', () => {
    useDocumentKitUIStore.getState().setUploadingFiles(['file-1.pdf', 'file-2.docx'])
    expect(useDocumentKitUIStore.getState().uploadingFiles).toEqual(['file-1.pdf', 'file-2.docx'])
  })

  it('очищает список пустым массивом', () => {
    useDocumentKitUIStore.getState().setUploadingFiles(['x'])
    useDocumentKitUIStore.getState().setUploadingFiles([])
    expect(useDocumentKitUIStore.getState().uploadingFiles).toEqual([])
  })
})

describe('drag & drop hover', () => {
  it('setTargetFolder обновляет targetFolderId', () => {
    useDocumentKitUIStore.getState().setTargetFolder('folder-1')
    expect(useDocumentKitUIStore.getState().targetFolderId).toBe('folder-1')

    useDocumentKitUIStore.getState().setTargetFolder(null)
    expect(useDocumentKitUIStore.getState().targetFolderId).toBe(null)
  })

  it('setHoveredFolder обновляет hoveredFolderId', () => {
    useDocumentKitUIStore.getState().setHoveredFolder('folder-1')
    expect(useDocumentKitUIStore.getState().hoveredFolderId).toBe('folder-1')
  })

  it('setHoveredDocument обновляет hoveredDocumentId', () => {
    useDocumentKitUIStore.getState().setHoveredDocument('doc-1')
    expect(useDocumentKitUIStore.getState().hoveredDocumentId).toBe('doc-1')
  })
})

describe('setSystemSectionTab', () => {
  it('обновляет systemSectionTab', () => {
    useDocumentKitUIStore.getState().setSystemSectionTab('source')
    expect(useDocumentKitUIStore.getState().systemSectionTab).toBe('source')
  })

  it('сохраняет в localStorage', () => {
    useDocumentKitUIStore.getState().setSystemSectionTab('destination')
    expect(localStorage.getItem('documentKit:activeTab')).toBe('destination')
  })

  it('переключение между всеми вкладками работает', () => {
    const tabs = ['unassigned', 'source', 'destination', 'trash'] as const
    for (const tab of tabs) {
      useDocumentKitUIStore.getState().setSystemSectionTab(tab)
      expect(useDocumentKitUIStore.getState().systemSectionTab).toBe(tab)
    }
  })
})

describe('toggle/set collapse флаги', () => {
  it('toggleUnassignedCollapse инвертирует флаг', () => {
    useDocumentKitUIStore.getState().toggleUnassignedCollapse()
    expect(useDocumentKitUIStore.getState().unassignedCollapsed).toBe(true)
    useDocumentKitUIStore.getState().toggleUnassignedCollapse()
    expect(useDocumentKitUIStore.getState().unassignedCollapsed).toBe(false)
  })

  it('toggleSourceCollapse инвертирует флаг', () => {
    useDocumentKitUIStore.getState().toggleSourceCollapse()
    expect(useDocumentKitUIStore.getState().sourceCollapsed).toBe(true)
  })

  it('toggleDestinationCollapse инвертирует флаг', () => {
    useDocumentKitUIStore.getState().toggleDestinationCollapse()
    expect(useDocumentKitUIStore.getState().destinationCollapsed).toBe(true)
  })

  it('toggleTrashCollapse инвертирует флаг', () => {
    useDocumentKitUIStore.getState().toggleTrashCollapse()
    expect(useDocumentKitUIStore.getState().trashCollapsed).toBe(true)
  })

  it('setUnassignedCollapsed устанавливает явное значение', () => {
    useDocumentKitUIStore.getState().setUnassignedCollapsed(true)
    expect(useDocumentKitUIStore.getState().unassignedCollapsed).toBe(true)
    useDocumentKitUIStore.getState().setUnassignedCollapsed(false)
    expect(useDocumentKitUIStore.getState().unassignedCollapsed).toBe(false)
  })

  it('setSourceCollapsed/setDestinationCollapsed/setTrashCollapsed', () => {
    useDocumentKitUIStore.getState().setSourceCollapsed(true)
    useDocumentKitUIStore.getState().setDestinationCollapsed(true)
    useDocumentKitUIStore.getState().setTrashCollapsed(true)

    const state = useDocumentKitUIStore.getState()
    expect(state.sourceCollapsed).toBe(true)
    expect(state.destinationCollapsed).toBe(true)
    expect(state.trashCollapsed).toBe(true)
  })
})

describe('фильтры', () => {
  it('toggleShowOnlyUnverified инвертирует фильтр', () => {
    useDocumentKitUIStore.getState().toggleShowOnlyUnverified()
    expect(useDocumentKitUIStore.getState().showOnlyUnverified).toBe(true)
    useDocumentKitUIStore.getState().toggleShowOnlyUnverified()
    expect(useDocumentKitUIStore.getState().showOnlyUnverified).toBe(false)
  })

  it('setStatusDropdownOpen открывает дропдаун для документа', () => {
    useDocumentKitUIStore.getState().setStatusDropdownOpen('doc-1')
    expect(useDocumentKitUIStore.getState().statusDropdownOpen).toBe('doc-1')

    useDocumentKitUIStore.getState().setStatusDropdownOpen(null)
    expect(useDocumentKitUIStore.getState().statusDropdownOpen).toBe(null)
  })
})

// ============================================================
// resetState — полный сброс
// ============================================================

describe('resetState', () => {
  it('сбрасывает все UI поля к дефолтам', () => {
    // Накатываем кучу состояния
    useDocumentKitUIStore.getState().toggleFolderCollapse('f-1')
    useDocumentKitUIStore.getState().setUploadingFiles(['x'])
    useDocumentKitUIStore.getState().setTargetFolder('t-1')
    useDocumentKitUIStore.getState().setHoveredFolder('h-1')
    useDocumentKitUIStore.getState().setHoveredDocument('d-1')
    useDocumentKitUIStore.getState().setSystemSectionTab('source')
    useDocumentKitUIStore.getState().setUnassignedCollapsed(true)
    useDocumentKitUIStore.getState().toggleShowOnlyUnverified()
    useDocumentKitUIStore.getState().setStatusDropdownOpen('doc-1')

    useDocumentKitUIStore.getState().resetState()

    const state = useDocumentKitUIStore.getState()
    expect(state.collapsedFolders.size).toBe(0)
    expect(state.uploadingFiles).toEqual([])
    expect(state.targetFolderId).toBe(null)
    expect(state.hoveredFolderId).toBe(null)
    expect(state.hoveredDocumentId).toBe(null)
    expect(state.systemSectionTab).toBe('unassigned')
    expect(state.unassignedCollapsed).toBe(false)
    expect(state.showOnlyUnverified).toBe(false)
    expect(state.statusDropdownOpen).toBe(null)
  })

  it('сбрасывает поля диалогов', () => {
    const state = useDocumentKitUIStore.getState()
    state.resetState()

    const after = useDocumentKitUIStore.getState()
    expect(after.moveDialogOpen).toBe(false)
    expect(after.editDialogOpen).toBe(false)
    expect(after.contentViewDialogOpen).toBe(false)
    expect(after.batchCheckDialogOpen).toBe(false)
    expect(after.addFolderDialogOpen).toBe(false)
    expect(after.kitSettingsDialogOpen).toBe(false)
    expect(after.folderTemplates).toEqual([])
    expect(after.selectedTemplateIds).toEqual([])
  })

  it('сбрасывает поля операций', () => {
    useDocumentKitUIStore.getState().resetState()
    const state = useDocumentKitUIStore.getState()

    expect(state.isCheckingDocument).toBe(false)
    expect(state.isMerging).toBe(false)
    expect(state.isCompressing).toBe(false)
    expect(state.isExportingToDisk).toBe(false)
    expect(state.exportPhase).toBe('idle')
    expect(state.exportSyncMode).toBe('replace_all')
    expect(state.compressingDocIds.size).toBe(0)
  })

  it('сбрасывает Google Drive поля', () => {
    useDocumentKitUIStore.getState().resetState()
    const state = useDocumentKitUIStore.getState()

    expect(state.connectSourceDialogOpen).toBe(false)
    expect(state.sourceFolderLink).toBe('')
    expect(state.isSourceConnected).toBe(false)
    expect(state.isSyncing).toBe(false)
    expect(state.hasExported).toBe(false)
    expect(state.sourceDocuments).toEqual([])
    expect(state.destinationDocuments).toEqual([])
  })
})

// ============================================================
// Select-функции — чистые проверки на снимке state
// ============================================================

describe('select-функции', () => {
  it('selectUI возвращает только UI поля', () => {
    useDocumentKitUIStore.getState().setSystemSectionTab('source')
    useDocumentKitUIStore.getState().setHoveredFolder('f-1')

    const ui = selectUI(useDocumentKitUIStore.getState())

    expect(ui.systemSectionTab).toBe('source')
    expect(ui.hoveredFolderId).toBe('f-1')
    // Не должен возвращать поля диалогов
    expect('moveDialogOpen' in ui).toBe(false)
    expect('isMerging' in ui).toBe(false)
  })

  it('selectDialogs возвращает только поля диалогов', () => {
    const dialogs = selectDialogs(useDocumentKitUIStore.getState())

    // Содержит ключи диалогов
    expect('moveDialogOpen' in dialogs).toBe(true)
    expect('editDialogOpen' in dialogs).toBe(true)
    expect('contentViewDialogOpen' in dialogs).toBe(true)
    // Не содержит UI/Operations
    expect('hoveredFolderId' in dialogs).toBe(false)
    expect('isMerging' in dialogs).toBe(false)
  })

  it('selectOperations возвращает только поля операций', () => {
    const ops = selectOperations(useDocumentKitUIStore.getState())

    expect('isCheckingDocument' in ops).toBe(true)
    expect('isMerging' in ops).toBe(true)
    expect('exportPhase' in ops).toBe(true)
    expect('hoveredFolderId' in ops).toBe(false)
  })

  it('selectGoogleDrive возвращает только Google Drive поля', () => {
    const gd = selectGoogleDrive(useDocumentKitUIStore.getState())

    expect('isSourceConnected' in gd).toBe(true)
    expect('sourceFolderLink' in gd).toBe(true)
    expect('exportFolderName' in gd).toBe(true)
    expect('moveDialogOpen' in gd).toBe(false)
  })

  // ─── Granular selectors ───

  it('selectEditDialog возвращает поля для редактирования документа', () => {
    const sel = selectEditDialog(useDocumentKitUIStore.getState())
    expect(Object.keys(sel).sort()).toEqual(
      [
        'editDialogOpen',
        'documentToEdit',
        'editName',
        'editDescription',
        'editStatus',
        'suggestedNames',
        'isCheckingDocument',
      ].sort(),
    )
  })

  it('selectContentView возвращает поля просмотра контента', () => {
    const sel = selectContentView(useDocumentKitUIStore.getState())
    expect(Object.keys(sel).sort()).toEqual(
      ['contentViewDialogOpen', 'documentContent', 'isLoadingContent'].sort(),
    )
  })

  it('selectMoveDialog возвращает поля диалога перемещения', () => {
    const sel = selectMoveDialog(useDocumentKitUIStore.getState())
    expect('moveDialogOpen' in sel).toBe(true)
    expect('documentToMove' in sel).toBe(true)
    expect('isBatchMoving' in sel).toBe(true)
  })

  it('selectMergeDialog возвращает поля диалога слияния', () => {
    const sel = selectMergeDialog(useDocumentKitUIStore.getState())
    expect('mergeDialogOpen' in sel).toBe(true)
    expect('mergeDocsList' in sel).toBe(true)
    expect('mergeName' in sel).toBe(true)
  })

  it('selectExportDialog возвращает поля экспорта в Drive', () => {
    const sel = selectExportDialog(useDocumentKitUIStore.getState())
    expect('exportToDiskDialogOpen' in sel).toBe(true)
    expect('exportPhase' in sel).toBe(true)
    expect('googleDriveFolderLink' in sel).toBe(true)
  })

  it('selectFolderDialogs возвращает поля диалогов папок и шаблонов', () => {
    const sel = selectFolderDialogs(useDocumentKitUIStore.getState())
    expect('addFolderDialogOpen' in sel).toBe(true)
    expect('templateSelectDialogOpen' in sel).toBe(true)
    expect('folderFormData' in sel).toBe(true)
    expect('selectedTemplateIds' in sel).toBe(true)
  })

  it('selectBatchCheck возвращает поля массовой проверки', () => {
    const sel = selectBatchCheck(useDocumentKitUIStore.getState())
    expect(Object.keys(sel).sort()).toEqual(
      ['batchCheckDialogOpen', 'batchCheckDocumentIds', 'isCheckingBatch', 'checkProgress'].sort(),
    )
  })

  it('selectCompress возвращает поля сжатия', () => {
    const sel = selectCompress(useDocumentKitUIStore.getState())
    expect(Object.keys(sel).sort()).toEqual(
      ['isCompressing', 'compressProgress', 'compressingDocIds'].sort(),
    )
  })

  it('selectSourceConnection возвращает только имя+статус подключения', () => {
    const sel = selectSourceConnection(useDocumentKitUIStore.getState())
    expect(Object.keys(sel).sort()).toEqual(['sourceFolderName', 'isSourceConnected'].sort())
  })

  it('selectSourceSettings возвращает поля диалога настроек источника', () => {
    const sel = selectSourceSettings(useDocumentKitUIStore.getState())
    expect('sourceSettingsDialogOpen' in sel).toBe(true)
    expect('sourceFolderLink' in sel).toBe(true)
    expect('isSourceConnected' in sel).toBe(true)
  })

  it('selectConnectSource возвращает поля диалога подключения', () => {
    const sel = selectConnectSource(useDocumentKitUIStore.getState())
    expect(Object.keys(sel).sort()).toEqual(
      ['connectSourceDialogOpen', 'sourceFolderLink'].sort(),
    )
  })

  it('selectKitSettings возвращает поля настроек kit (источник + экспорт)', () => {
    const sel = selectKitSettings(useDocumentKitUIStore.getState())
    expect('kitSettingsDialogOpen' in sel).toBe(true)
    expect('sourceFolderLink' in sel).toBe(true)
    expect('exportFolderName' in sel).toBe(true)
    expect('googleDriveFolderLink' in sel).toBe(true)
  })
})

// ============================================================
// Селекторы реактивны на изменения state
// ============================================================

describe('реактивность селекторов', () => {
  it('selectUI отражает изменения после экшенов', () => {
    const before = selectUI(useDocumentKitUIStore.getState())
    expect(before.targetFolderId).toBe(null)

    useDocumentKitUIStore.getState().setTargetFolder('f-99')
    const after = selectUI(useDocumentKitUIStore.getState())
    expect(after.targetFolderId).toBe('f-99')
  })

  it('selectOperations отражает изменения isMerging через resetState и обратно', () => {
    // resetState возвращает в дефолты
    useDocumentKitUIStore.getState().resetState()
    expect(selectOperations(useDocumentKitUIStore.getState()).isMerging).toBe(false)

    // Прямая мутация через setState (не экшен) — для демонстрации
    useDocumentKitUIStore.setState({ isMerging: true })
    expect(selectOperations(useDocumentKitUIStore.getState()).isMerging).toBe(true)
  })
})
