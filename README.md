# RoyaleX — Telegram Mini App

Virtual-token casino-style game for Telegram. Tokens have **no cash value and cannot be withdrawn or exchanged for real money**.

## Included
- Telegram Mini App frontend
- Express backend + SQLite
- Telegram WebApp authentication
- One shared token balance
- Registration bonus: 100 tokens
- 24h bonus: +15 tokens
- 12 games
- Profile + statistics
- Virtual shop
- Achievements
- Leaderboard
- Rules / responsible-play notice
- Admin panel: player search, token grants, game settings
- Railway-ready deployment

## Important security
The bot token that was previously pasted into chat should be revoked and replaced in BotFather. Never commit `.env`.

## Local test
1. Copy `.env.example` to `.env`.
2. Put a newly generated bot token in `BOT_TOKEN`.
3. Set `WEBAPP_URL` to your public HTTPS URL.
4. `npm install`
5. `npm start`

For Telegram WebApp testing, Telegram requires an HTTPS public URL. Railway can provide this.

## Railway
Create a new project from the GitHub repository. Railway detects Node automatically.
Set variables:
BOT_TOKEN, BOT_USERNAME, WEBAPP_URL, ADMIN_ID, JWT_SECRET, PORT=8080.

Persistent SQLite data is stored in `/app/data`. For production durability, attach a Railway Volume mounted at `/app/data`.

## Bot setup
Use BotFather to create/configure the bot and set the Mini App URL/menu button to:
https://YOUR-RAILWAY-DOMAIN.up.railway.app

## Rules
This build intentionally does not implement cash-out, crypto withdrawals, deposits, real-money purchases, or conversion of tokens into money.


## Если появляется "Invalid Telegram WebApp data"
Проверь в Railway → Variables:
- `BOT_TOKEN` = актуальный токен ИМЕННО этого бота, без пробелов и кавычек.
- После изменения переменной сделай Redeploy.
- `WEBAPP_URL` должен совпадать с HTTPS-доменом Railway, который указан в BotFather для Mini App.
- Открывай приложение именно через кнопку/menu Mini App внутри бота, а не как обычную ссылку в браузере.

Проверка: открой `https://ТВОЙ-DOMЕН/api/health`. Должно быть `telegramBotTokenConfigured: true`.

Если токен бота был опубликован где-либо, сначала перевыпусти его в BotFather и поставь новый токен в Railway.
