export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Политика конфиденциальности</h1>
      <p className="text-muted-foreground mb-8">Последнее обновление: 5 апреля 2026 г.</p>

      <section className="space-y-6 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. О сервисе</h2>
          <p>
            ClientCase — платформа для управления клиентскими делами, проектами и документами.
            Сервис предназначен для юридических фирм, консультантов и организаций, которым
            необходимо структурировать работу с клиентами.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. Какие данные мы собираем</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Адрес электронной почты при регистрации или входе через Google</li>
            <li>Имя и фото профиля (при входе через Google)</li>
            <li>Данные, которые вы вводите в рамках работы с платформой (проекты, документы, задачи)</li>
            <li>Технические данные: IP-адрес, тип браузера, журналы доступа</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. Как мы используем данные</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Для предоставления доступа к платформе и её функциям</li>
            <li>Для обеспечения безопасности аккаунта</li>
            <li>Для улучшения сервиса</li>
          </ul>
          <p className="mt-2">Мы не продаём и не передаём ваши данные третьим лицам в коммерческих целях.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Хранение данных</h2>
          <p>
            Данные хранятся на серверах Supabase (PostgreSQL). Подробнее о политике безопасности
            Supabase: supabase.com/security.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Вход через Google</h2>
          <p>
            При использовании входа через Google мы получаем только email и имя профиля.
            Мы не запрашиваем доступ к вашей почте, календарю или другим сервисам Google.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Ваши права</h2>
          <p>
            Вы можете в любое время запросить удаление своего аккаунта и данных, написав
            на почту поддержки.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Контакты</h2>
          <p>По вопросам конфиденциальности: kvp5359@gmail.com</p>
        </div>
      </section>
    </div>
  )
}
