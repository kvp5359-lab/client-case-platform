/**
 * Диалог создания/редактирования определения поля
 *
 * Чистый UI-компонент. Вся логика формы — в useFieldDefinitionForm (B-69 SRP)
 * Подкомпоненты вынесены в ./field-definition/
 */

import type { FieldType } from '@/components/forms/types'
import type { FieldDefinition } from '@/types/formKit'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FieldGroup } from '@/components/ui/field-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CompositeFieldEditor } from './CompositeFieldEditor'
import { SelectOptionsEditor } from './SelectOptionsEditor'
import {
  FIELD_TYPES,
  TableColumnsEditor,
  NumberValidation,
  TextValidation,
} from './field-definition'
import { useFieldDefinitionForm } from './useFieldDefinitionForm'

interface FieldDefinitionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  field: FieldDefinition | null
}

export function FieldDefinitionDialog({ open, onOpenChange, field }: FieldDefinitionDialogProps) {
  const {
    name,
    setName,
    fieldType,
    setFieldType,
    description,
    setDescription,
    activeTab,
    setActiveTab,
    selectOptions,
    setSelectOptions,
    minValue,
    setMinValue,
    maxValue,
    setMaxValue,
    step,
    setStep,
    minLength,
    setMinLength,
    maxLength,
    setMaxLength,
    tableColumns,
    setTableColumns,
    hasUnsavedCompositeChanges,
    setHasUnsavedCompositeChanges,
    existingField,
    handleSubmit,
    handleSaveWithoutClose,
    handleClose,
    isSaving,
  } = useFieldDefinitionForm({ open, field, onOpenChange })

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-[700px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{existingField ? 'Редактирование поля' : 'Создание поля'}</DialogTitle>
            <DialogDescription>
              {existingField
                ? 'Измените параметры существующего поля'
                : 'Создайте новый шаблон поля для использования в анкетах'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Название */}
            <Input
              id="name"
              placeholder="Название поля"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="text-2xl md:text-2xl font-semibold h-12 px-4"
            />

            {/* Тип поля */}
            <FieldGroup label="Тип поля">
              <Select value={fieldType} onValueChange={(value) => setFieldType(value as FieldType)}>
                <SelectTrigger
                  id="fieldType"
                  className="border-0 shadow-none h-auto p-0 focus:ring-0 bg-transparent hover:bg-muted/50 rounded text-sm gap-2 w-auto min-w-[150px]"
                >
                  <SelectValue placeholder="Выберите тип">
                    {(() => {
                      const selected = FIELD_TYPES.find((t) => t.value === fieldType)
                      return selected ? (
                        <div className="flex items-center gap-2">
                          <div className="text-muted-foreground">{selected.icon}</div>
                          {selected.label}
                        </div>
                      ) : null
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(({ value, label, icon }) => (
                    <SelectItem key={value} value={value}>
                      <div className="flex items-center gap-2">
                        <div className="text-muted-foreground">{icon}</div>
                        {label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldGroup>

            {/* Валидация для number */}
            {fieldType === 'number' && (
              <NumberValidation
                minValue={minValue}
                maxValue={maxValue}
                step={step}
                onMinValueChange={setMinValue}
                onMaxValueChange={setMaxValue}
                onStepChange={setStep}
              />
            )}

            {/* Валидация для text/textarea */}
            {(fieldType === 'text' || fieldType === 'textarea') && (
              <TextValidation
                minLength={minLength}
                maxLength={maxLength}
                onMinLengthChange={setMinLength}
                onMaxLengthChange={setMaxLength}
              />
            )}

            {/* Вкладки */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="inline-flex">
                <TabsTrigger value="description">Описание</TabsTrigger>
                {fieldType === 'composite' && (
                  <TabsTrigger value="nested">Вложенные поля</TabsTrigger>
                )}
                {fieldType === 'select' && <TabsTrigger value="options">Значения</TabsTrigger>}
                {fieldType === 'key-value-table' && (
                  <TabsTrigger value="table-settings">Настройки таблицы</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="description" className="space-y-3 py-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Описание</Label>
                  <textarea
                    id="description"
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Краткое описание назначения поля"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                {/* Подсказки */}
                {fieldType === 'composite' && !existingField && (
                  <div className="p-4 bg-muted/30 rounded-md border border-dashed">
                    <p className="text-sm text-muted-foreground">
                      Составное поле объединяет несколько простых полей в одну строку. Сохраните
                      поле, чтобы добавить вложенные поля на вкладке "Вложенные поля".
                    </p>
                  </div>
                )}

                {fieldType === 'select' && !existingField && (
                  <div className="p-4 bg-muted/30 rounded-md border border-dashed">
                    <p className="text-sm text-muted-foreground">
                      Список значений позволяет выбрать одно значение из предустановленных
                      вариантов. Сохраните поле, чтобы добавить значения на вкладке "Значения".
                    </p>
                  </div>
                )}

                {fieldType === 'key-value-table' && (
                  <div className="p-4 bg-muted/30 rounded-md border border-dashed">
                    <p className="text-sm text-muted-foreground">
                      Таблица позволяет пользователям добавлять строки с данными по колонкам.
                      Настройте колонки на вкладке "Настройки таблицы".
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* Вложенные поля */}
              {fieldType === 'composite' && (
                <TabsContent value="nested" className="py-4">
                  {existingField ? (
                    <CompositeFieldEditor
                      fieldId={existingField.id}
                      onChangesDetected={setHasUnsavedCompositeChanges}
                    />
                  ) : (
                    <div className="p-6 border border-dashed rounded-md bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                      <p className="text-sm text-amber-900 dark:text-amber-200">
                        Сначала сохраните составное поле, чтобы добавить вложенные поля.
                      </p>
                    </div>
                  )}
                </TabsContent>
              )}

              {/* Значения списка */}
              {fieldType === 'select' && (
                <TabsContent value="options" className="py-4">
                  {existingField ? (
                    <SelectOptionsEditor
                      fieldId={existingField.id}
                      onChangesDetected={setHasUnsavedCompositeChanges}
                    />
                  ) : (
                    <div className="p-6 border border-dashed rounded-md bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                      <p className="text-sm text-amber-900 dark:text-amber-200">
                        Сначала сохраните поле, чтобы добавить значения списка.
                      </p>
                    </div>
                  )}
                </TabsContent>
              )}

              {/* Настройки таблицы */}
              {fieldType === 'key-value-table' && (
                <TabsContent value="table-settings" className="py-4">
                  <TableColumnsEditor columns={tableColumns} onChange={setTableColumns} />
                </TabsContent>
              )}
            </Tabs>
          </div>

          <DialogFooter className="flex gap-2">
            {hasUnsavedCompositeChanges && (
              <Button type="button" variant="outline">
                Изменения сохранены
              </Button>
            )}
            <Button type="button" variant="outline" onClick={handleClose}>
              Отмена
            </Button>
            {(fieldType === 'composite' ||
              fieldType === 'select' ||
              fieldType === 'key-value-table' ||
              hasUnsavedCompositeChanges) && (
              <Button type="button" variant="outline" onClick={handleSaveWithoutClose}>
                Сохранить
              </Button>
            )}
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? 'Сохранение...'
                : existingField
                  ? 'Сохранить и закрыть'
                  : 'Создать и закрыть'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
