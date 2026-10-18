#!/usr/bin/env bash
# OpenCode Cloud — salida a internet por WireGuard (solo para el usuario del servicio).
#
# Las conexiones salientes de OpenCode (y de la WebUI) salen por tu servidor WireGuard de casa; el resto
# del VPS (SSH, Caddy, apt, DNS, respuestas a tu móvil) sigue usando la IP normal del VPS.
#
# Uso (como root):
#   sudo ./deploy/egress.sh install /ruta/al/cliente.conf   instala y activa el túnel (o:  ... install - < cliente.conf)
#   sudo ./deploy/egress.sh on | off                        activa / desactiva sin borrar la configuración
#   sudo ./deploy/egress.sh status                          estado, handshake e IP pública con y sin túnel
#   sudo ./deploy/egress.sh remove                          lo desinstala y borra la configuración
#
# Variables: APP_USER=occloud  IFACE=ocegress  MTU=1380
set -euo pipefail

APP_USER="${APP_USER:-occloud}"
IFACE="${IFACE:-ocegress}"
MTU="${MTU:-1380}"
TABLE=51820
PRIO=100
CONF="/etc/wireguard/$IFACE.conf"
UNIT="wg-quick@$IFACE"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Ejecútalo como root (sudo)."
[[ "$IFACE" =~ ^[a-z][a-z0-9_-]{0,14}$ ]] || die "IFACE no válido"
[[ "$MTU" =~ ^[0-9]{3,4}$ ]] || die "MTU no válido"

app_uid() { id -u "$APP_USER" 2>/dev/null || die "No existe el usuario '$APP_USER' (¿está instalado OpenCode Cloud?)"; }

# IP pública vista por un usuario concreto (vacío si no hay respuesta)
public_ip() {
  local who="$1" ip
  for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    if [ "$who" = root ]; then ip="$(curl -4 -fsS --max-time 8 "$url" 2>/dev/null || true)"
    else ip="$(runuser -u "$who" -- curl -4 -fsS --max-time 8 "$url" 2>/dev/null || true)"; fi
    ip="$(printf '%s' "$ip" | tr -d '[:space:]')"
    [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && { printf '%s' "$ip"; return 0; }
  done
  return 0
}

# Genera /etc/wireguard/<iface>.conf a partir del .conf del cliente: quita lo que podría secuestrar
# todo el tráfico del VPS (Table, DNS, PostUp…) y añade el enrutado por usuario.
build_conf() {
  local src="$1" uid="$2"
  grep -q '^\[Interface\]' "$src" || die "El fichero no tiene sección [Interface]"
  grep -q '^\[Peer\]' "$src"      || die "El fichero no tiene sección [Peer]"
  grep -qi '^PrivateKey *=' "$src" || die "Falta PrivateKey en [Interface]"
  grep -qi '^Endpoint *=' "$src"   || die "Falta Endpoint en [Peer]"
  grep -qi '^PublicKey *=' "$src"  || die "Falta PublicKey en [Peer]"
  grep -qi '^AllowedIPs *=.*0\.0\.0\.0/0' "$src" || die "AllowedIPs debe incluir 0.0.0.0/0 (el cliente de casa debe permitir salir a internet)"

  local has6=0
  # ¿El túnel trae IPv6? (dirección v6 en [Interface] y ::/0 permitido)
  if awk '/^\[Interface\]/{i=1;next}/^\[/{i=0} i&&/^[Aa]ddress *=/&&/:/{f=1} END{exit !f}' "$src" && grep -qi '^AllowedIPs *=.*::/0' "$src"; then has6=1; fi

  local up down
  up="PostUp = ip route replace default dev %i table $TABLE; ip rule add uidrange $uid-$uid lookup $TABLE priority $PRIO"
  down="PostDown = ip rule del uidrange $uid-$uid lookup $TABLE priority $PRIO || true; ip route flush table $TABLE || true"
  if [ "$has6" = 1 ]; then
    up="$up; ip -6 route replace default dev %i table $TABLE; ip -6 rule add uidrange $uid-$uid lookup $TABLE priority $PRIO"
    down="$down; ip -6 rule del uidrange $uid-$uid lookup $TABLE priority $PRIO || true; ip -6 route flush table $TABLE || true"
  else
    # Sin IPv6 en el túnel: se corta v6 para ese usuario y las apps caen a IPv4 (que sí va por el túnel)
    up="$up; ip -6 rule add uidrange $uid-$uid unreachable priority $PRIO || true"
    down="$down; ip -6 rule del uidrange $uid-$uid unreachable priority $PRIO || true"
  fi

  awk -v up="$up" -v down="$down" -v mtu="$MTU" '
    function flush_iface() { if (!done) { print "Table = off"; print "MTU = " mtu; print up; print down; done = 1 } }
    /^\[Interface\]/ { sec = "i"; print; next }
    /^\[Peer\]/      { if (sec == "i") flush_iface(); sec = "p"; haspk = 0; print; next }
    sec == "i" && tolower($0) ~ /^[ \t]*(table|dns|mtu|preup|postup|predown|postdown|saveconfig)[ \t]*=/ { next }
    sec == "p" && tolower($0) ~ /^[ \t]*persistentkeepalive[ \t]*=/ { haspk = 1 }
    { print }
    END { if (sec == "i") flush_iface() }
  ' "$src" > "$CONF.new"
  # Keepalive por si el servidor de casa está detrás de NAT
  grep -qi '^PersistentKeepalive *=' "$CONF.new" || printf 'PersistentKeepalive = 25\n' >> "$CONF.new"
  chmod 600 "$CONF.new"
  mv -f "$CONF.new" "$CONF"
}

check() {
  local direct tunnel
  sleep 2
  if wg show "$IFACE" latest-handshakes 2>/dev/null | awk '{if ($2>0) ok=1} END{exit !ok}'; then
    log "Handshake con el servidor de casa: OK"
  else
    warn "Todavía no hay handshake. Revisa Endpoint, claves y que el puerto UDP esté abierto en tu router."
  fi
  direct="$(public_ip root)"; tunnel="$(public_ip "$APP_USER")"
  echo "  IP del VPS (root, directa):        ${direct:-?}"
  echo "  IP de salida de $APP_USER (OpenCode): ${tunnel:-sin respuesta}"
  if [ -z "$tunnel" ]; then
    warn "OpenCode no consigue salir por el túnel. Comprueba en casa el reenvío de IP y el NAT (masquerade) del servidor WireGuard."
  elif [ -n "$direct" ] && [ "$direct" = "$tunnel" ]; then
    warn "Ambas IPs coinciden: el túnel no se está usando."
  else
    log "OpenCode sale ahora por tu casa ($tunnel)."
  fi
}

restart_app() {
  # Las conexiones ya abiertas siguen por la ruta antigua; reiniciar para que todo salga por el túnel
  if systemctl is-active --quiet opencode-cloud 2>/dev/null; then
    log "Reiniciando opencode-cloud para que use la nueva salida"
    systemctl restart opencode-cloud
  fi
}

cmd="${1:-status}"
case "$cmd" in
  install)
    src="${2:-}"; [ -n "$src" ] || die "Uso: $0 install /ruta/cliente.conf   (o '-' para leer de la entrada estándar)"
    uid="$(app_uid)"
    tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT; chmod 600 "$tmp"
    if [ "$src" = "-" ]; then cat > "$tmp"; else [ -r "$src" ] || die "No puedo leer $src"; cat "$src" > "$tmp"; fi
    tr -d '\r' < "$tmp" > "$tmp.n" && mv "$tmp.n" "$tmp"
    if ! command -v wg >/dev/null || ! command -v wg-quick >/dev/null; then
      log "Instalando wireguard-tools"
      DEBIAN_FRONTEND=noninteractive apt-get update -y
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends wireguard-tools iproute2 curl
    fi
    mkdir -p /etc/wireguard; chmod 700 /etc/wireguard
    systemctl is-active --quiet "$UNIT" && systemctl stop "$UNIT" || true
    build_conf "$tmp" "$uid"
    log "Configuración escrita en $CONF"
    systemctl enable --now "$UNIT" >/dev/null
    restart_app
    check
    echo
    echo "Desactivar:  sudo $0 off      Reactivar:  sudo $0 on      Estado:  sudo $0 status"
    ;;
  on)
    [ -f "$CONF" ] || die "No hay configuración. Ejecuta primero: $0 install cliente.conf"
    systemctl enable --now "$UNIT" >/dev/null; restart_app; check ;;
  off)
    systemctl disable --now "$UNIT" >/dev/null 2>&1 || true; restart_app
    log "Túnel desactivado: OpenCode vuelve a salir por la IP del VPS." ;;
  status)
    if systemctl is-active --quiet "$UNIT"; then log "Túnel activo ($IFACE)"; wg show "$IFACE" 2>/dev/null | grep -v -i 'private key\|preshared' || true; check
    else log "Túnel inactivo"; fi ;;
  remove)
    systemctl disable --now "$UNIT" >/dev/null 2>&1 || true
    rm -f "$CONF"; restart_app
    log "Eliminado." ;;
  *) die "Uso: $0 install <cliente.conf> | on | off | status | remove" ;;
esac
