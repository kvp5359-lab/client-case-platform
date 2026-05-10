"use client"

/**
 * IntegrationOverview — единая «памятка» по интеграции:
 * как подключить, что умеет, чего не умеет, какие риски.
 *
 * Контент жёстко прописан и сгруппирован по каналам, чтобы пользователи
 * на странице настроек сразу понимали границы возможностей.
 */

import { useState } from 'react'
import { CheckCircle2, Info, AlertTriangle, Plug, XCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface IntegrationOverviewProps {
  /** Что это за интеграция — одно-два предложения по делу. */
  summary: string
  /** Шаги подключения — короткие маркеры. */
  setup: string[]
  /** Что умеет — короткие маркеры в утвердительной форме. */
  can: string[]
  /** Чего не умеет — короткие маркеры. */
  cannot: string[]
  /** Риски, ограничения провайдера, особенности. Опционально. */
  risks?: string[]
}

export function IntegrationOverview({
  summary,
  setup,
  can,
  cannot,
  risks,
}: IntegrationOverviewProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border bg-white text-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        aria-expanded={open}
      >
        <Info className="h-4 w-4 text-blue-500 shrink-0" />
        <p className="text-gray-700 flex-1 min-w-0">{summary}</p>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-gray-400 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t">
          <Block icon={<Plug className="h-3.5 w-3.5 text-gray-500" />} title="Как подключить">
            {setup}
          </Block>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Block icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />} title="Что умеет">
              {can}
            </Block>
            <Block icon={<XCircle className="h-3.5 w-3.5 text-gray-400" />} title="Что не умеет">
              {cannot}
            </Block>
          </div>

          {risks && risks.length > 0 && (
            <Block
              icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              title="Особенности и риски"
            >
              {risks}
            </Block>
          )}
        </div>
      )}
    </div>
  )
}

function Block({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: string[]
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
        {icon}
        {title}
      </div>
      <ul className="text-[13px] text-gray-700 space-y-0.5 pl-4 list-disc marker:text-gray-300">
        {children.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

// ===========================================================================
// Готовые «памятки» для каждой интеграции воркспейса.
// ===========================================================================

export const OVERVIEW_TELEGRAM_SECRETARY: IntegrationOverviewProps = {
  summary:
    'Бот-секретарь воркспейса (через Bot API). Подключается к Telegram-группам и переносит переписку с клиентом в тред внутри проекта.',
  setup: [
    'Создать бота в @BotFather, получить токен.',
    'Вставить токен в поле «Токен бота-секретаря» ниже.',
    'Добавить бота в нужную Telegram-группу с клиентом, дать права админа (читать сообщения, удалять).',
    'В группе вызвать команду привязки — группа подключится к треду в сервисе.',
  ],
  can: [
    'Текст и вложения в обе стороны.',
    'Reply-цитирование (приём и отправка).',
    'Голосовые с автоматической транскрипцией.',
    'Edit/delete своих исходящих сообщений.',
    'Реакции — если бот сделан админом в группе.',
  ],
  cannot: [
    'Личные диалоги клиента с сотрудником.',
    'Read-receipts от клиента (Bot API их не отдаёт).',
    'Отметить чужие сообщения как прочитанные в Telegram.',
  ],
  risks: [
    'Без прав админа бот не видит чужих сообщений в группе — Telegram режет на уровне API.',
    'Если бот заблокирован/удалён из группы — переписка перестаёт синхронизироваться.',
  ],
}

export const OVERVIEW_TELEGRAM_EMPLOYEE_BOT: IntegrationOverviewProps = {
  summary:
    'Личный бот сотрудника — отдельный Bot API-токен на каждого сотрудника. Клиент пишет именно этому боту, а сервис маршрутизирует в проект.',
  setup: [
    'Сотрудник создаёт своего бота в @BotFather (или менеджер делает это за него).',
    'Токен вводится в форме «Личные боты сотрудников» ниже.',
    'Сервис вешает свой webhook на бота автоматически.',
    'Клиент находит бота по @username и пишет ему — диалог появляется в сервисе.',
  ],
  can: [
    'Личные 1-на-1 диалоги клиента с сотрудником.',
    'Текст, вложения, голосовые с транскрипцией, reply.',
    'Edit/delete исходящих от бота.',
  ],
  cannot: [
    'Сообщения, написанные с телефона сотрудника напрямую — бот их не видит.',
    'Read-receipts.',
    'Реакции в личке (Bot API не даёт ставить реакции в 1-на-1 чатах).',
  ],
  risks: [
    'Клиент видит «бот» в Telegram, а не реальное имя сотрудника. Для «настоящего» личного диалога — Telegram Business или MTProto.',
  ],
}

export const OVERVIEW_GMAIL: IntegrationOverviewProps = {
  summary:
    'Двухсторонняя интеграция с Gmail сотрудника через OAuth. Входящие письма автоматически попадают в треды сервиса, исходящие отправляются с реального ящика сотрудника.',
  setup: [
    'Сотрудник в своём профиле подключает Gmail (OAuth Google).',
    'Сервис автоматически вешает Gmail watch — Pub/Sub присылает уведомления о новых письмах.',
    'Watch продлевается каждые сутки фоновой задачей (живёт 7 дней).',
  ],
  can: [
    'Входящие письма автоматически в треды (склейка по In-Reply-To / References / теме).',
    'Отправка ответов с реального адреса сотрудника.',
    'Вложения в обе стороны.',
    'Read-receipts через трекинг-пиксель (опционально).',
  ],
  cannot: [
    'Изменять/удалять уже отправленные письма.',
    'Реакции, голосовые и видеозвонки.',
  ],
  risks: [
    'Если cron продления watch упал на >7 дней — Gmail прекращает слать уведомления. Пропущенные за это время письма не подтянутся автоматически.',
    'Требует, чтобы пользователь дал OAuth-доступ к своему ящику. Отзывая доступ в Google — интеграция отвалится.',
  ],
}

export const OVERVIEW_TELEGRAM_BUSINESS: IntegrationOverviewProps = {
  summary:
    'Telegram Business: общий бот сервиса @clientcase_bot подключается к Telegram сотрудника как «делегат» и забирает все его личные диалоги. Требует Telegram Premium.',
  setup: [
    'Telegram Premium у сотрудника (платная подписка Telegram).',
    'В сервисе нажать «Подключить» — получить ссылку t.me/clientcase_bot?start=biz_…',
    'В Telegram → Settings → Business → Chatbots → добавить @clientcase_bot, дать право «Reply to messages».',
    'Сервис автоматически создаёт системный инбокс сотрудника.',
  ],
  can: [
    'Все личные диалоги сотрудника в одной странице «Личные диалоги».',
    'Текст, вложения, reply, голосовые с транскрипцией.',
    'Эмуляция реакций через короткий эмодзи-reply (эвристика).',
  ],
  cannot: [
    'Нативные реакции — Bot API не даёт ставить их в 1-на-1 чатах.',
    'Read-receipts — Telegram не отдаёт их через Bot API.',
    'Mark-as-read в обратную сторону.',
  ],
  risks: [
    'Telegram Premium должен быть оплачен и активен — без него «делегат-бот» не доступен в настройках.',
    'Если сотрудник убрал бота в Telegram Business → Chatbots, сервис перестанет получать его переписку.',
  ],
}

export const OVERVIEW_TELEGRAM_MTPROTO: IntegrationOverviewProps = {
  summary:
    'MTProto: сервис подключается к Telegram-аккаунту сотрудника напрямую (через клиентский протокол), как если бы это был обычный TG-клиент. Не требует Premium.',
  setup: [
    'Сотрудник вводит свой номер телефона.',
    'Получает код от Telegram, вводит его в сервис.',
    'Если включена двухфакторка — вводит облачный пароль.',
    'Сессия живёт долго; разлогин в Telegram «Active Sessions» рвёт её.',
  ],
  can: [
    'Все личные и групповые диалоги аккаунта сотрудника.',
    'Полностью нативные реакции (приём и отправка).',
    'Read-receipts от клиента.',
    'Mark-as-read в обратную сторону.',
    'Edit/delete своих исходящих.',
  ],
  cannot: [
    'Работать без рабочей сессии — если Telegram её закрыл, нужен повторный вход.',
  ],
  risks: [
    'Telegram может посчитать неавторизованным клиентом и заблокировать аккаунт. Риск низкий, но ненулевой.',
    'Сессия видна сотруднику в «Active Sessions» — он может закрыть её случайно или намеренно.',
    'Сервис хранит session-string. Утечка = доступ к аккаунту, поэтому это секрет уровня пароля.',
  ],
}

export const OVERVIEW_WAZZUP: IntegrationOverviewProps = {
  summary:
    'WhatsApp и Instagram через шлюз Wazzup24. Платный сторонний сервис. ToS WhatsApp формально нарушается — коммерческий риск принимает Wazzup, не мы.',
  setup: [
    'Создать аккаунт на wazzup24.com, оплатить тариф.',
    'Подключить свой номер WhatsApp / IG-аккаунт через QR-код в Wazzup.',
    'В настройках сервиса ввести API-ключ из кабинета Wazzup.',
    'Нажать «Подписать webhook» — сервис автоматически зарегистрирует URL.',
    'Нажать «Загрузить каналы» и назначить каналы на сотрудников.',
  ],
  can: [
    'Текст, вложения, reply-цитирование (приём и отправка).',
    'Голосовые с автоматической транскрипцией.',
    'Read-receipts (синие галочки) от клиента.',
    'Mark-as-read (сервис → клиент).',
  ],
  cannot: [
    'Реакции через API не поддерживаются — реакция клиента приходит как обычное сообщение с эмодзи.',
    'Edit/delete уже отправленных.',
  ],
  risks: [
    'Wazzup периодически просит пересканировать QR-код WhatsApp (раз в несколько недель).',
    'WhatsApp может заблокировать номер за подозрительную активность — это ответственность Wazzup, но номер потеряете.',
    'Зависимость от внешнего сервиса: упал Wazzup → нет переписки.',
  ],
}

export const OVERVIEW_EMAIL_RESEND: IntegrationOverviewProps = {
  summary:
    'Централизованная почта через Resend: исходящие письма уходят через единый SMTP-провайдер с вашего собственного домена. Входящие — через inbox+localpart@домен.',
  setup: [
    'Подтвердить домен в Resend (DKIM/SPF записи).',
    'В настройках указать домен и адрес inbox-роутера.',
    'Сотрудники получают персональные адреса вида inbox+ivanov@…',
    'Письма на эти адреса автоматически создают треды.',
  ],
  can: [
    'Исходящие письма от имени сервиса с настроенного домена.',
    'Входящие через inbox+<сотрудник>@домен.',
    'Вложения, цепочки писем по теме и Message-ID.',
    'Отдельный «логин-почтовый ящик» Gmail у каждого сотрудника не обязателен.',
  ],
  cannot: [
    'Отправлять с личного gmail сотрудника (для этого используется отдельная Gmail-интеграция).',
    'Изменять/удалять уже доставленные письма.',
  ],
  risks: [
    'Если домен не настроен правильно (SPF/DKIM/DMARC), письма уходят в спам.',
    'Resend — платный сервис; превышение лимита → отказ в отправке.',
  ],
}
