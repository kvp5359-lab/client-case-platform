export const dynamic = 'force-static'

export const metadata = {
  title: 'Условия использования — ClientCase',
}

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Условия использования</h1>
      <p className="text-muted-foreground mb-8">Последнее обновление: 5 апреля 2026 г.</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Принятие условий</h2>
          <p>
            Используя платформу ClientCase, вы соглашаетесь с настоящими условиями использования.
            Если вы не согласны — пожалуйста, не используйте сервис.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. Описание сервиса</h2>
          <p>
            ClientCase — платформа для управления клиентскими делами, проектами, задачами и
            документами. Сервис предоставляется как есть и может обновляться без предварительного
            уведомления.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Регистрация и аккаунт</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Вы несёте ответственность за безопасность своего аккаунта</li>
            <li>Запрещено создавать аккаунты для незаконных целей</li>
            <li>Один пользователь — один аккаунт</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Допустимое использование</h2>
          <p>Запрещено:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Использовать платформу для незаконной деятельности</li>
            <li>Загружать вредоносные файлы или вирусы</li>
            <li>Нарушать права других пользователей</li>
            <li>Пытаться получить несанкционированный доступ к системе</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Ваши данные</h2>
          <p>
            Данные, которые вы загружаете в платформу, принадлежат вам. Мы не претендуем
            на права на ваши документы и проекты.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Ограничение ответственности</h2>
          <p>
            Сервис предоставляется «как есть». Мы не несём ответственности за потерю данных,
            перебои в работе или косвенный ущерб, возникший в результате использования платформы.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Изменения условий</h2>
          <p>
            Мы можем обновлять условия использования. Актуальная версия всегда доступна
            на этой странице.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. Контакты</h2>
          <p>По вопросам: kvp5359@gmail.com</p>
        </div>
      </section>
    </div>
  )
}
