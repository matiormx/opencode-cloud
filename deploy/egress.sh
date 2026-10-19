#!/usr/bin/env bash
# OpenCode Cloud — salida a internet por WireGuard (solo para el usuario del servicio).
#
# Las conexiones salientes de OpenCode (y de la WebUI) salen por tu servidor WireGuard de casa; el resto
# del VPS (SSH, Caddy, apt, DNS, respuestas a tu móvil) sigue usando la IP normal del VPS.
#
# Instalación única del ayudante (como root). Después todo se gestiona desde Ajustes → Salida a internet:
#   sudo /opt/opencode-cloud/deploy/egress.sh setup
#
# También se puede usar desde la terminal:
#   sudo ./deploy/egress.sh install /ruta/al/cliente.conf   instala y activa el túnel (o:  ... install - < cliente.conf)
#   sudo ./deploy/egress.sh on | off                        activa / desactiva sin borrar la configuración
#   sudo ./deploy/egress.sh status                          estado, handshake e IP pública con y sin túnel
#   sudo ./deploy/egress.sh remove                          lo desinstala y borra la configuración
#
# Variables: APP_USER=occloud  IFACE=ocegress  MTU=1380  DATA_DIR=/var/lib/opencode-cloud
#
# Seguridad: la WebUI no es root. Deja una petición en una carpeta suya y una unidad systemd de root
# (opencode-egress.path) la procesa con ESTA copia del script, instalada en /usr/local/lib (propiedad de root,
# no modificable por la app). El .conf se reconstruye solo con claves permitidas y valores validados: PostUp,
# PreUp, Table, etc. nunca llegan a wg-quick, así que no se puede ejecutar nada como root a través de él.
set -euo pipefail

APP_USER="${APP_USER:-occloud}"
IFACE="${IFACE:-ocegress}"
MTU="${MTU:-1380}"
SERVICE=opencode-cloud
HELPER_VERSION=3
ENV_FILE="${ENV_FILE:-/etc/$SERVICE.env}"
TABLE=51820
USER_UIDS="${USER_UIDS:-61000-61999}"   # uids de los usuarios del modo multiusuario
PRIO=100
WG_DIR="${WG_DIR:-/etc/wireguard}"
CONF="$WG_DIR/$IFACE.conf"
UNIT="wg-quick@$IFACE"
HELPER="${HELPER:-/usr/local/lib/opencode-cloud/egress.sh}"
DRY="${EGRESS_DRY:-0}"       # solo para pruebas: no toca systemd, wg ni la red

# DATA_DIR: el de la app (EnvironmentFile) salvo que se indique
if [ -z "${DATA_DIR:-}" ] && [ -r "$ENV_FILE" ]; then
  DATA_DIR="$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | tail -n1)"
fi
DATA_DIR="${DATA_DIR:-/var/lib/opencode-cloud}"
INBOX="${INBOX:-$DATA_DIR/egress-inbox}"     # escribe la app (usuario del servicio)
OUTBOX="${OUTBOX:-$DATA_DIR/egress-status}"  # escribe root, lee la app

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$DRY" = 1 ] || [ "$(id -u)" -eq 0 ] || die "Ejecútalo como root (sudo)."
[[ "$IFACE" =~ ^[a-z][a-z0-9_-]{0,14}$ ]] || die "IFACE no válido"
[[ "$MTU" =~ ^[0-9]{3,4}$ ]] || die "MTU no válido"

app_uid() {
  if [ -n "${APP_UID:-}" ]; then printf '%s' "$APP_UID"; return; fi
  id -u "$APP_USER" 2>/dev/null || die "No existe el usuario '$APP_USER' (¿está instalado OpenCode Cloud?)"
}

sys() { if [ "$DRY" = 1 ]; then echo "[dry] $*" >&2; else "$@"; fi; }

# IP pública vista por un usuario concreto (vacío si no hay respuesta)
public_ip() {
  local who="$1" ip
  [ "$DRY" = 1 ] && return 0
  for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    if [ "$who" = root ]; then ip="$(curl -4 -fsS --max-time 8 "$url" 2>/dev/null || true)"
    else ip="$(runuser -u "$who" -- curl -4 -fsS --max-time 8 "$url" 2>/dev/null || true)"; fi
    ip="$(printf '%s' "$ip" | tr -d '[:space:]')"
    [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] && { printf '%s' "$ip"; return 0; }
  done
  return 0
}

# Reconstruye /etc/wireguard/<iface>.conf desde un .conf del cliente. Solo se copian claves de una lista
# cerrada y con valores validados; todo lo demás (DNS, Table, PostUp, PreUp, SaveConfig, ListenPort…) se descarta.
build_conf() {
  local src="$1" uid="$2" parsed
  parsed="$(LC_ALL=C awk '
    function fail(m) { print "ERR " m; bad = 1; exit 1 }
    function trim(s) { sub(/^[ \t\r]+/, "", s); sub(/[ \t\r]+$/, "", s); return s }
    BEGIN { sec = ""; npeer = 0 }
    {
      line = trim($0)
      if (line == "" || line ~ /^[#;]/) next
      if (line ~ /^\[.*\]$/) {
        l = tolower(line)
        if (l == "[interface]") { sec = "i"; nif++; if (nif > 1) fail("Hay más de una sección [Interface]") }
        else if (l == "[peer]") { sec = "p"; npeer++; if (npeer > 1) fail("Solo se admite un [Peer]") }
        else fail("Sección no reconocida")
        next
      }
      eq = index(line, "=")
      if (!eq || sec == "") fail("Línea no válida en el fichero")
      k = tolower(trim(substr(line, 1, eq - 1))); v = trim(substr(line, eq + 1))
      if (sec == "i") {
        if (k == "privatekey") { if (v !~ /^[A-Za-z0-9+\/]{43}=$/) fail("PrivateKey no tiene formato de clave WireGuard"); priv = v }
        else if (k == "address") { if (v !~ /^[0-9A-Fa-f:.,\/ ]+$/) fail("Address no válida"); addr = v }
      } else {
        if (k == "publickey") { if (v !~ /^[A-Za-z0-9+\/]{43}=$/) fail("PublicKey no tiene formato de clave WireGuard"); pub = v }
        else if (k == "presharedkey") { if (v !~ /^[A-Za-z0-9+\/]{43}=$/) fail("PresharedKey no válida"); psk = v }
        else if (k == "endpoint") { if (v !~ /^([A-Za-z0-9._-]+|\[[0-9A-Fa-f:.]+\]):[0-9]{1,5}$/) fail("Endpoint no válido (usa host:puerto)"); ep = v }
        else if (k == "allowedips") { if (v !~ /^[0-9A-Fa-f:.,\/ ]+$/) fail("AllowedIPs no válido"); aips = v }
        else if (k == "persistentkeepalive") { if (v !~ /^[0-9]{1,5}$/) fail("PersistentKeepalive no válido"); ka = v }
      }
    }
    END {
      if (bad) exit 1
      if (!nif) { print "ERR Falta la sección [Interface]"; exit 1 }
      if (!npeer) { print "ERR Falta la sección [Peer]"; exit 1 }
      if (priv == "") { print "ERR Falta PrivateKey en [Interface]"; exit 1 }
      if (addr == "") { print "ERR Falta Address en [Interface]"; exit 1 }
      if (pub == "")  { print "ERR Falta PublicKey en [Peer]"; exit 1 }
      if (ep == "")   { print "ERR Falta Endpoint en [Peer]"; exit 1 }
      if (aips !~ /(^|[ ,])0\.0\.0\.0\/0/) { print "ERR AllowedIPs debe incluir 0.0.0.0/0 (el cliente debe poder salir a internet)"; exit 1 }
      print "OK"; print "ADDR " addr; print "PRIV " priv; print "PUB " pub; print "PSK " psk
      print "EP " ep; print "AIPS " aips; print "KA " (ka == "" ? 25 : ka)
    }' "$src")" || true
  if [ "$(printf '%s\n' "$parsed" | head -n1)" != OK ]; then
    local msg; msg="$(printf '%s\n' "$parsed" | sed -n 's/^ERR //p' | head -n1)"
    echo "${msg:-El fichero no es una configuración WireGuard válida}" >&2
    return 1
  fi
  local addr priv pub psk ep aips ka has6=0
  addr="$(printf '%s\n' "$parsed" | sed -n 's/^ADDR //p')"; priv="$(printf '%s\n' "$parsed" | sed -n 's/^PRIV //p')"
  pub="$(printf '%s\n' "$parsed" | sed -n 's/^PUB //p')";   psk="$(printf '%s\n' "$parsed" | sed -n 's/^PSK //p')"
  ep="$(printf '%s\n' "$parsed" | sed -n 's/^EP //p')";     aips="$(printf '%s\n' "$parsed" | sed -n 's/^AIPS //p')"
  ka="$(printf '%s\n' "$parsed" | sed -n 's/^KA //p')"
  [[ "$addr" == *:* && "$aips" == *::/0* ]] && has6=1

  # Se enruta el usuario del servicio y, en modo multiusuario, el rango de uids de los usuarios (deploy/multiuser.sh)
  local ranges="$uid-$uid $USER_UIDS" r up="ip route replace default dev %i table $TABLE" down=""
  for r in $ranges; do
    up="$up; ip rule add uidrange $r lookup $TABLE priority $PRIO"
    down="$down${down:+; }ip rule del uidrange $r lookup $TABLE priority $PRIO || true"
  done
  down="$down; ip route flush table $TABLE || true"
  if [ "$has6" = 1 ]; then
    up="$up; ip -6 route replace default dev %i table $TABLE"
    for r in $ranges; do
      up="$up; ip -6 rule add uidrange $r lookup $TABLE priority $PRIO"
      down="$down; ip -6 rule del uidrange $r lookup $TABLE priority $PRIO || true"
    done
    down="$down; ip -6 route flush table $TABLE || true"
  else
    # Sin IPv6 en el túnel: se corta v6 para esos usuarios y las apps caen a IPv4 (que sí va por el túnel)
    for r in $ranges; do
      up="$up; ip -6 rule add uidrange $r unreachable priority $PRIO || true"
      down="$down; ip -6 rule del uidrange $r unreachable priority $PRIO || true"
    done
  fi

  mkdir -p "$WG_DIR"; chmod 700 "$WG_DIR"
  local tmp; tmp="$(mktemp "$WG_DIR/.new.XXXXXX")"
  {
    echo "[Interface]"
    echo "PrivateKey = $priv"
    echo "Address = $addr"
    echo "Table = off"
    echo "MTU = $MTU"
    echo "PostUp = $up"
    echo "PostDown = $down"
    echo
    echo "[Peer]"
    echo "PublicKey = $pub"
    [ -n "$psk" ] && echo "PresharedKey = $psk"
    echo "Endpoint = $ep"
    echo "AllowedIPs = $aips"
    echo "PersistentKeepalive = $ka"
  } > "$tmp"
  chmod 600 "$tmp"; mv -f "$tmp" "$CONF"
}

handshake_ok() { [ "$DRY" = 1 ] && return 0; wg show "$IFACE" latest-handshakes 2>/dev/null | awk '{if ($2>0) ok=1} END{exit !ok}'; }
tunnel_active() { [ "$DRY" = 1 ] && [ -f "$OUTBOX/.dry-active" ] && return 0; [ "$DRY" = 1 ] && return 1; systemctl is-active --quiet "$UNIT"; }

check() {
  local direct tunnel
  [ "$DRY" = 1 ] || sleep 2
  if handshake_ok; then log "Handshake con el servidor de casa: OK"
  else warn "Todavía no hay handshake. Revisa Endpoint, claves y que el puerto UDP esté abierto en tu router."; fi
  direct="$(public_ip root)"; tunnel="$(public_ip "$APP_USER")"
  echo "  IP del VPS (root, directa):        ${direct:-?}"
  echo "  IP de salida de $APP_USER (OpenCode): ${tunnel:-sin respuesta}"
  CHECK_DIRECT="$direct"; CHECK_TUNNEL="$tunnel"
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
  if [ "$DRY" != 1 ] && systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
    log "Reiniciando $SERVICE para que use la nueva salida"
    systemctl restart "$SERVICE"
  fi
}

ensure_wg() {
  if [ "$DRY" = 1 ]; then return 0; fi
  if ! command -v wg >/dev/null || ! command -v wg-quick >/dev/null; then
    log "Instalando wireguard-tools"
    DEBIAN_FRONTEND=noninteractive apt-get update -y
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends wireguard-tools iproute2 curl
  fi
}

do_install() {
  local src="$1" uid tmp
  uid="$(app_uid)"
  [ "$src" != "-" ] && { [ -r "$src" ] || die "No puedo leer $src"; }
  tmp="$(mktemp)"; trap 'rm -f "$tmp"' RETURN; chmod 600 "$tmp"
  if [ "$src" = "-" ]; then cat > "$tmp"; else cat "$src" > "$tmp"; fi
  ensure_wg
  subst_saved "$tmp" || return 1
  # Primero se valida y se escribe: si el fichero es inválido, el túnel que ya funcionaba no se toca
  build_conf "$tmp" "$uid" || return 1
  log "Configuración escrita en $CONF"
  if tunnel_active; then sys systemctl stop "$UNIT" || true; fi
  sys systemctl enable --now "$UNIT" >/dev/null
  [ "$DRY" = 1 ] && touch "$OUTBOX/.dry-active" 2>/dev/null || true
}

# Segundos desde el último handshake con el servidor de casa; -1 si no ha habido ninguno
hs_age() {
  [ "$DRY" = 1 ] && { echo 5; return; }
  local t; t="$(wg show "$IFACE" latest-handshakes 2>/dev/null | awk '{print $2; exit}')"
  if [[ "${t:-0}" =~ ^[0-9]+$ ]] && [ "${t:-0}" -gt 0 ]; then echo $(( $(date +%s) - t )); else echo -1; fi
}

# Texto editable de la configuración guardada para la WebUI: solo campos permitidos y validados, con las claves
# secretas sustituidas por "(guardada)". Al aplicarlo, esa marca conserva la clave que ya está en el VPS.
conf_view() {
  [ -f "$CONF" ] || return 0
  local get out k v re_b64 re_ep re_ad re_ai re_n
  re_b64='^[A-Za-z0-9+/]{43}=$'; re_ep='^([A-Za-z0-9._-]+|\[[0-9A-Fa-f:.]+\]):[0-9]{1,5}$'; re_ad='^[0-9A-Fa-f:.,/ ]+$'; re_n='^[0-9]{1,5}$'
  get() { sed -n "s/^$1 = //p" "$CONF" | head -n1; }
  out="[Interface]\nPrivateKey = (guardada)\n"
  v="$(get Address)"; [[ "$v" =~ $re_ad ]] && out="${out}Address = $v\n"
  out="${out}\n[Peer]\n"
  v="$(get PublicKey)"; [[ "$v" =~ $re_b64 ]] && out="${out}PublicKey = $v\n"
  v="$(get PresharedKey)"; [ -n "$v" ] && out="${out}PresharedKey = (guardada)\n"
  v="$(get Endpoint)"; [[ "$v" =~ $re_ep ]] && out="${out}Endpoint = $v\n"
  v="$(get AllowedIPs)"; [[ "$v" =~ $re_ad ]] && out="${out}AllowedIPs = $v\n"
  v="$(get PersistentKeepalive)"; [[ "$v" =~ $re_n ]] && out="${out}PersistentKeepalive = $v\n"
  printf '%s' "$out"
}

# Sustituye "PrivateKey = (guardada)" / "PresharedKey = (guardada)" por la clave que ya está guardada en el VPS
subst_saved() {
  local f="$1" k v
  for k in PrivateKey PresharedKey; do
    if grep -qiE "^[[:space:]]*$k[[:space:]]*=[[:space:]]*\(guardada\)[[:space:]]*$" "$f"; then
      v="$(sed -n "s/^$k = //p" "$CONF" 2>/dev/null | head -n1)"
      if ! [[ "$v" =~ ^[A-Za-z0-9+/]{43}=$ ]]; then echo "No hay $k guardada que conservar: pégala completa" >&2; return 1; fi
      sed -i -E "s|^[[:space:]]*$k[[:space:]]*=[[:space:]]*\(guardada\)[[:space:]]*$|$k = $v|I" "$f"
    fi
  done
}

# Estado "vivo" para la WebUI (health.json). Solo texto validado; nunca la clave privada.
write_health() {
  local configured=false active=false enabled=false age=-1 ep="" ad="" tmp re_ep re_ad
  [ -f "$CONF" ] && configured=true
  tunnel_active && active=true
  if [ "$DRY" != 1 ] && systemctl is-enabled --quiet "$UNIT" 2>/dev/null; then enabled=true; fi
  [ "$active" = true ] && age="$(hs_age)"
  if [ -f "$CONF" ]; then
    ep="$(sed -n 's/^Endpoint = //p' "$CONF" | head -n1)"; ad="$(sed -n 's/^Address = //p' "$CONF" | head -n1)"
  fi
  re_ep='^([A-Za-z0-9._-]+|\[[0-9A-Fa-f:.]+\]):[0-9]{1,5}$'; re_ad='^[0-9A-Fa-f:.,/ ]+$'
  [[ "$ep" =~ $re_ep ]] || ep=""; [[ "$ad" =~ $re_ad ]] || ad=""
  mkdir -p "$OUTBOX"
  tmp="$(mktemp "$OUTBOX/.h.XXXXXX")"
  printf '{"v":%s,"configured":%s,"active":%s,"enabled":%s,"handshakeAge":%s,"endpoint":"%s","address":"%s","view":"%s","at":%s000}\n' \
    "$HELPER_VERSION" "$configured" "$active" "$enabled" "$age" "$ep" "$ad" "$(conf_view)" "$(date +%s)" > "$tmp"
  chmod 644 "$tmp"; mv -f "$tmp" "$OUTBOX/health.json"
}

# Vigilante (lo lanza un temporizador de systemd cada minuto): si el túnel debería estar activo pero se ha caído
# (p. ej. el DNS no respondía al arrancar, o tu IP de casa ha cambiado) lo recupera sin que tengas que volver a pegar nada.
watch() {
  mkdir -p "$OUTBOX"
  if [ -f "$CONF" ] && [ "$DRY" != 1 ] && systemctl is-enabled --quiet "$UNIT" 2>/dev/null; then
    local stf="$OUTBOX/.watch" last=0 now age pub ep
    now="$(date +%s)"; [ -f "$stf" ] && last="$(cat "$stf" 2>/dev/null || echo 0)"; [[ "$last" =~ ^[0-9]+$ ]] || last=0
    if ! tunnel_active; then
      if [ $((now - last)) -ge 120 ]; then echo "$now" > "$stf"; log "El túnel estaba caído: reiniciándolo"; systemctl restart "$UNIT" || true; fi
    else
      age="$(hs_age)"
      if { [ "$age" -lt 0 ] || [ "$age" -gt 300 ]; } && [ $((now - last)) -ge 300 ]; then
        echo "$now" > "$stf"
        pub="$(sed -n 's/^PublicKey = //p' "$CONF" | head -n1)"; ep="$(sed -n 's/^Endpoint = //p' "$CONF" | head -n1)"
        log "Sin handshake desde hace ${age}s: volviendo a resolver el Endpoint ($ep)"
        wg set "$IFACE" peer "$pub" endpoint "$ep" 2>/dev/null || true
        sleep 8
        age="$(hs_age)"
        if [ "$age" -lt 0 ] || [ "$age" -gt 300 ]; then log "Sigue sin handshake: reiniciando el túnel"; systemctl restart "$UNIT" || true; fi
      fi
    fi
  fi
  write_health
}

# Reconexión pedida desde la WebUI: reinicia el túnel y vuelve a resolver el Endpoint
reconnect() {
  [ "$DRY" = 1 ] && return 0
  systemctl is-enabled --quiet "$UNIT" 2>/dev/null || return 1
  systemctl restart "$UNIT"
}

# ---------------------------------------------------------------- Modo ayudante (lo lanza systemd como root)
# Estado para la WebUI: JSON con solo texto fijo (nunca se copia contenido del usuario)
write_status() { # id ok mensaje [directIp tunnelIp]
  local id="$1" ok="$2" msg="$3" d="${4:-}" t="${5:-}" configured=false active=false tmp
  [ -f "$CONF" ] && configured=true
  tunnel_active && active=true
  msg="$(printf '%s' "$msg" | tr -d '\000-\037' | sed 's/["\\]//g' | cut -c1-300)"
  [[ "$d" =~ ^[0-9.]+$ ]] || d=""; [[ "$t" =~ ^[0-9.]+$ ]] || t=""
  mkdir -p "$OUTBOX"
  tmp="$(mktemp "$OUTBOX/.s.XXXXXX")"
  printf '{"id":"%s","ok":%s,"message":"%s","configured":%s,"active":%s,"directIp":"%s","tunnelIp":"%s","at":%s000}\n' \
    "$id" "$ok" "$msg" "$configured" "$active" "$d" "$t" "$(date +%s)" > "$tmp"
  chmod 644 "$tmp"; mv -f "$tmp" "$OUTBOX/status.json"
  write_health
}

worker() {
  local req="$INBOX/request" conf="$INBOX/wg.conf" action id rest
  mkdir -p "$OUTBOX"; chmod 755 "$OUTBOX"
  # La carpeta de entrada es de la app: no se sigue ningún enlace simbólico y se limita el tamaño
  if [ ! -f "$req" ] || [ -L "$req" ]; then rm -f -- "$req"; return 0; fi
  read -r action id rest < <(head -c 200 -- "$req" | head -n1) || true
  rm -f -- "$req"
  [[ "${id:-}" =~ ^[a-f0-9]{8,32}$ ]] || id=none
  trap 'rm -f -- "$conf" 2>/dev/null || true' RETURN
  case "$action" in
    apply)
      if [ ! -f "$conf" ] || [ -L "$conf" ] || [ "$(stat -c %s -- "$conf")" -gt 8192 ]; then write_status "$id" false "No se recibió una configuración válida"; return 0; fi
      local err
      if err="$( { do_install "$conf" >/dev/null; } 2>&1 )"; then
        check >/dev/null 2>&1 || true
        if [ -n "${CHECK_TUNNEL:-}" ] && [ "${CHECK_TUNNEL}" != "${CHECK_DIRECT:-}" ]; then write_status "$id" true "Túnel activo" "${CHECK_DIRECT:-}" "${CHECK_TUNNEL:-}"
        elif handshake_ok; then write_status "$id" true "Túnel activo, pero OpenCode no consigue salir por él: revisa el reenvío de IP y el NAT del servidor de casa" "${CHECK_DIRECT:-}" "${CHECK_TUNNEL:-}"
        else write_status "$id" true "Túnel creado, pero no hay handshake: revisa Endpoint, claves y el puerto UDP abierto en el router" "${CHECK_DIRECT:-}" ""; fi
      else
        # Mensajes fijos de build_conf; se quitan códigos de color y prefijos
        err="$(printf '%s' "$err" | sed 's/\x1b\[[0-9;]*m//g; s/^\[error\] *//' | tail -n1)"
        write_status "$id" false "${err:-No se pudo aplicar la configuración}"
      fi ;;
    on)
      if [ ! -f "$CONF" ]; then write_status "$id" false "Todavía no hay ninguna configuración"; return 0; fi
      sys systemctl enable --now "$UNIT" >/dev/null 2>&1 || true; [ "$DRY" = 1 ] && touch "$OUTBOX/.dry-active"
      check >/dev/null 2>&1 || true; write_status "$id" true "Túnel activado" "${CHECK_DIRECT:-}" "${CHECK_TUNNEL:-}" ;;
    off)
      sys systemctl disable --now "$UNIT" >/dev/null 2>&1 || true; [ "$DRY" = 1 ] && rm -f "$OUTBOX/.dry-active"
      write_status "$id" true "Túnel desactivado: OpenCode sale por la IP del VPS" ;;
    remove)
      sys systemctl disable --now "$UNIT" >/dev/null 2>&1 || true; [ "$DRY" = 1 ] && rm -f "$OUTBOX/.dry-active"
      rm -f -- "$CONF"; write_status "$id" true "Configuración eliminada" ;;
    reconnect)
      if [ ! -f "$CONF" ]; then write_status "$id" false "Todavía no hay ninguna configuración"; return 0; fi
      if reconnect; then
        check >/dev/null 2>&1 || true
        if [ -n "${CHECK_TUNNEL:-}" ] && [ "${CHECK_TUNNEL}" != "${CHECK_DIRECT:-}" ]; then write_status "$id" true "Túnel reconectado" "${CHECK_DIRECT:-}" "${CHECK_TUNNEL:-}"
        elif handshake_ok; then write_status "$id" true "Túnel reconectado, pero OpenCode no consigue salir por él: revisa el reenvío de IP y el NAT del servidor de casa" "${CHECK_DIRECT:-}" ""
        else write_status "$id" true "Túnel reiniciado, pero no hay handshake: revisa que tu servidor de casa esté encendido, el Endpoint y el puerto UDP" "${CHECK_DIRECT:-}" ""; fi
      else write_status "$id" false "El túnel está desactivado: actívalo primero"; fi ;;
    status) write_status "$id" true "Estado actualizado" ;;
    *) write_status "$id" false "Acción no reconocida" ;;
  esac
}

# ---------------------------------------------------------------- Instalación única del ayudante
setup() {
  local uid; uid="$(app_uid)"
  ensure_wg
  install -d -m 755 "$(dirname "$HELPER")"
  install -m 755 -o root -g root "$0" "$HELPER"
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$INBOX"
  install -d -m 755 -o root -g root "$OUTBOX"
  cat > "/etc/systemd/system/opencode-egress.service" <<EOF
[Unit]
Description=OpenCode Cloud — aplica la salida por WireGuard pedida desde la WebUI

[Service]
Type=oneshot
Environment=APP_USER=$APP_USER IFACE=$IFACE MTU=$MTU DATA_DIR=$DATA_DIR
ExecStart=$HELPER worker
EOF
  cat > "/etc/systemd/system/opencode-egress.path" <<EOF
[Unit]
Description=OpenCode Cloud — peticiones de salida por WireGuard

[Path]
PathExists=$INBOX/request
Unit=opencode-egress.service

[Install]
WantedBy=multi-user.target
EOF
  cat > "/etc/systemd/system/opencode-egress-watch.service" <<EOF
[Unit]
Description=OpenCode Cloud — vigila el túnel WireGuard y lo recupera si se cae

[Service]
Type=oneshot
Environment=APP_USER=$APP_USER IFACE=$IFACE MTU=$MTU DATA_DIR=$DATA_DIR
ExecStart=$HELPER watch
EOF
  cat > "/etc/systemd/system/opencode-egress-watch.timer" <<EOF
[Unit]
Description=OpenCode Cloud — vigilancia del túnel WireGuard

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=10s

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now opencode-egress.path >/dev/null
  systemctl enable --now opencode-egress-watch.timer >/dev/null
  write_status none true "Ayudante instalado"
  log "Listo. Abre Ajustes → Salida a internet en la WebUI para cargar tu configuración de WireGuard."
  log "(Si actualizas la aplicación y cambia este script, vuelve a ejecutar: sudo $0 setup)"
}

cmd="${1:-status}"
case "$cmd" in
  setup) setup ;;
  worker) worker ;;
  watch) watch ;;
  install)
    src="${2:-}"; [ -n "$src" ] || die "Uso: $0 install /ruta/cliente.conf   (o '-' para leer de la entrada estándar)"
    mkdir -p "$OUTBOX"
    do_install "$src" || exit 1
    restart_app; check
    echo; echo "Desactivar:  sudo $0 off      Reactivar:  sudo $0 on      Estado:  sudo $0 status" ;;
  on)
    [ -f "$CONF" ] || die "No hay configuración. Ejecuta primero: $0 install cliente.conf"
    sys systemctl enable --now "$UNIT" >/dev/null; restart_app; check ;;
  off)
    sys systemctl disable --now "$UNIT" >/dev/null 2>&1 || true; restart_app
    log "Túnel desactivado: OpenCode vuelve a salir por la IP del VPS." ;;
  status)
    if tunnel_active; then log "Túnel activo ($IFACE)"; wg show "$IFACE" 2>/dev/null | grep -v -i 'private key\|preshared' || true; check
    else log "Túnel inactivo"; fi ;;
  remove)
    sys systemctl disable --now "$UNIT" >/dev/null 2>&1 || true
    rm -f "$CONF"; restart_app
    log "Eliminado." ;;
  *) die "Uso: $0 setup | watch | install <cliente.conf> | on | off | status | remove" ;;
esac
