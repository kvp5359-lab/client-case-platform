// TODO: Z5-21 — This page is dev-only. Consider excluding from production bundle
// via environment check or removing the route in production builds.
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'
import {
  NativeTable,
  NativeTableBody,
  NativeTableCell,
  NativeTableHead,
  NativeTableHeadCell,
  NativeTableRow,
} from '@/components/ui/native-table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { SidebarNavigation, SidebarMenuGroup } from '@/components/SidebarNavigation'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'

export default function ComponentsShowcase() {
  const [activeSidebarItem, setActiveSidebarItem] = useState('project-templates')

  const sidebarGroups: SidebarMenuGroup[] = [
    {
      items: [
        {
          id: 'project-templates',
          label: 'Типы проектов',
          isActive: activeSidebarItem === 'project-templates',
          onClick: () => setActiveSidebarItem('project-templates'),
        },
      ],
    },
    {
      label: 'АНКЕТЫ',
      items: [
        {
          id: 'form-templates',
          label: 'Шаблоны анкет',
          isActive: activeSidebarItem === 'form-templates',
          onClick: () => setActiveSidebarItem('form-templates'),
        },
        {
          id: 'section-templates',
          label: 'Шаблоны секций',
          isActive: activeSidebarItem === 'section-templates',
          onClick: () => setActiveSidebarItem('section-templates'),
        },
        {
          id: 'field-templates',
          label: 'Шаблоны полей',
          isActive: activeSidebarItem === 'field-templates',
          onClick: () => setActiveSidebarItem('field-templates'),
        },
      ],
    },
    {
      label: 'НАБОРЫ ДОКУМЕНТОВ',
      items: [
        {
          id: 'doc-kit-templates',
          label: 'Шаблоны наборов',
          isActive: activeSidebarItem === 'doc-kit-templates',
          onClick: () => setActiveSidebarItem('doc-kit-templates'),
        },
        {
          id: 'folder-templates',
          label: 'Шаблоны папок',
          isActive: activeSidebarItem === 'folder-templates',
          onClick: () => setActiveSidebarItem('folder-templates'),
        },
      ],
    },
  ]

  return (
    <WorkspaceLayout>
      <main className="flex-1 p-8 overflow-auto">
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1
            style={{
              font: 'var(--font-desktop-headlines-h1)',
              color: 'var(--color-corporate-purple)',
              marginBottom: '24px',
            }}
          >
            🎨 Витрина UI Компонентов
          </h1>
          <p
            style={{
              font: 'var(--font-desktop-text-text-m-regular)',
              color: 'var(--color-corporate-dark-gray)',
              marginBottom: '64px',
            }}
          >
            Все доступные компоненты shadcn/ui в проекте
          </p>

          {/* Buttons Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              🔘 Buttons (Кнопки)
            </h2>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <Button>Default Button</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button disabled>Disabled</Button>
            </div>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Badges Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              🏷️ Badges (Значки)
            </h2>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge>Default Badge</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Inputs Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              ✏️ Inputs (Поля ввода)
            </h2>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '400px' }}
            >
              <div>
                <Label htmlFor="input1">Обычное поле</Label>
                <Input id="input1" placeholder="Введите текст..." />
              </div>
              <div>
                <Label htmlFor="input2">Email</Label>
                <Input id="input2" type="email" placeholder="email@example.com" />
              </div>
              <div>
                <Label htmlFor="input3">Password</Label>
                <Input id="input3" type="password" placeholder="••••••••" />
              </div>
              <div>
                <Label htmlFor="input4">Disabled</Label>
                <Input id="input4" disabled placeholder="Недоступно" />
              </div>
            </div>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Checkboxes Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              ☑️ Checkboxes (Чекбоксы)
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Checkbox id="check1" />
                <Label htmlFor="check1">Обычный чекбокс</Label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Checkbox id="check2" defaultChecked />
                <Label htmlFor="check2">Выбранный чекбокс</Label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Checkbox id="check3" disabled />
                <Label htmlFor="check3">Отключенный чекбокс</Label>
              </div>
            </div>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Cards Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              🃏 Cards (Карточки)
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '24px',
              }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Простая карточка</CardTitle>
                  <CardDescription>Описание карточки с базовым содержимым</CardDescription>
                </CardHeader>
                <CardContent>
                  <p>Содержимое карточки может быть любым.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Карточка с кнопкой</CardTitle>
                  <CardDescription>Пример карточки с действиями</CardDescription>
                </CardHeader>
                <CardContent>
                  <p style={{ marginBottom: '16px' }}>Здесь может быть любой контент.</p>
                  <Button>Действие</Button>
                </CardContent>
              </Card>
            </div>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Alerts Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              ⚠️ Alerts (Уведомления)
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Alert>
                <div>
                  <strong>Информация</strong>
                  <p>Обычное информационное сообщение</p>
                </div>
              </Alert>
              <Alert variant="destructive">
                <div>
                  <strong>Ошибка</strong>
                  <p>Что-то пошло не так</p>
                </div>
              </Alert>
            </div>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Avatar Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              👤 Avatars (Аватары)
            </h2>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <Avatar>
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--color-corporate-purple)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                  }}
                >
                  КИ
                </div>
              </Avatar>
              <Avatar>
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--gradient-corporate-gradient)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                  }}
                >
                  АВ
                </div>
              </Avatar>
            </div>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Dialog Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              💬 Dialog (Модальное окно)
            </h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Открыть модальное окно</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Заголовок модального окна</DialogTitle>
                  <DialogDescription>
                    Здесь описание или содержимое модального окна. Можно добавить формы, текст,
                    кнопки.
                  </DialogDescription>
                </DialogHeader>
                <div style={{ marginTop: '16px' }}>
                  <p>Любое содержимое...</p>
                </div>
              </DialogContent>
            </Dialog>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Dropdown Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              📋 Dropdown Menu (Выпадающее меню)
            </h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Открыть меню</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Пункт 1</DropdownMenuItem>
                <DropdownMenuItem>Пункт 2</DropdownMenuItem>
                <DropdownMenuItem>Пункт 3</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Table Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              📊 Table (Таблица)
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Роль</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Иван Иванов</TableCell>
                  <TableCell>ivan@example.com</TableCell>
                  <TableCell>
                    <Badge>Админ</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Мария Петрова</TableCell>
                  <TableCell>maria@example.com</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Пользователь</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Алексей Сидоров</TableCell>
                  <TableCell>alex@example.com</TableCell>
                  <TableCell>
                    <Badge variant="outline">Гость</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Native Table Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              📊 Native Table (Компактная таблица)
            </h2>
            <p
              style={{
                font: 'var(--font-desktop-text-text-m-regular)',
                color: 'var(--color-corporate-dark-gray)',
                marginBottom: '24px',
              }}
            >
              Нативная HTML таблица для компактных списков с высокой плотностью информации.
              Используется для настроек шаблонов, полей форм, секций. Поддерживает HTML5 Drag &
              Drop.
            </p>
            <div
              style={{
                border: '1px solid var(--color-corporate-light-gray)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              <NativeTable
                columns={[
                  { key: 'grip', width: '40px' },
                  { key: 'name', width: '40%' },
                  { key: 'description', width: '40%' },
                  { key: 'actions', width: '20%' },
                ]}
              >
                <NativeTableHead>
                  <NativeTableRow isHeader>
                    <NativeTableHeadCell withDivider={false}></NativeTableHeadCell>
                    <NativeTableHeadCell>Название</NativeTableHeadCell>
                    <NativeTableHeadCell>Описание</NativeTableHeadCell>
                    <NativeTableHeadCell withDivider={false}>Действия</NativeTableHeadCell>
                  </NativeTableRow>
                </NativeTableHead>
                <NativeTableBody>
                  {/* Заголовок секции */}
                  <NativeTableRow isSection>
                    <NativeTableCell>
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                    </NativeTableCell>
                    <NativeTableCell className="font-semibold">
                      Данные для налогов{' '}
                      <span className="text-muted-foreground font-normal">(3)</span>
                    </NativeTableCell>
                    <NativeTableCell>Информация для налоговой декларации</NativeTableCell>
                    <NativeTableCell withDivider={false}></NativeTableCell>
                  </NativeTableRow>

                  {/* Поля в секции */}
                  <NativeTableRow className="group">
                    <NativeTableCell>
                      <div className="flex items-center justify-center">
                        <div className="cursor-move hover:bg-gray-200 p-1 rounded transition-colors inline-flex">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </NativeTableCell>
                    <NativeTableCell>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground">1.</span>
                          Имя
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </NativeTableCell>
                    <NativeTableCell>Полное имя налогоплательщика</NativeTableCell>
                    <NativeTableCell withDivider={false}>
                      <Badge variant="destructive" className="text-xs">
                        Обязательно
                      </Badge>
                    </NativeTableCell>
                  </NativeTableRow>

                  <NativeTableRow className="group">
                    <NativeTableCell>
                      <div className="flex items-center justify-center">
                        <div className="cursor-move hover:bg-gray-200 p-1 rounded transition-colors inline-flex">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </NativeTableCell>
                    <NativeTableCell>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground">2.</span>
                          Вторая фамилия
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </NativeTableCell>
                    <NativeTableCell>Maiden name или второе имя</NativeTableCell>
                    <NativeTableCell withDivider={false}>
                      <Badge variant="secondary" className="text-xs">
                        Опционально
                      </Badge>
                    </NativeTableCell>
                  </NativeTableRow>

                  <NativeTableRow className="group">
                    <NativeTableCell>
                      <div className="flex items-center justify-center">
                        <div className="cursor-move hover:bg-gray-200 p-1 rounded transition-colors inline-flex">
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </NativeTableCell>
                    <NativeTableCell>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground">3.</span>
                          Пол
                        </span>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </NativeTableCell>
                    <NativeTableCell>Мужской или женский</NativeTableCell>
                    <NativeTableCell withDivider={false}>
                      <Badge variant="destructive" className="text-xs">
                        Обязательно
                      </Badge>
                    </NativeTableCell>
                  </NativeTableRow>

                  {/* Другая секция */}
                  <NativeTableRow isSection>
                    <NativeTableCell>
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                    </NativeTableCell>
                    <NativeTableCell className="font-semibold">
                      Инвестиции <span className="text-muted-foreground font-normal">(0)</span>
                    </NativeTableCell>
                    <NativeTableCell>Данные о портфеле</NativeTableCell>
                    <NativeTableCell withDivider={false}></NativeTableCell>
                  </NativeTableRow>

                  {/* Пустая секция */}
                  <NativeTableRow className="bg-muted/20">
                    <NativeTableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground text-sm"
                      withDivider={false}
                    >
                      Секция пуста — добавьте поле или перетащите сюда
                    </NativeTableCell>
                  </NativeTableRow>
                </NativeTableBody>
              </NativeTable>
            </div>
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                background: 'var(--color-corporate-light-gray)',
                borderRadius: '8px',
              }}
            >
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--color-corporate-dark-gray)',
                  marginBottom: '8px',
                }}
              >
                <strong>Особенности:</strong>
              </p>
              <ul
                style={{
                  fontSize: '14px',
                  color: 'var(--color-corporate-dark-gray)',
                  paddingLeft: '20px',
                }}
              >
                <li>Компактные строки (h-6 для полей, h-8 для секций)</li>
                <li>Drag & drop для перемещения полей (HTML5 API)</li>
                <li>Автоматические вертикальные разделители между колонками</li>
                <li>Hover-эффекты для кнопок действий</li>
                <li>Нумерация полей внутри секций</li>
                <li>Визуальное выделение секций (серый фон)</li>
              </ul>
            </div>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Separator Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              ➖ Separator (Разделитель)
            </h2>
            <p style={{ marginBottom: '16px' }}>Горизонтальный разделитель:</p>
            <Separator />
            <p style={{ marginTop: '16px' }}>Используется между секциями (как на этой странице)</p>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Tabs Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              🗂️ Tabs (Вкладки)
            </h2>
            <Tabs defaultValue="tab1" style={{ width: '100%' }}>
              <TabsList>
                <TabsTrigger value="tab1">Вкладка 1</TabsTrigger>
                <TabsTrigger value="tab2">Вкладка 2</TabsTrigger>
                <TabsTrigger value="tab3">Вкладка 3</TabsTrigger>
              </TabsList>
              <TabsContent value="tab1">
                <div style={{ padding: '16px', marginTop: '16px' }}>
                  <p>Содержимое первой вкладки</p>
                </div>
              </TabsContent>
              <TabsContent value="tab2">
                <div style={{ padding: '16px', marginTop: '16px' }}>
                  <p>Содержимое второй вкладки</p>
                </div>
              </TabsContent>
              <TabsContent value="tab3">
                <div style={{ padding: '16px', marginTop: '16px' }}>
                  <p>Содержимое третьей вкладки</p>
                </div>
              </TabsContent>
            </Tabs>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Skeleton Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              ⚙️ Skeleton (Заполнитель загрузки)
            </h2>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '400px' }}
            >
              <Skeleton style={{ height: '40px', borderRadius: '8px' }} />
              <Skeleton style={{ height: '20px', borderRadius: '4px' }} />
              <Skeleton style={{ height: '20px', borderRadius: '4px', width: '80%' }} />
            </div>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* Tooltip Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              💡 Tooltip (Подсказка)
            </h2>
            <TooltipProvider>
              <div style={{ display: 'flex', gap: '16px' }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline">Наведи на меня</Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Это подсказка при наведении курсора</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline">Ещё подсказка</Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Полезная информация здесь</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </section>

          <Separator style={{ marginBottom: '64px' }} />

          {/* SidebarNavigation Section */}
          <section style={{ marginBottom: '64px' }}>
            <h2
              style={{
                font: 'var(--font-desktop-headlines-h3)',
                marginBottom: '24px',
              }}
            >
              📂 SidebarNavigation (Боковая панель навигации)
            </h2>
            <p
              style={{
                font: 'var(--font-desktop-text-text-m-regular)',
                color: 'var(--color-corporate-dark-gray)',
                marginBottom: '24px',
              }}
            >
              Переиспользуемый компонент для навигации по иерархическим меню (например, в Шаблонах)
            </p>
            <SidebarNavigation groups={sidebarGroups}>
              <div>
                <h3
                  style={{
                    font: 'var(--font-desktop-headlines-h4)',
                    marginBottom: '12px',
                  }}
                >
                  {activeSidebarItem === 'project-templates' && 'Типы проектов'}
                  {activeSidebarItem === 'form-templates' && 'Шаблоны анкет'}
                  {activeSidebarItem === 'section-templates' && 'Шаблоны секций'}
                  {activeSidebarItem === 'field-templates' && 'Шаблоны полей'}
                  {activeSidebarItem === 'doc-kit-templates' && 'Шаблоны наборов'}
                  {activeSidebarItem === 'folder-templates' && 'Шаблоны папок'}
                </h3>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <Input type="text" placeholder="Поиск..." />
                  <p
                    style={{
                      color: 'var(--color-corporate-dark-gray)',
                      fontSize: '14px',
                    }}
                  >
                    Нет элементов
                  </p>
                  <Badge variant="outline">Функционал в разработке</Badge>
                </div>
              </div>
            </SidebarNavigation>
          </section>
        </div>
      </main>
    </WorkspaceLayout>
  )
}
