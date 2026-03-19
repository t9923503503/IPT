# 🖥️ Инструкция по работе с сервером lpbvolley
## Для работы с любого компьютера или другого ИИ

---

## 📋 ДАННЫЕ СЕРВЕРА

| Параметр | Значение |
|----------|---------|
| IP адрес | `157.22.173.248` |
| Домен | `my.adminvps.ru` |
| ОС | Ubuntu 22.04 LTS |
| Пользователь | `<SSH_USER>` |
| Пароль | `<SSH_PASSWORD>` |
| SSH порт | `22` |
| Панель | https://my.adminvps.ru |

---

## 📋 ДАННЫЕ ПРИЛОЖЕНИЯ

| Параметр | Значение |
|----------|---------|
| Сайт | https://sv-ugra.ru (или http://157.22.173.248) |
| Папка сайта | `/var/www/ipt` |
| GitHub репо 1 | https://github.com/t9923503503/IPT |
| GitHub репо 2 | https://github.com/t9923503503/2003 |
| Скрипт деплоя | `/usr/local/bin/deploy-ipt` |

---

## 📋 ДАННЫЕ БАЗЫ ДАННЫХ

| Параметр | Значение |
|----------|---------|
| СУБД | PostgreSQL 14 |
| База данных | `lpbvolley` |
| Пользователь БД | `<DB_USER>` |
| Пароль БД | `<DB_PASSWORD>` |
| Хост | `localhost:5432` |
| API (PostgREST) | http://157.22.173.248/api/rest/v1/ |
| API порт | `3000` (внутренний) |

---

## 🔑 КАК ПОДКЛЮЧИТЬСЯ К СЕРВЕРУ

### Через SSH (командная строка)

**Windows** — открыть PowerShell или CMD:
```bash
ssh root@157.22.173.248
# Пароль: <SSH_PASSWORD>
```

**Mac / Linux** — открыть Терминал:
```bash
ssh root@157.22.173.248
# Пароль: <SSH_PASSWORD>
```

**Через SSH-ключ (если настроен):**
```bash
ssh -i ~/.ssh/id_ed25519 root@157.22.173.248
```

---

## 🔄 КАК ОБНОВИТЬ САЙТ

### Способ 1: Одна команда (рекомендуется)
```bash
ssh root@157.22.173.248 "deploy-ipt"
```

### Способ 2: Зайти на сервер и обновить
```bash
ssh root@157.22.173.248
cd /var/www/ipt
git pull origin main
exit
```

### Способ 3: Полный цикл (изменил код → запушил → обновил сервер)
```bash
# 1. Сделать изменения в коде локально
# 2. Закоммитить и запушить на GitHub:
git add .
git commit -m "описание изменений"
git push ipt main
git push repo2003 main

# 3. Обновить сервер:
ssh root@157.22.173.248 "deploy-ipt"
```

---

## 🗄️ РАБОТА С БАЗОЙ ДАННЫХ

### Подключиться к PostgreSQL
```bash
ssh root@157.22.173.248
sudo -u postgres psql -d lpbvolley
```

### Полезные команды в PostgreSQL
```sql
-- Список таблиц
\dt

-- Посмотреть игроков
SELECT * FROM players LIMIT 10;

-- Посмотреть турниры
SELECT id, name, date, status FROM tournaments ORDER BY date DESC LIMIT 10;

-- Посмотреть участников турнира
SELECT * FROM tournament_participants WHERE tournament_id = 'ID_ТУРНИРА';

-- Количество записей в каждой таблице
SELECT 'players' as t, COUNT(*) FROM players
UNION ALL SELECT 'tournaments', COUNT(*) FROM tournaments
UNION ALL SELECT 'tournament_participants', COUNT(*) FROM tournament_participants;

-- Выйти из PostgreSQL
\q
```

### Резервная копия БД
```bash
# Создать backup
ssh root@157.22.173.248 "sudo -u postgres pg_dump lpbvolley > /root/backup_$(date +%Y%m%d).sql"

# Скачать backup на свой компьютер
scp root@157.22.173.248:/root/backup_*.sql ./
```

### Восстановить из backup
```bash
scp backup.sql root@157.22.173.248:/tmp/
ssh root@157.22.173.248 "sudo -u postgres psql lpbvolley < /tmp/backup.sql"
```

---

## 🌐 УПРАВЛЕНИЕ NGINX (веб-сервер)

```bash
# Перезапустить nginx
ssh root@157.22.173.248 "systemctl reload nginx"

# Статус nginx
ssh root@157.22.173.248 "systemctl status nginx"

# Посмотреть логи ошибок
ssh root@157.22.173.248 "tail -50 /var/log/nginx/error.log"

# Посмотреть логи доступа
ssh root@157.22.173.248 "tail -50 /var/log/nginx/access.log"

# Конфиг сайта
ssh root@157.22.173.248 "cat /etc/nginx/sites-available/ipt"
```

---

## ⚙️ УПРАВЛЕНИЕ СЕРВИСАМИ

```bash
# Статус всех сервисов приложения
ssh root@157.22.173.248 "systemctl status nginx postgrest postgresql"

# Перезапустить PostgREST (API)
ssh root@157.22.173.248 "systemctl restart postgrest"

# Перезапустить PostgreSQL (БД)
ssh root@157.22.173.248 "systemctl restart postgresql"

# Перезапустить всё сразу
ssh root@157.22.173.248 "systemctl restart nginx postgrest postgresql"
```

---

## 🧪 ПРОВЕРКА РАБОТОСПОСОБНОСТИ

```bash
# Сайт открывается?
curl -o /dev/null -w "%{http_code}" http://157.22.173.248/

# API работает?
curl http://157.22.173.248/api/rest/v1/players

# API турниры?
curl http://157.22.173.248/api/rest/v1/tournaments

# Все сервисы запущены?
ssh root@157.22.173.248 "systemctl is-active nginx postgrest postgresql"
```

---

## 📁 СТРУКТУРА ФАЙЛОВ НА СЕРВЕРЕ

```
/var/www/ipt/               ← корень сайта
├── index.html              ← главная страница
├── config.js               ← конфиг подключения к БД
├── sw.js                   ← Service Worker (кэш)
├── manifest.webmanifest    ← PWA манифест
├── assets/
│   ├── app.css             ← стили
│   ├── js/
│   │   ├── screens/        ← экраны (roster, ipt, home...)
│   │   ├── ui/             ← компоненты UI
│   │   ├── domain/         ← бизнес-логика
│   │   └── integrations/   ← подключение к API
│   └── ...

/etc/nginx/sites-available/ipt  ← конфиг nginx
/etc/postgrest.conf             ← конфиг PostgREST API
/usr/local/bin/deploy-ipt       ← скрипт обновления сайта
/tmp/migration.sql              ← SQL миграция БД
```

---

## 🔧 ТИПИЧНЫЕ ПРОБЛЕМЫ И РЕШЕНИЯ

### Сайт не открывается
```bash
ssh root@157.22.173.248 "systemctl status nginx"
ssh root@157.22.173.248 "systemctl restart nginx"
```

### API не отвечает (кнопки не работают)
```bash
ssh root@157.22.173.248 "systemctl status postgrest"
ssh root@157.22.173.248 "systemctl restart postgrest"
# Проверить:
curl http://157.22.173.248/api/rest/v1/players
```

### БД не работает
```bash
ssh root@157.22.173.248 "systemctl status postgresql"
ssh root@157.22.173.248 "systemctl restart postgresql"
```

### Браузер показывает старую версию сайта
```
Нажать Ctrl + Shift + R (жёсткая перезагрузка)
Или очистить кэш браузера
```

### Сайт обновился на GitHub но не на сервере
```bash
ssh root@157.22.173.248 "deploy-ipt"
```

### Ошибки в консоли браузера про CSP
```bash
# Проверить config.js на сервере:
ssh root@157.22.173.248 "cat /var/www/ipt/config.js"
# Должно быть:
# window.APP_CONFIG = {
#   supabaseUrl: 'http://157.22.173.248/api',
#   ...
# }
```

---

## 📦 КАК ПЕРЕДАТЬ ЗАДАЧУ ДРУГОМУ ИИ

Скопируйте и вставьте этот блок в начало разговора с другим ИИ:

```
Я разрабатываю PWA приложение для пляжного волейбола "Лютые пляжники".
Стек: Vanilla JS, без фреймворков, без сборки.

СЕРВЕР:
- IP: 157.22.173.248
- SSH: <SSH_USER> / <SSH_PASSWORD>
- Сайт: http://157.22.173.248
- Файлы: /var/www/ipt
- БД: PostgreSQL, база lpbvolley, пользователь <DB_USER> / <DB_PASSWORD>
- API: PostgREST на порту 3000, проксируется через nginx /api/rest/v1/

GITHUB:
- https://github.com/t9923503503/IPT (remote: ipt)
- https://github.com/t9923503503/2003 (remote: repo2003)

ДЕПЛОЙ:
- git push ipt main && git push repo2003 main
- ssh root@157.22.173.248 "deploy-ipt"

КЭШ:
- Service Worker версия в sw.js — нужно увеличивать при каждом деплое
- Текущая: volley-static-v39

КЛЮЧЕВЫЕ ФАЙЛЫ:
- assets/js/screens/ipt.js — IPT формат турнира
- assets/js/ui/ipt-format.js — логика IPT
- assets/js/screens/core.js — навигация, перехват для IPT
- assets/js/screens/roster.js — ростер, запуск IPT
- assets/app.css — все стили
- sw.js — Service Worker (версия кэша)
- index.html — CSP политика

IPT MIXED ФОРМАТ:
- Индивидуальный подсчёт очков, пары меняются каждый раунд
- 8 игроков = 1 группа, 16 = ХАРД/ЛАЙТ, 24 = +МЕДИУМ, 32 = +АДВАНС
- К1/К2/К3/К4 в навигации = группы IPT
- HD/AV/MD/LT = финалы (после завершения всех групп)
- Без таймера в IPT режиме
```

---

## 🚀 БЫСТРЫЙ СТАРТ ПОСЛЕ НАСТРОЙКИ НОВОГО КОМПА

```bash
# 1. Клонировать репозиторий
git clone https://github.com/t9923503503/2003.git volley
cd volley

# 2. Добавить оба remote
git remote add ipt https://github.com/t9923503503/IPT.git
git remote add repo2003 https://github.com/t9923503503/2003.git

# 3. Добавить SSH ключ нового компа в AdminVPS:
# - Зайти на my.adminvps.ru → SSH ключи → Добавить ключ
# - Вставить содержимое ~/.ssh/id_ed25519.pub (или id_rsa.pub)

# 4. Проверить подключение к серверу
ssh root@157.22.173.248 "echo OK"
```

---

## 📊 ТАБЛИЦЫ БАЗЫ ДАННЫХ

| Таблица | Назначение |
|---------|-----------|
| `players` | Реестр всех игроков |
| `tournaments` | Турниры |
| `tournament_participants` | Участники турниров |
| `tournament_results` | Результаты |
| `kotc_sessions` | Сессии синхронизации |
| `player_requests` | Заявки от игроков |
| `merge_audit` | Лог слияния дублей |

---

## 📱 ПРИЛОЖЕНИЕ — ОСНОВНЫЕ ЭКРАНЫ

| Экран | Путь | Файл |
|-------|------|------|
| Главная | `/` → Домик | `home.js` |
| Корты К1-К4 | Кнопки К1/К2/К3/К4 | `core.js` |
| IPT группы | К1/К2/К3 при IPT активен | `ipt.js` |
| Ростер | `/` → Ростер | `roster.js` |
| Свод | Кнопка СВОД | `svod.js` |
| Статистика | Кнопка СТАТ | `stats.js` |
| Финалы HD/MD | Кнопки HD/MD/LT | `core.js` |

---

## 🔐 Хранение секретов (рекомендуется)

- Не храните реальные пароли в `SERVER_GUIDE.md` и других файлах репозитория.
- Держите значения в локальном `SERVER_GUIDE.local.md` (в `.gitignore`) или в менеджере паролей.
- Для команд используйте переменные окружения:

```bash
export SSH_USER="<SSH_USER>"
export SSH_HOST="157.22.173.248"
ssh "$SSH_USER@$SSH_HOST"
```
