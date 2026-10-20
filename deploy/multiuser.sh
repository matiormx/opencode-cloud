#!/usr/bin/env bash
# OpenCode Cloud — modo multiusuario.
#
# Cada usuario tiene su propio usuario de Linux (ocu-<nombre>), su propia carpeta (/var/lib/opencode-users/<nombre>),
# su propio OpenCode, sus claves de API y su token de GitHub, y se ejecuta como un servicio systemd aparte
# (opencode-cloud-user@<nombre>). Uno no puede leer los archivos ni los procesos de otro.
# La app pasa a ser solo la pasarela (login, usuarios, actualizaciones, red): NO ejecuta al agente ni ve los proyectos.
# El administrador solo administra (usuarios, red, actualizaciones): no tiene espacio de trabajo. Los usuarios, uno cada uno.
#
# Instalación única (como root). Después, los usuarios se crean y gestionan desde Ajustes → Usuarios:
#   sudo /opt/opencode-cloud/deploy/multiuser.sh setup
#   sudo /opt/opencode-cloud/deploy/multiuser.sh status     lista los espacios y su estado
#   sudo /opt/opencode-cloud/deploy/multiuser.sh disable    vuelve al modo de un solo usuario (no borra a nadie)
#
# Seguridad: la WebUI no es root. Deja una petición en una carpeta suya y una unidad systemd de root
# (opencode-multiuser.path) la procesa con ESTA copia del script, instalada en /usr/local/lib (de root, la app no
# puede modificarla). El nombre se valida con una lista cerrada; nunca se ejecuta texto recibido.
set -euo pipefail

HELPER_VERSION=1
APP_USER="${APP_USER:-occloud}"
APP_DIR="${APP_DIR:-/opt/opencode-cloud}"
SERVICE=opencode-cloud
ENV_FILE="${ENV_FILE:-/etc/$SERVICE.env}"
DRY="${MU_DRY:-0}"                       # solo para pruebas: no toca usuarios, systemd ni permisos

if [ -z "${DATA_DIR:-}" ] && [ -r "$ENV_FILE" ]; then DATA_DIR="$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | tail -n1)"; fi
DATA_DIR="${DATA_DIR:-/var/lib/opencode-cloud}"
USERS_BASE="${USERS_BASE:-/var/lib/opencode-users}"
CONF_DIR="${CONF_DIR:-/etc/opencode-cloud/instances}"
LIB_DIR="${LIB_DIR:-/usr/local/lib/opencode-cloud}"
HELPER="${HELPER:-$LIB_DIR/multiuser.sh}"
OC_SHARED="${OC_SHARED:-$LIB_DIR/opencode}"
INBOX="${INBOX:-$DATA_DIR/multiuser-inbox}"      # escribe la app
OUTBOX="${OUTBOX:-$DATA_DIR/multiuser-status}"   # escribe root, lee la app
KEYS="${KEYS:-$DATA_DIR/instance-keys}"          # root:occloud 750 (puerto y secreto de cada espacio)
INDEX="$CONF_DIR/index"
UID_BASE=61000          # uids 61000-61999 reservados a los usuarios (egress.sh los enruta por WireGuard)
APP_PORT_BASE=3100
OC_PORT_BASE=4100
MAX_USERS=900
NAME_RE='^[a-z][a-z0-9]{1,19}$'

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }
sys()  { if [ "$DRY" = 1 ]; then echo "[dry] $*" >&2; else "$@"; fi; }
# Paso obligatorio de do_create: si falla, termina el subshell con el motivo (set -e no actúa dentro de un 'if')
step() { sys "$@" || { echo "Falló: $1 $2"; exit 1; }; }

[ "$DRY" = 1 ] || [ "$(id -u)" -eq 0 ] || die "Ejecútalo como root (sudo)."

idx_of() { awk -v n="$1" '$1==n{print $2}' "$INDEX" 2>/dev/null || true; }
next_idx() {
  local i
  for ((i = 1; i <= MAX_USERS; i++)); do
    awk -v i="$i" '$2==i{f=1} END{exit f}' "$INDEX" 2>/dev/null && { echo "$i"; return 0; }
  done
  return 1
}
rand_hex() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# ---------------------------------------------------------------- Estado para la WebUI (solo texto fijo)
write_status() { # id ok mensaje
  local id="$1" ok="$2" msg="$3" tmp
  msg="$(printf '%s' "$msg" | tr -d '\000-\037' | sed 's/["\\]//g' | cut -c1-300)"
  mkdir -p "$OUTBOX"
  tmp="$(mktemp "$OUTBOX/.s.XXXXXX")"
  printf '{"id":"%s","ok":%s,"message":"%s","version":%s,"at":%s000}\n' "$id" "$ok" "$msg" "$HELPER_VERSION" "$(date +%s)" > "$tmp"
  chmod 644 "$tmp"; mv -f "$tmp" "$OUTBOX/status.json"
}

# ---------------------------------------------------------------- Operaciones sobre un espacio
unit_of() { echo "opencode-cloud-user@$1.service"; }

wait_health() { # puerto
  [ "$DRY" = 1 ] && return 0
  local i
  for i in $(seq 1 40); do
    [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "http://127.0.0.1:$1/api/health" || true)" = 200 ] && return 0
    sleep 0.5
  done
  return 1
}

# Comprobaciones previas: si fallan, no se ha tocado nada (y por tanto no hay que deshacer nada)
precheck_create() {
  local name="$1" idx lname
  lname="ocu-$name"
  [ -z "$(idx_of "$name")" ] || { echo "Ese espacio ya existe"; return 1; }
  idx="$(next_idx)" || { echo "No quedan huecos para más usuarios"; return 1; }
  id "$lname" >/dev/null 2>&1 && { echo "Ya existe un usuario de Linux $lname"; return 1; }
  getent passwd "$((UID_BASE + idx))" >/dev/null 2>&1 && { echo "El uid $((UID_BASE + idx)) ya está en uso"; return 1; }
  [ ! -e "$USERS_BASE/$name" ] || { echo "Ya hay una carpeta $USERS_BASE/$name"; return 1; }
  return 0
}

do_create() {
  local name="$1" idx uid port ocport lname secret home
  idx="$(next_idx)"
  uid=$((UID_BASE + idx)); port=$((APP_PORT_BASE + idx)); ocport=$((OC_PORT_BASE + idx)); lname="ocu-$name"
  home="$USERS_BASE/$name/home"
  secret="$(rand_hex)"

  step install -d -m 711 -o root -g root "$USERS_BASE"
  step useradd --uid "$uid" --user-group --no-create-home --home-dir "$home" --shell /bin/bash --comment "OpenCode Cloud - $name" "$lname"
  step install -d -m 700 -o "$lname" -g "$lname" "$USERS_BASE/$name"
  step install -d -m 700 -o "$lname" -g "$lname" "$home"
  step install -d -m 700 -o "$lname" -g "$lname" "$USERS_BASE/$name/data"
  step install -d -m 755 -o "$lname" -g "$lname" "$USERS_BASE/$name/data/projects"

  mkdir -p "$CONF_DIR"; chmod 711 "$CONF_DIR"
  ( umask 077
    cat > "$CONF_DIR/$name.env" <<EOF
HOST=127.0.0.1
PORT=$port
OPENCODE_PORT=$ocport
DATA_DIR=$USERS_BASE/$name/data
INSTANCE_SECRET=$secret
INSTANCE_USER=$name
OC_PERMISSION=ask
OPENCODE_BIN=$OC_SHARED
EOF
  )
  step chown "root:$lname" "$CONF_DIR/$name.env"; chmod 640 "$CONF_DIR/$name.env"

  step install -d -m 750 -o root -g "$APP_USER" "$KEYS"
  ( umask 077; printf '{"port":%s,"secret":"%s"}\n' "$port" "$secret" > "$KEYS/$name.json" )
  step chown "root:$APP_USER" "$KEYS/$name.json"; chmod 640 "$KEYS/$name.json"

  echo "$name $idx" >> "$INDEX"
  step systemctl enable --now "$(unit_of "$name")" >/dev/null 2>&1
  wait_health "$port" || { echo "El espacio se creó pero no responde todavía (journalctl -u $(unit_of "$name"))"; return 1; }
}

do_delete() { # name purge(0|1)
  local name="$1" purge="$2" lname dest
  lname="ocu-$name"
  sys systemctl disable --now "$(unit_of "$name")" >/dev/null 2>&1 || true
  [ "$DRY" = 1 ] || pkill -u "$lname" 2>/dev/null || true
  rm -f -- "$CONF_DIR/$name.env" "$KEYS/$name.json"
  if [ -f "$INDEX" ]; then grep -v "^$name " "$INDEX" > "$INDEX.new" || true; mv -f "$INDEX.new" "$INDEX"; fi
  sys userdel "$lname" >/dev/null 2>&1 || true
  [ -n "$USERS_BASE" ] && [ -d "$USERS_BASE/$name" ] || return 0
  if [ "$purge" = 1 ]; then
    rm -rf -- "${USERS_BASE:?}/$name"
  else
    dest="$USERS_BASE/_removed/$name-$(date +%s)"
    mkdir -p "$USERS_BASE/_removed"; chmod 700 "$USERS_BASE/_removed"
    mv -- "$USERS_BASE/$name" "$dest"
    sys chown -R root:root "$dest"
  fi
}

# Actualiza OpenCode con la copia del usuario de la app y la publica como copia compartida (de root) para todos los espacios
upgrade_opencode() {
  local app_home src ver
  app_home="$(getent passwd "$APP_USER" | cut -d: -f6)"; src="$app_home/.opencode/bin/opencode"
  [ -x "$src" ] || { echo "No encuentro OpenCode en $src"; return 1; }
  runuser -u "$APP_USER" -- env HOME="$app_home" "$src" upgrade >/dev/null 2>&1 || { echo "opencode upgrade falló"; return 1; }
  install -m 755 -o root -g root "$src" "$OC_SHARED.new" && mv -f "$OC_SHARED.new" "$OC_SHARED"
  ver="$("$OC_SHARED" --version 2>/dev/null | head -n1 || true)"
  while read -r n _; do [ -n "$n" ] && sys systemctl restart "$(unit_of "$n")" >/dev/null 2>&1 || true; done < "$INDEX" 2>/dev/null || true
  echo "${ver:-ok}"
}

# ---------------------------------------------------------------- Modo ayudante (lo lanza systemd como root)
worker() {
  local req="$INBOX/request" action id name rest
  mkdir -p "$OUTBOX" "$CONF_DIR"; chmod 755 "$OUTBOX"; [ -f "$INDEX" ] || : > "$INDEX"
  # La carpeta de entrada es de la app: no se sigue ningún enlace simbólico
  if [ ! -f "$req" ] || [ -L "$req" ]; then rm -f -- "$req"; return 0; fi
  read -r action id name rest < <(head -c 200 -- "$req" | head -n1) || true
  rm -f -- "$req"
  [[ "${id:-}" =~ ^[a-f0-9]{8,32}$ ]] || id=none
  name="${name:-}"
  case "$action" in
    create|delete|delete-purge|start|stop|restart)
      [[ "$name" =~ $NAME_RE ]] || { write_status "$id" false "Nombre de usuario no válido"; return 0; }
      if [ "$action" != create ] && [ -z "$(idx_of "$name")" ]; then write_status "$id" false "Ese espacio no existe"; return 0; fi ;;
  esac
  local err
  case "$action" in
    create)
      if ! err="$(precheck_create "$name" 2>&1)"; then write_status "$id" false "$err"
      elif err="$(do_create "$name" 2>&1)"; then write_status "$id" true "Espacio creado"
      else
        do_delete "$name" 1 >/dev/null 2>&1 || true   # no dejar a medias un espacio que falló
        write_status "$id" false "${err:-No se pudo crear el espacio}"
      fi ;;
    delete)       do_delete "$name" 0; write_status "$id" true "Espacio eliminado (los archivos se archivaron)" ;;
    delete-purge) do_delete "$name" 1; write_status "$id" true "Espacio y archivos eliminados" ;;
    start)        sys systemctl enable --now "$(unit_of "$name")" >/dev/null 2>&1 || true; write_status "$id" true "Espacio iniciado" ;;
    stop)         sys systemctl disable --now "$(unit_of "$name")" >/dev/null 2>&1 || true; write_status "$id" true "Espacio detenido" ;;
    restart)      sys systemctl restart "$(unit_of "$name")" >/dev/null 2>&1 || true; write_status "$id" true "Espacio reiniciado" ;;
    restart-all)
      while read -r n _; do [ -n "$n" ] && sys systemctl restart "$(unit_of "$n")" >/dev/null 2>&1 || true; done < "$INDEX" 2>/dev/null || true
      write_status "$id" true "Espacios reiniciados" ;;
    upgrade-opencode)
      if err="$(upgrade_opencode 2>&1)"; then write_status "$id" true "OpenCode actualizado: ${err:-ok}"
      else write_status "$id" false "${err:-No se pudo actualizar OpenCode}"; fi ;;
    sync) write_status "$id" true "Hecho" ;;
    *) write_status "$id" false "Acción no reconocida" ;;
  esac
}

# ---------------------------------------------------------------- Instalación única
setup() {
  id "$APP_USER" >/dev/null 2>&1 || die "No existe el usuario '$APP_USER' (¿está instalado OpenCode Cloud?)"
  [ -d "$APP_DIR" ] || die "No existe $APP_DIR"
  local app_home oc_src node_bin
  app_home="$(getent passwd "$APP_USER" | cut -d: -f6)"
  oc_src="$app_home/.opencode/bin/opencode"
  [ -x "$oc_src" ] || die "No encuentro OpenCode en $oc_src"
  node_bin="$(command -v node)" || die "Node no está instalado"

  log "Instalando el ayudante y una copia compartida de OpenCode"
  install -d -m 755 -o root -g root "$LIB_DIR"
  install -m 755 -o root -g root "$0" "$HELPER"
  install -m 755 -o root -g root "$oc_src" "$OC_SHARED"
  install -d -m 711 -o root -g root "$USERS_BASE" "$CONF_DIR" "$(dirname "$CONF_DIR")"
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$INBOX"
  install -d -m 755 -o root -g root "$OUTBOX"
  install -d -m 750 -o root -g "$APP_USER" "$KEYS"
  touch "$INDEX"; chmod 644 "$INDEX"

  log "Configurando systemd"
  cat > /etc/systemd/system/opencode-multiuser.service <<EOF
[Unit]
Description=OpenCode Cloud — gestiona los espacios de usuario pedidos desde la WebUI

[Service]
Type=oneshot
Environment=APP_USER=$APP_USER APP_DIR=$APP_DIR DATA_DIR=$DATA_DIR USERS_BASE=$USERS_BASE
ExecStart=$HELPER worker
EOF
  cat > /etc/systemd/system/opencode-multiuser.path <<EOF
[Unit]
Description=OpenCode Cloud — peticiones de usuarios

[Path]
PathExists=$INBOX/request
Unit=opencode-multiuser.service

[Install]
WantedBy=multi-user.target
EOF
  # Plantilla del espacio de cada usuario: mismo código, otro usuario de Linux y otros datos
  cat > /etc/systemd/system/opencode-cloud-user@.service <<EOF
[Unit]
Description=OpenCode Cloud — espacio de %i
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ocu-%i
Group=ocu-%i
WorkingDirectory=$APP_DIR
EnvironmentFile=$CONF_DIR/%i.env
Environment=HOME=$USERS_BASE/%i/home
Environment=PATH=$LIB_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$node_bin server/index.js
Restart=always
RestartSec=2
KillMode=control-group
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectProc=invisible
ProcSubset=pid
ProtectKernelTunables=true
ProtectControlGroups=true

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now opencode-multiuser.path >/dev/null
  write_status none true "Ayudante instalado"

  if grep -q '^MULTIUSER=' "$ENV_FILE" 2>/dev/null; then sed -i 's/^MULTIUSER=.*/MULTIUSER=1/' "$ENV_FILE"; else echo 'MULTIUSER=1' >> "$ENV_FILE"; fi
  log "Reiniciando $SERVICE en modo multiusuario"
  systemctl restart "$SERVICE"

  mkdir -p "$OUTBOX"

  echo
  log "Listo. Entra en /admin/ (usuario «admin») → Usuarios y crea el tuyo para trabajar."
  echo "  El administrador solo administra: no tiene espacio de trabajo ni proyectos."
  echo "  Los proyectos del modo anterior (de occloud) NO se mueven solos: se clonan de nuevo desde GitHub."
  if [ -f /etc/wireguard/ocegress.conf ]; then
    warn "Tienes salida por WireGuard: para que también cubra a los usuarios, ejecuta de nuevo"
    warn "  sudo $APP_DIR/deploy/egress.sh setup   y vuelve a guardar la configuración en Ajustes."
  fi
  echo "  Si actualizas la app y cambia este script, vuelve a ejecutar: sudo $0 setup"
}

disable_mode() {
  sed -i '/^MULTIUSER=/d' "$ENV_FILE" 2>/dev/null || true
  systemctl restart "$SERVICE"
  log "Modo multiusuario desactivado. Los espacios de los usuarios siguen existiendo (ver: $0 status)."
}

status() {
  [ -s "$INDEX" ] || { echo "No hay usuarios."; return 0; }
  printf '%-22s %-8s %-6s %-6s %s\n' USUARIO UID APP OC ESTADO
  while read -r n i; do
    [ -n "$n" ] || continue
    printf '%-22s %-8s %-6s %-6s %s\n' "$n" "$((UID_BASE + i))" "$((APP_PORT_BASE + i))" "$((OC_PORT_BASE + i))" "$(systemctl is-active "$(unit_of "$n")" 2>/dev/null || echo ?)"
  done < "$INDEX"
}

case "${1:-status}" in
  setup) setup ;;
  worker) worker ;;
  status) status ;;
  disable) disable_mode ;;
  upgrade-opencode) upgrade_opencode ;;
  *) die "Uso: $0 setup | status | disable | upgrade-opencode" ;;
esac
