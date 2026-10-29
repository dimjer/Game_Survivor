#!/bin/sh
# Сборка веб-части под одну платформу: www собирается заново, в iOS не попадает ничего от Android и наоборот.
# Запуск: sh sync.sh ios | sh sync.sh android (или npm run sync / npm run sync:android)
set -e
P="$1"
[ "$P" = ios ] || [ "$P" = android ] || { echo 'Нужна платформа: ios или android'; exit 1; }
cd "$(dirname "$0")"

# Только файлы игры: без .md, serve.py, git и прочего из корня
rm -rf www && mkdir www
cp -R ../index.html ../*.js ../lang ../fonts ../favicon.svg www/
if [ "$P" = ios ]; then
  cp ../apple-touch-icon.png www/
else
  sed -i '' '/apple-/d' www/index.html   # Android: без иконки и мета-тегов Apple
fi

npx cap sync "$P"

# В конфиг платформы — только её раздел
if [ "$P" = ios ]; then CFG=ios/App/App/capacitor.config.json; OTHER=android; else CFG=android/app/src/main/assets/capacitor.config.json; OTHER=ios; fi
node -e 'const fs = require("fs"), [f, o] = process.argv.slice(1), c = JSON.parse(fs.readFileSync(f)); delete c[o]; fs.writeFileSync(f, JSON.stringify(c, null, 2))' "$CFG" "$OTHER"

# Проверка: в Android-сборке не должно быть ничего про Apple
if [ "$P" = android ] && grep -rqi --include='*.html' --include='*.js' --include='*.json' 'apple' android/app/src/main/assets; then
  echo 'Ошибка: в Android-сборку попало что-то от Apple:'; grep -rli --include='*.html' --include='*.js' --include='*.json' 'apple' android/app/src/main/assets; exit 1
fi
[ "$P" = ios ] || [ ! -e android/app/src/main/assets/public/apple-touch-icon.png ] || { echo 'Ошибка: apple-touch-icon в Android'; exit 1; }
echo "Готово: $P"
