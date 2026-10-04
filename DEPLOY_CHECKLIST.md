# Быстрый запуск с телефона

1. Распакуй архив.
2. Создай GitHub repository и загрузи ВСЕ файлы из этой папки (не саму папку-обёртку).
3. На Railway: New Project → Deploy from GitHub Repo.
4. Variables:
   BOT_TOKEN = новый токен после перевыпуска в BotFather
   BOT_USERNAME = username бота без @
   WEBAPP_URL = URL Railway
   ADMIN_ID = 8801927709
   JWT_SECRET = длинная случайная строка
   PORT = 8080
5. После первого deploy открой домен Railway и проверь страницу.
6. В BotFather настрой Menu Button / Web App на WEBAPP_URL.
7. Для сохранения SQLite между деплоями добавь Railway Volume → /app/data.

Если GitHub просит выбрать Node version, проект рассчитан на современный Node.js 20+.
