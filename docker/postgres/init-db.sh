#!/usr/bin/env bash
# Inicialización de PostgreSQL (TK-00.6; docs/ARCHITECTURE.md, "Docker Compose" > "Bases y rol de aplicación").
# La imagen oficial lo ejecuta solo con el volumen de datos vacío. Nunca imprime valores de variables.
#   MEDSUPPLY_DB_ENV=development: rol con CREATEDB; bases medsupply y medsupply_test.
#   MEDSUPPLY_DB_ENV=delivery:    rol sin CREATEDB; solo la base medsupply.
set -Eeuo pipefail

fail() {
  echo "init-db: $1" >&2
  exit 1
}

# Las contraseñas deben ser exclusivamente alfanuméricas (D.2 #7 iv). El mensaje nombra la variable, no su valor.
require_alnum() {
  local name="$1"
  local value="${!name:-}"
  [[ -n "$value" ]] || fail "$name es obligatoria"
  [[ "$value" =~ ^[A-Za-z0-9]+$ ]] || fail "$name debe ser exclusivamente alfanumérica (A-Z, a-z, 0-9)"
}

require_alnum POSTGRES_PASSWORD
require_alnum APP_DB_PASSWORD
[[ -n "${APP_DB_USER:-}" ]] || fail "APP_DB_USER es obligatoria"
case "${MEDSUPPLY_DB_ENV:-}" in
  development | delivery) ;;
  *) fail "MEDSUPPLY_DB_ENV debe ser development o delivery" ;;
esac

# Los valores llegan a SQL como variables de psql (\getenv) con comillas de psql, nunca concatenados.
psql --no-psqlrc -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\getenv app_user APP_DB_USER
\getenv app_password APP_DB_PASSWORD
\getenv db_env MEDSUPPLY_DB_ENV
SELECT :'db_env' = 'development' AS is_development \gset

\if :is_development
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEROLE CREATEDB PASSWORD :'app_password';
\else
CREATE ROLE :"app_user" LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB PASSWORD :'app_password';
\endif

\if :is_development
CREATE DATABASE medsupply_test OWNER :"app_user";
\endif

-- medsupply se crea al final: el healthcheck de Compose la usa como señal de inicialización completa.
CREATE DATABASE medsupply OWNER :"app_user";
SQL

echo "init-db: rol de aplicación y bases creados (${MEDSUPPLY_DB_ENV})"
