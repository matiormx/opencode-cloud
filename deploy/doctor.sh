#!/usr/bin/env bash
# OpenCode Cloud — comprobación de la instalación (solo lee, no cambia nada).
#   sudo /opt/opencode-cloud/deploy/doctor.sh
# Variables: APP_USER=occloud  APP_DIR=/opt/opencode-cloud  SERVICE=opencode-cloud
set -uo pipefail

APP_USER="${APP_USER:-occloud}"
APP_DIR="${APP_DIR:-/opt/opencode-cloud}"
SERVICE="${SERVICE:-opencode-cloud}"
ENV_FILE="/etc/$SERVICE.env"

OK=0; WARN=0; BAD=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; OK=$((OK+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; WARN=$((WARN+1)); }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$*"; BAD=$((BAD+1)); }
hint() { printf '      → %s\n' "$*"; }
sec()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Ejecútalo con sudo."; exit 1; }

PORT=3000; OCPORT=4096; DATA_DIR=/var/lib/opencode-cloud
if [ -r "$ENV_FILE" ]; then
  v="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -n1)";          [ -n "$v" ] && PORT="$v"
  v="$(sed -n 's/^OPENCODE_PORT=//p' "$ENV_FILE" | tail -n1)"; [ -n "$v" ] && OCPORT="$v"
  v="$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | tail -n1)";      [ -n "$v" ] && DATA_DIR="$v"
fi
APP_HOME="$(getent passwd "$APP_USER" 2>/dev/null | cut -d: -f6)"

sec "Sistema"
. /etc/os-release 2>/dev/null; echo "  $PRETTY_NAME · $(uname -r)"
free_pct="$(df --output=pcent / | tail -n1 | tr -dc 0-9)"
[ "${free_pct:-0}" -ge 95 ] && bad "Disco lleno (${free_pct}% usado)" && hint "Libera espacio: journalctl --vacuum-size=200M ; apt clean ; borra proyectos o cachés que no uses" \
  || ok "Disco: ${free_pct}% usado"
mem_av="$(awk '/MemAvailable/{printf "%d",$2/1024}' /proc/meminfo)"
[ "${mem_av:-0}" -lt 150 ] && warn "Poca memoria libre (${mem_av} MB)" || ok "Memoria disponible: ${mem_av} MB"
command -v node >/dev/null && ok "Node $(node -v)" || bad "Node no está instalado"

sec "Usuario y archivos"
if id "$APP_USER" >/dev/null 2>&1; then ok "Usuario '$APP_USER' existe"; else bad "Falta el usuario '$APP_USER'"; fi
[ -d "$APP_DIR" ] && ok "Aplicación en $APP_DIR" || bad "No existe $APP_DIR"
[ -r "$ENV_FILE" ] && ok "Configuración $ENV_FILE" || bad "Falta $ENV_FILE"
strange=""; id "$APP_USER" >/dev/null 2>&1 && strange="$(find "$APP_DIR" "$DATA_DIR" -xdev ! -user "$APP_USER" -not -path '*/node_modules/.cache/*' 2>/dev/null | head -n 5)"
if [ -n "$strange" ]; then
  bad "Hay archivos que no son de '$APP_USER' (típico tras editar como root):"; echo "$strange" | sed 's/^/        /'
  hint "Arréglalo con: sudo chown -R $APP_USER:$APP_USER $APP_DIR $DATA_DIR"
elif id "$APP_USER" >/dev/null 2>&1; then ok "Los archivos pertenecen a '$APP_USER'"; fi

sec "Código de la aplicación"
if [ -d "$APP_DIR/.git" ]; then
  G() { git -c safe.directory="$APP_DIR" -C "$APP_DIR" "$@"; }
  echo "  versión $(node -p "require('$APP_DIR/package.json').version" 2>/dev/null) · $(G log -1 --format='%h %s' 2>/dev/null | cut -c1-70)"
  dirty="$(G status --porcelain 2>/dev/null | head -n 8)"
  if [ -n "$dirty" ]; then warn "Hay cambios locales sin confirmar (la actualización desde la WebUI queda bloqueada):"; echo "$dirty" | sed 's/^/        /'
    hint "Para descartarlos y volver a la versión de GitHub: sudo -u $APP_USER git -C $APP_DIR checkout -- .   (y 'git clean -fd' si hay archivos nuevos)"
  else ok "Sin cambios locales"; fi
  [ -d "$APP_DIR/node_modules" ] && ok "Dependencias instaladas" || { bad "Faltan las dependencias (node_modules)"; hint "cd $APP_DIR && sudo -u $APP_USER npm ci --omit=dev"; }
fi

sec "Servicio"
st="$(systemctl is-active "$SERVICE" 2>/dev/null)"
if [ "$st" = active ]; then ok "$SERVICE está activo (desde $(systemctl show -p ActiveEnterTimestamp --value "$SERVICE" | cut -d' ' -f2-3))"
else
  bad "$SERVICE no está activo (estado: $st)"; hint "Mira el motivo: journalctl -u $SERVICE -n 40 --no-pager   · y reinicia: sudo systemctl restart $SERVICE"
  journalctl -u "$SERVICE" -n 12 --no-pager 2>/dev/null | sed 's/^/        /'
fi
restarts="$(systemctl show -p NRestarts --value "$SERVICE" 2>/dev/null)"
[ "${restarts:-0}" -gt 3 ] && warn "El servicio se ha reiniciado $restarts veces: probablemente falla al arrancar" && hint "journalctl -u $SERVICE -n 60 --no-pager"
code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" || true)"
[ "$code" = 200 ] && ok "La WebUI responde en 127.0.0.1:$PORT" || { bad "La WebUI no responde en 127.0.0.1:$PORT (HTTP ${code:-000})"; hint "¿Puerto ocupado por otra cosa? ss -ltnp | grep :$PORT"; }

sec "OpenCode"
OCBIN="$APP_HOME/.opencode/bin/opencode"
if [ -x "$OCBIN" ]; then ok "OpenCode $(runuser -u "$APP_USER" -- env HOME="$APP_HOME" "$OCBIN" --version 2>/dev/null | head -n1)"
else bad "No está $OCBIN"; hint "Reinstálalo: sudo -u $APP_USER bash -c 'curl -fsSL https://opencode.ai/install | bash'"; fi
if ss -ltn 2>/dev/null | grep -q "127.0.0.1:$OCPORT"; then ok "OpenCode escucha en 127.0.0.1:$OCPORT"
else warn "OpenCode no escucha en $OCPORT (la WebUI lo arranca al iniciarse)"; hint "Prueba desde Ajustes → Reiniciar OpenCode, o: sudo systemctl restart $SERVICE"; fi
[ -f "$APP_HOME/.local/share/opencode/auth.json" ] && ok "Hay claves de proveedores guardadas" || warn "No hay claves de proveedores guardadas todavía"

sec "HTTPS (Caddy)"
if command -v caddy >/dev/null; then
  systemctl is-active --quiet caddy && ok "Caddy activo" || { bad "Caddy no está activo"; hint "journalctl -u caddy -n 30 --no-pager"; }
  caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && ok "Caddyfile válido" || bad "Caddyfile no válido: caddy validate --config /etc/caddy/Caddyfile"
else echo "  (Caddy no instalado: acceso solo por el puerto $PORT)"; fi

sec "Salida por WireGuard (opcional)"
if [ -f /etc/wireguard/ocegress.conf ]; then
  if systemctl is-active --quiet wg-quick@ocegress; then
    ok "Túnel ocegress activo"
    h="$(wg show ocegress latest-handshakes 2>/dev/null | awk '{print $2}')"
    [ "${h:-0}" -gt 0 ] && ok "Handshake hace $(( $(date +%s) - h )) s" || warn "Sin handshake: revisa el servidor de casa (puerto UDP, claves)"
    ip rule show | grep -q "lookup 51820" && ok "Regla de enrutado del usuario del servicio presente" || bad "Falta la regla 'uidrange … lookup 51820'"
    d="$(curl -4 -s -m 8 https://api.ipify.org)"; t="$(runuser -u "$APP_USER" -- curl -4 -s -m 8 https://api.ipify.org)"
    echo "  IP del VPS: ${d:-?} · IP de OpenCode: ${t:-?}"
  else warn "Hay configuración WireGuard pero el túnel está desactivado"; hint "sudo $APP_DIR/deploy/egress.sh on"; fi
else echo "  (no configurado)"; fi
systemctl is-active --quiet opencode-egress.path 2>/dev/null && ok "Ayudante de WireGuard instalado" || true

sec "Conexión a GitHub"
c="$(runuser -u "$APP_USER" -- curl -s -o /dev/null -m 8 -w '%{http_code}' https://api.github.com 2>/dev/null)"
[ "$c" = 200 ] && ok "$APP_USER llega a GitHub" || warn "$APP_USER no llega a GitHub (HTTP ${c:-000})"

printf '\n\033[1mResumen:\033[0m %s correctas, %s avisos, %s errores\n' "$OK" "$WARN" "$BAD"
[ "$BAD" -eq 0 ] && [ "$WARN" -eq 0 ] && echo "Todo en orden."
exit $(( BAD > 0 ))
