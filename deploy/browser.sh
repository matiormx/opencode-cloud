#!/usr/bin/env bash
# OpenCode Cloud — instala Chromium y Playwright MCP para todos los usuarios (extensión "Playwright").
#
# Instalación única del ayudante (como root). Después el botón «Instalar Chromium» de Ajustes → Extensiones hace el resto:
#   sudo /opt/opencode-cloud/deploy/browser.sh setup
#
# También se puede usar desde la terminal:
#   sudo ./deploy/browser.sh install      instala (o actualiza) Playwright MCP, Chromium y las librerías del sistema
#   sudo ./deploy/browser.sh remove       lo borra
#   ./deploy/browser.sh status
#
# Variables: APP_USER=occloud  MCP_TOOLS_DIR=/opt/opencode-cloud-mcp  DATA_DIR=/var/lib/opencode-cloud
#
# Seguridad: la WebUI no es root. Deja una petición en una carpeta suya y una unidad systemd de root
# (opencode-browser.path) la procesa con ESTA copia del script, instalada en /usr/local/lib (de root, no modificable
# por la app). La petición solo puede ser «install» o «remove»: la app no controla ningún nombre de paquete ni ruta.
set -euo pipefail

APP_USER="${APP_USER:-occloud}"
SERVICE=opencode-cloud
ENV_FILE="${ENV_FILE:-/etc/$SERVICE.env}"
TOOLS_DIR="${MCP_TOOLS_DIR:-/opt/opencode-cloud-mcp}"
HELPER="${HELPER:-/usr/local/lib/opencode-cloud/browser.sh}"
DRY="${BROWSER_DRY:-0}"      # solo para pruebas: no toca systemd ni instala Chromium

if [ -z "${DATA_DIR:-}" ] && [ -r "$ENV_FILE" ]; then
  DATA_DIR="$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | tail -n1)"
fi
DATA_DIR="${DATA_DIR:-/var/lib/opencode-cloud}"
INBOX="${INBOX:-$DATA_DIR/browser-inbox}"     # escribe la app
OUTBOX="${OUTBOX:-$DATA_DIR/browser-status}"  # escribe root, lee la app
LOG="$OUTBOX/browser.log"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

case "${1:-status}" in status) ;; *) [ "$DRY" = 1 ] || [ "$(id -u)" -eq 0 ] || die "Ejecútalo como root (sudo)." ;; esac
# TOOLS_DIR se borra en «remove»: solo se admiten carpetas propias bajo /opt (o /tmp en pruebas)
[[ "$TOOLS_DIR" =~ ^/(opt|tmp)/[A-Za-z0-9._/-]{3,80}$ && "$TOOLS_DIR" != *..* ]] || die "MCP_TOOLS_DIR no válido"

write_status() { # id estado mensaje   (estado: idle | installing | ready | error)
  local id="$1" state="$2" msg="$3" tmp
  msg="$(printf '%s' "$msg" | tr -d '\000-\037' | sed 's/["\\]//g' | cut -c1-300)"
  mkdir -p "$OUTBOX"
  tmp="$(mktemp "$OUTBOX/.s.XXXXXX")"
  printf '{"id":"%s","state":"%s","message":"%s","at":%s000}\n' "$id" "$state" "$msg" "$(date +%s)" > "$tmp"
  chmod 644 "$tmp"; mv -f "$tmp" "$OUTBOX/status.json"
}

# Salida de npm/playwright sin colores ni barras de progreso, para la WebUI
clean() { tr '\r' '\n' | sed -u 's/\x1b\[[0-9;?]*[A-Za-z]//g' | grep --line-buffered -v '^[[:space:]]*$' || true; }

do_install() {
  local id="$1" ver
  command -v node >/dev/null && command -v npm >/dev/null || { write_status "$id" error "Node.js/npm no están instalados en el VPS"; return 1; }
  : > "$LOG"; chmod 644 "$LOG"
  install -d -m 755 "$TOOLS_DIR"
  [ -f "$TOOLS_DIR/package.json" ] || printf '{"name":"opencode-cloud-mcp","private":true}\n' > "$TOOLS_DIR/package.json"

  write_status "$id" installing "Descargando Playwright MCP…"
  if ! ( cd "$TOOLS_DIR" && npm install --no-audit --no-fund --ignore-scripts --loglevel=error @playwright/mcp@latest 2>&1 | clean >> "$LOG" ); then
    write_status "$id" error "No se pudo descargar Playwright MCP (revisa la conexión a internet del VPS)"; return 1
  fi
  [ -e "$TOOLS_DIR/node_modules/.bin/playwright-mcp" ] || { write_status "$id" error "El paquete se instaló pero falta el ejecutable playwright-mcp"; return 1; }
  [ -f "$TOOLS_DIR/node_modules/playwright/cli.js" ] || { write_status "$id" error "Falta playwright/cli.js en el paquete descargado"; return 1; }

  if [ "$DRY" != 1 ]; then
    write_status "$id" installing "Instalando Chromium y las librerías del sistema (puede tardar varios minutos)…"
    if ! ( cd "$TOOLS_DIR" && PLAYWRIGHT_BROWSERS_PATH="$TOOLS_DIR/browsers" DEBIAN_FRONTEND=noninteractive node node_modules/playwright/cli.js install --with-deps chromium 2>&1 | clean >> "$LOG" ); then
      write_status "$id" error "Falló la instalación de Chromium (mira el final del registro en el VPS: $LOG)"; return 1
    fi
  fi
  chmod -R a+rX "$TOOLS_DIR"
  ver="$(cd "$TOOLS_DIR" && node -p "require('./node_modules/@playwright/mcp/package.json').version" 2>/dev/null || echo '?')"
  [[ "$ver" =~ ^[0-9A-Za-z.+-]{1,30}$ ]] || ver='?'
  printf '{"version":"%s","at":%s000}\n' "$ver" "$(date +%s)" > "$TOOLS_DIR/ready.json"
  chmod 644 "$TOOLS_DIR/ready.json"
  write_status "$id" ready "Chromium y Playwright MCP $ver instalados"
}

do_remove() {
  local id="$1"
  rm -rf -- "$TOOLS_DIR"
  write_status "$id" idle "Chromium y Playwright MCP eliminados"
}

worker() {
  local req="$INBOX/request" action id rest
  mkdir -p "$OUTBOX"; chmod 755 "$OUTBOX"
  if [ ! -f "$req" ] || [ -L "$req" ]; then rm -f -- "$req"; return 0; fi
  read -r action id rest < <(head -c 100 -- "$req" | head -n1) || true
  rm -f -- "$req"
  [[ "${id:-}" =~ ^[a-f0-9]{8,32}$ ]] || id=none
  case "$action" in
    install) do_install "$id" || true ;;
    remove)  do_remove "$id" ;;
    *) write_status "$id" error "Acción no reconocida" ;;
  esac
}

setup() {
  id -u "$APP_USER" >/dev/null 2>&1 || die "No existe el usuario '$APP_USER' (¿está instalado OpenCode Cloud?)"
  install -d -m 755 "$(dirname "$HELPER")"
  install -m 755 -o root -g root "$0" "$HELPER"
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$INBOX"
  install -d -m 755 -o root -g root "$OUTBOX"
  cat > /etc/systemd/system/opencode-browser.service <<EOF
[Unit]
Description=OpenCode Cloud — instala Chromium y Playwright MCP pedidos desde la WebUI

[Service]
Type=oneshot
TimeoutStartSec=3600
Environment=APP_USER=$APP_USER DATA_DIR=$DATA_DIR MCP_TOOLS_DIR=$TOOLS_DIR
ExecStart=$HELPER worker
EOF
  cat > /etc/systemd/system/opencode-browser.path <<EOF
[Unit]
Description=OpenCode Cloud — peticiones de Chromium/Playwright

[Path]
PathExists=$INBOX/request
Unit=opencode-browser.service

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now opencode-browser.path >/dev/null
  if [ -f "$TOOLS_DIR/ready.json" ]; then write_status none ready "Chromium y Playwright MCP instalados"; else write_status none idle "Ayudante instalado"; fi
  log "Listo. Abre Ajustes → Extensiones en la WebUI y pulsa «Instalar Chromium»."
  log "(Si actualizas la aplicación y cambia este script, vuelve a ejecutar: sudo $0 setup)"
}

case "${1:-status}" in
  setup) setup ;;
  worker) worker ;;
  install) mkdir -p "$OUTBOX"; do_install none && log "Instalado en $TOOLS_DIR" || die "Falló. Registro: $LOG" ;;
  remove) mkdir -p "$OUTBOX"; do_remove none; log "Eliminado." ;;
  status)
    if [ -f "$TOOLS_DIR/ready.json" ]; then log "Instalado: $(cat "$TOOLS_DIR/ready.json")"; else log "No instalado"; fi ;;
  *) die "Uso: $0 setup | install | remove | status" ;;
esac
