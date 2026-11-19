# Shop Burmalda

Магазин фигурок, корзина, выбор доставки, заявки и переписка на сайте. Кабинет продавца находится по адресу `/seller`.

## GitHub, Render и Cloudflare D1

1. В GitHub создай приватный репозиторий `shop-burmalda`. Загрузи **содержимое** распакованного архива в корень репозитория.
2. В [Cloudflare](https://dash.cloudflare.com/) создай базу **D1** на бесплатном тарифе. Скопируй **Account ID** и **Database ID**. Создай API-токен с правом записи в D1 для этого аккаунта.
3. В [Render](https://dashboard.render.com/) выбери **New → Blueprint** и подключи репозиторий. Конфигурация выбирает бесплатный веб-сервис. При подключении введи следующие значения:

| Переменная | Значение |
| --- | --- |
| `SELLER_PASSWORD` | Новый пароль кабинета продавца длиной от 16 символов |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID из Cloudflare |
| `D1_DATABASE_ID` | Database ID из Cloudflare |
| `D1_API_TOKEN` | Токен Cloudflare с правом записи в D1 |

Пароль и токен вводятся в Render. После запуска открой выданный адрес `*.onrender.com`. Добавь `/seller`, чтобы зайти в кабинет.

Фото добавленных товаров, заявки и сообщения сохраняются в D1 при перезапуске Render. Приложение создаёт таблицы автоматически.

Облачная база стартует с двумя исходными товарами. Данные локальной версии хранятся в прежней папке `data` и не входят в этот архив.

## Проверка на компьютере

Установленный Node.js 22.13 или новее. Из корня проекта:

```text
node scripts/build.mjs
node scripts/validate-artifact.mjs
node local.mjs
```

Локальный сайт работает на `http://127.0.0.1:8765`. Пароль кабинета хранится в `data/seller-password.txt`.

Документация [Render Blueprint](https://render.com/docs/blueprint-spec) и [Cloudflare D1](https://developers.cloudflare.com/d1/get-started/).
