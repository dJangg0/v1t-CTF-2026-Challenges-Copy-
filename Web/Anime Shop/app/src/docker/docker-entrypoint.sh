#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "apachectl" ]]; then
  exec "$@"
fi

: "${DB_SERVER:=db}"
: "${DB_NAME:=prestashop}"
: "${DB_USER:=prestashop}"
: "${DB_PASSWD:=prestashop}"
: "${PS_DOMAIN:=localhost:8080}"
: "${PS_SHOP_NAME:=AnimeShop}"
: "${PS_INSTALL_AUTO:=1}"
: "${PS_ERASE_DB:=1}"
: "${PS_INSTALL_FIXTURES:=1}"
: "${PS_THEME:=classic}"
: "${PS_FOLDER_ADMIN:=admin-dev}"
: "${ADMIN_MAIL:=admin@example.com}"
: "${ADMIN_PASSWD:=prestashop_demo}"
PS_INSTALL_MARKER="app/config/parameters.php"

echo "[anishop] waiting for database at ${DB_SERVER}..."
for i in $(seq 1 90); do
  if mysqladmin ping -h"${DB_SERVER}" -u"${DB_USER}" -p"${DB_PASSWD}" --silent >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" == "90" ]]; then
    echo "[anishop] database is not reachable" >&2
    exit 1
  fi
  sleep 2
done

mkdir -p var/cache var/logs upload download img config/xml config/themes app/config
chown -R www-data:www-data var upload download img config app/config

if [[ "${PS_INSTALL_AUTO}" == "1" && ! -f "${PS_INSTALL_MARKER}" ]]; then
  echo "[anishop] installing PrestaShop for ${PS_DOMAIN} with theme ${PS_THEME}..."
  php install-dev/index_cli.php \
    --domain="${PS_DOMAIN}" \
    --db_server="${DB_SERVER}" \
    --db_name="${DB_NAME}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWD}" \
    --db_clear="${PS_ERASE_DB}" \
    --prefix="ps_" \
    --name="${PS_SHOP_NAME}" \
    --email="${ADMIN_MAIL}" \
    --password="${ADMIN_PASSWD}" \
    --firstname="Anime" \
    --lastname="Admin" \
    --country="us" \
    --language="en" \
    --timezone="UTC" \
    --theme="${PS_THEME}" \
    --fixtures="${PS_INSTALL_FIXTURES}"
fi

if [[ -f "${PS_INSTALL_MARKER}" ]]; then
  php /opt/anishop/init.php
fi

chown -R www-data:www-data var upload download img config app/config
exec "$@"
