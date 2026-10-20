#!/usr/bin/env bash
# OpenCode Cloud — instalador para Ubuntu 24.04 (también válido en 22.04 / Debian 12).
#
# Uso básico (como root, desde un clon del repositorio):
#   sudo ./deploy/install.sh
#
# Variables opcionales:
#   REPO_URL=https://github.com/usuario/opencode-cloud.git   repo del que instalar/actualizar (por defecto: el origin del clon actual)
#   BRANCH=main            rama que sigue el actualizador
#   DOMAIN=cloud.midominio.com   instala Caddy y publica con HTTPS automático (el DNS debe apuntar ya al VPS)
#   EXPOSE_HTTP=1          sin dominio: escucha en 0.0.0.0 por HTTP (inseguro salvo red privada)
#   ADMIN_PASSWORD=...     contraseña inicial (si no se indica, se genera una)
#   GITHUB_TOKEN=...       token para clonar un repo privado; también se guarda para que la WebUI pueda actualizar
#   OC_PERMISSION=ask|allow   'allow' deja que el agente edite y ejecute sin pedir permiso (por defecto: ask)
#   APP_USER=occloud  APP_DIR=/opt/opencode-cloud  DATA_DIR=/var/lib/opencode-cloud  PORT=3000
set -euo pipefail

# Variables que el usuario no ha definido: se preguntarán si hay terminal interactiva
[ -z "${DOMAIN+x}" ] && ASK_DOMAIN=1 || ASK_DOMAIN=0
[ -z "${EXPOSE_HTTP+x}" ] && ASK_EXPOSE=1 || ASK_EXPOSE=0
[ -z "${GITHUB_TOKEN+x}" ] && ASK_TOKEN=1 || ASK_TOKEN=0
[ -z "${ADMIN_PASSWORD+x}" ] && ASK_PASSWORD=1 || ASK_PASSWORD=0
[ -z "${OC_PERMISSION+x}" ] && ASK_PERMISSION=1 || ASK_PERMISSION=0

APP_USER="${APP_USER:-occloud}"
APP_DIR="${APP_DIR:-/opt/opencode-cloud}"
DATA_DIR="${DATA_DIR:-/var/lib/opencode-cloud}"
PORT="${PORT:-3000}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-}"
EXPOSE_HTTP="${EXPOSE_HTTP:-0}"
OC_PERMISSION="${OC_PERMISSION:-ask}"
REPO_URL="${REPO_URL:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SERVICE=opencode-cloud

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[aviso]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Ejecuta este script como root (sudo ./deploy/install.sh)"
command -v apt-get >/dev/null || die "Este instalador requiere un sistema basado en apt (Ubuntu/Debian)"
if [ -r /etc/os-release ]; then . /etc/os-release; [ "${ID:-}" = ubuntu ] || warn "Probado en Ubuntu 24.04; detectado: ${PRETTY_NAME:-desconocido}"; fi
[[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || die "APP_USER no válido"
[[ "$PORT" =~ ^[0-9]+$ ]] || die "PORT no válido"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Si no se indica REPO_URL, se toma el origin del clon desde el que se ejecuta el script
if [ -z "$REPO_URL" ] && git -C "$SRC_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  REPO_URL="$(git -C "$SRC_DIR" remote get-url origin 2>/dev/null || true)"
fi
[ -n "$REPO_URL" ] || die "No se pudo determinar el repositorio. Indica REPO_URL=https://github.com/usuario/opencode-cloud.git"
case "$REPO_URL" in *@*) warn "REPO_URL parece contener credenciales; no las incluyas en la URL (usa GITHUB_TOKEN)";; esac

# ---------------------------------------------------------------- Preguntas interactivas
# Funciona también con `curl ... | sudo bash` porque lee de /dev/tty.
# Para saltarlas: NONINTERACTIVE=1 (o pasar las variables por entorno).
INTERACTIVE=0
if [ "${NONINTERACTIVE:-0}" != 1 ] && ( exec </dev/tty ) 2>/dev/null; then INTERACTIVE=1; fi

ask() { # ask "texto" VAR [secret]
  local prompt="$1" var="$2" secret="${3:-}" reply=""
  if [ "$secret" = secret ]; then
    read -r -s -p "$prompt" reply </dev/tty >/dev/tty; echo >/dev/tty
  else
    read -r -p "$prompt" reply </dev/tty >/dev/tty
  fi
  printf -v "$var" '%s' "$reply"
}
yesno() { # yesno "texto" defecto(s|n) -> 0 si sí
  local def="$2" hint reply
  [ "$def" = s ] && hint="[S/n]" || hint="[s/N]"
  read -r -p "$1 $hint " reply </dev/tty >/dev/tty
  reply="${reply:-$def}"
  case "$reply" in s|S|si|SI|Si|sí|y|Y|yes) return 0;; *) return 1;; esac
}

# Reutiliza el token ya guardado en una instalación anterior (para repos privados al reinstalar)
if [ -z "$GITHUB_TOKEN" ] && [ -f "$DATA_DIR/settings.json" ]; then
  GITHUB_TOKEN="$(sed -n 's/.*"githubToken": *"\([^"]*\)".*/\1/p' "$DATA_DIR/settings.json" | head -n1)"
  [ -n "$GITHUB_TOKEN" ] && ASK_TOKEN=0
fi

# El repositorio público no necesita token: no se pregunta
if [ "$ASK_TOKEN" = 1 ] && GIT_TERMINAL_PROMPT=0 timeout 15 git -c credential.helper= ls-remote "$REPO_URL" HEAD >/dev/null 2>&1; then ASK_TOKEN=0; fi

if [ "$INTERACTIVE" = 1 ]; then
  T() { printf '%b\n' "$*" >/dev/tty; }                      # línea normal
  N() { printf '  \033[2m%s\033[0m\n' "$*" >/dev/tty; }       # nota atenuada
  STEP=0
  step() { STEP=$((STEP + 1)); T "\n\033[1;36m▌ Paso $STEP · $*\033[0m"; }

  T "\n\033[1mOpenCode Cloud · instalación\033[0m"
  N "Te hago unas preguntas cortas."
  N "Pulsa Enter para aceptar lo recomendado."

  if [ "$ASK_DOMAIN" = 1 ]; then
    step "Dirección web"
    N "Con un dominio tendrás HTTPS automático."
    N "Su DNS debe apuntar ya a este servidor."
    while :; do
      ask "  Dominio (Enter = sin dominio): " DOMAIN
      DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
      [ -z "$DOMAIN" ] || [[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] && break
      T "  \033[31mDominio no válido.\033[0m Prueba de nuevo."
    done
  fi
  if [ -z "$DOMAIN" ] && [ "$ASK_EXPOSE" = 1 ]; then
    step "Acceso sin dominio"
    N "Solo escucha en este servidor (túnel SSH)."
    if yesno "  ¿Abrirlo por HTTP sin cifrar? (no recomendado)" n; then EXPOSE_HTTP=1; fi
  fi

  if [ "$ASK_PASSWORD" = 1 ]; then
    step "Contraseña del administrador"
    N "Con ella entrarás como «admin»."
    N "No se ve lo que escribes."
    if [ -f "$DATA_DIR/auth.json" ]; then
      if yesno "  Ya hay una contraseña. ¿Cambiarla?" n; then
        while :; do
          ask "  Nueva (mín. 8 caracteres): " ADMIN_PASSWORD secret
          [ "${#ADMIN_PASSWORD}" -ge 8 ] || { T "  \033[31mDemasiado corta.\033[0m"; continue; }
          ask "  Repítela: " PW2 secret
          [ "$ADMIN_PASSWORD" = "$PW2" ] && break
          T "  \033[31mNo coinciden.\033[0m"
        done
      fi
    else
      N "Enter = que la genere yo (te la muestro al final)."
      while :; do
        ask "  Contraseña (mín. 8, o Enter): " ADMIN_PASSWORD secret
        [ -z "$ADMIN_PASSWORD" ] && break
        [ "${#ADMIN_PASSWORD}" -ge 8 ] || { T "  \033[31mMínimo 8 caracteres.\033[0m"; continue; }
        ask "  Repítela: " PW2 secret
        [ "$ADMIN_PASSWORD" = "$PW2" ] && break
        T "  \033[31mNo coinciden.\033[0m"
      done
    fi
  fi

  if [ "$ASK_PERMISSION" = 1 ]; then
    step "Permisos del agente"
    N "Qué hace OpenCode al editar archivos"
    N "o ejecutar comandos:"
    T "    \033[1m1\033[0m  Pedirme permiso cada vez  \033[2m(recomendado)\033[0m"
    T "    \033[1m2\033[0m  Hacerlo sin preguntar"
    while :; do
      ask "  Elige 1 o 2 [1]: " PERM_CHOICE
      case "${PERM_CHOICE:-1}" in 1) OC_PERMISSION=ask; break;; 2) OC_PERMISSION=allow; break;; esac
      T "  \033[31mEscribe 1 o 2.\033[0m"
    done
  fi

  if [ "$ASK_TOKEN" = 1 ]; then
    step "Acceso a GitHub"
    N "El repositorio es privado: hace falta un"
    N "token para descargarlo y actualizarlo."
    N "Créalo con la casilla «repo» en:"
    N "github.com/settings/tokens"
    ask "  Token (Enter = omitir): " GITHUB_TOKEN secret
  fi

  T "\n\033[1;36m▌ Resumen\033[0m"
  if [ -n "$DOMAIN" ]; then T "  Dirección    https://$DOMAIN"
  elif [ "$EXPOSE_HTTP" = 1 ]; then T "  Dirección    http://IP:$PORT (sin cifrar)"
  else T "  Dirección    solo local (túnel SSH)"; fi
  T "  Contraseña   $([ -n "$ADMIN_PASSWORD" ] && echo 'la que has puesto' || ([ -f "$DATA_DIR/auth.json" ] && echo 'la que ya había' || echo 'se generará una'))"
  T "  Agente       $([ "$OC_PERMISSION" = allow ] && echo 'sin pedir permiso' || echo 'pide permiso')"
  T "  Repositorio  ${REPO_URL#https://github.com/}"
  echo >/dev/tty
  yesno "  ¿Instalar ahora?" s || die "Instalación cancelada"
  echo >/dev/tty
fi

# ---------------------------------------------------------------- Paquetes
log "Instalando paquetes del sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl git gnupg unzip openssl ripgrep build-essential

NODE_MAJOR=0
command -v node >/dev/null && NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  log "Instalando Node.js 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
log "Node $(node -v) · npm $(npm -v)"

# ---------------------------------------------------------------- Usuario
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Creando usuario de servicio '$APP_USER'"
  useradd --system --create-home --home-dir "/home/$APP_USER" --shell /bin/bash "$APP_USER"
fi
APP_HOME="$(getent passwd "$APP_USER" | cut -d: -f6)"
as_app() { runuser -u "$APP_USER" -- env HOME="$APP_HOME" "$@"; }

# ---------------------------------------------------------------- OpenCode
if [ ! -x "$APP_HOME/.opencode/bin/opencode" ]; then
  log "Instalando OpenCode para el usuario '$APP_USER'"
  as_app bash -c 'curl -fsSL https://opencode.ai/install | bash'
else
  log "OpenCode ya está instalado ($("$APP_HOME/.opencode/bin/opencode" --version 2>/dev/null || echo '?'))"
fi
[ -x "$APP_HOME/.opencode/bin/opencode" ] || die "OpenCode no se instaló correctamente en $APP_HOME/.opencode/bin"

# ---------------------------------------------------------------- Aplicación
# Credenciales para clonar repos privados sin dejarlas en la URL ni en .git/config
ASKPASS=""
cleanup() { [ -n "$ASKPASS" ] && rm -f "$ASKPASS"; return 0; }
trap cleanup EXIT
if [ -n "$GITHUB_TOKEN" ]; then
  ASKPASS="$(mktemp)"
  printf '#!/bin/sh\ncase "$1" in Username*) echo x-access-token;; *) echo "$GIT_TOKEN";; esac\n' > "$ASKPASS"
  chmod 755 "$ASKPASS"
fi
git_app() {
  if [ -n "$ASKPASS" ]; then
    as_app env GIT_ASKPASS="$ASKPASS" GIT_TOKEN="$GITHUB_TOKEN" GIT_TERMINAL_PROMPT=0 git -c credential.helper= "$@"
  else
    as_app env GIT_TERMINAL_PROMPT=0 git "$@"
  fi
}

if [ -d "$APP_DIR/.git" ]; then
  log "Actualizando código en $APP_DIR"
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
  git_app -C "$APP_DIR" fetch origin "$BRANCH"
  git_app -C "$APP_DIR" checkout "$BRANCH"
  git_app -C "$APP_DIR" merge --ff-only "origin/$BRANCH"
else
  log "Clonando $REPO_URL en $APP_DIR"
  [ -e "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ] && die "$APP_DIR existe y no está vacío"
  mkdir -p "$APP_DIR"
  chown "$APP_USER":"$APP_USER" "$APP_DIR"
  git_app clone --branch "$BRANCH" -- "$REPO_URL" "$APP_DIR"
fi

log "Instalando dependencias de Node"
as_app bash -c "cd '$APP_DIR' && if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi"

# ---------------------------------------------------------------- Datos y configuración
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$DATA_DIR"
install -d -o "$APP_USER" -g "$APP_USER" "$DATA_DIR/projects"

if [ -n "$GITHUB_TOKEN" ] && [ ! -f "$DATA_DIR/settings.json" ]; then
  log "Guardando el token de GitHub para la WebUI"
  as_app env DATA_DIR="$DATA_DIR" GH="$GITHUB_TOKEN" node --input-type=module -e \
    "import('$APP_DIR/server/store.js').then(s=>s.updateSettings({githubToken:process.env.GH}))"
fi

HOST=127.0.0.1
[ "$EXPOSE_HTTP" = "1" ] && HOST=0.0.0.0
SECURE=0
[ -n "$DOMAIN" ] && SECURE=1

ENV_FILE="/etc/$SERVICE.env"
cat > "$ENV_FILE" <<EOF
HOST=$HOST
PORT=$PORT
DATA_DIR=$DATA_DIR
SECURE_COOKIES=$SECURE
UPDATE_BRANCH=$BRANCH
OC_PERMISSION=$OC_PERMISSION
EOF
chown root:"$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

GENERATED=0
if [ ! -f "$DATA_DIR/auth.json" ] || [ -n "$ADMIN_PASSWORD" ]; then
  if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-20)"
    GENERATED=1
  fi
  printf '%s' "$ADMIN_PASSWORD" | as_app env DATA_DIR="$DATA_DIR" node "$APP_DIR/bin/set-password.js" --stdin >/dev/null
fi

# ---------------------------------------------------------------- systemd
log "Configurando el servicio systemd"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=OpenCode Cloud (WebUI + OpenCode)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
Environment=HOME=$APP_HOME
Environment=PATH=$APP_HOME/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$(command -v node) server/index.js
# Con Restart=always, la actualización desde la WebUI solo tiene que terminar el proceso para reiniciarse
Restart=always
RestartSec=2
KillMode=control-group
TimeoutStopSec=15
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"

# Aislamiento: la app (pasarela) solo gestiona usuarios; el agente y los proyectos corren siempre en el espacio de un usuario
# (ocu-<nombre>), también el del administrador. Sin esto, el agente tendría los mismos permisos que la WebUI.
log "Configurando el aislamiento de usuarios"
APP_USER="$APP_USER" APP_DIR="$APP_DIR" DATA_DIR="$DATA_DIR" bash "$APP_DIR/deploy/multiuser.sh" setup

# Ayudante de Chromium (Playwright): solo prepara el servicio; Chromium se instala después con un botón en el panel de
# administración (/admin/ → OpenCode → Navegador). Es opcional: si falla, la instalación sigue.
log "Preparando el ayudante de Chromium (opcional)"
APP_USER="$APP_USER" DATA_DIR="$DATA_DIR" bash "$APP_DIR/deploy/browser.sh" setup || warn "No se pudo preparar el ayudante de Chromium; puedes hacerlo luego: sudo $APP_DIR/deploy/browser.sh setup"

# ---------------------------------------------------------------- HTTPS con Caddy (opcional)
if [ -n "$DOMAIN" ]; then
  [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "DOMAIN no válido"
  if ! command -v caddy >/dev/null; then
    log "Instalando Caddy"
    apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy
  fi
  log "Configurando Caddy para $DOMAIN"
  # admin off: sin la API de administración de Caddy (localhost:2019), que cualquier proceso local podría usar para
  # cambiar a dónde se envía el tráfico. Los cambios de configuración se aplican con 'systemctl restart caddy'.
  cat > /etc/caddy/Caddyfile <<EOF
{
	admin off
}

$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT {
		flush_interval -1
	}
}
EOF
  systemctl enable caddy >/dev/null
  systemctl restart caddy   # con «admin off» no hay API de recarga: se reinicia
  if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
    log "Reglas de ufw para 80/443 añadidas"
  fi
fi

# ---------------------------------------------------------------- Comprobación
log "Esperando a que el servicio responda"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
[ "$ok" = 1 ] || { journalctl -u "$SERVICE" -n 40 --no-pager || true; die "El servicio no arrancó. Revisa: journalctl -u $SERVICE -e"; }

IP="$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
echo
printf '\033[1;32m✔ OpenCode Cloud instalado\033[0m\n\n'
if [ -n "$DOMAIN" ]; then
  echo "  URL:         https://$DOMAIN"
elif [ "$EXPOSE_HTTP" = "1" ]; then
  echo "  URL:         http://$IP:$PORT   (HTTP sin cifrar: úsalo solo en una red de confianza)"
else
  echo "  Acceso:      escucha solo en 127.0.0.1. Desde tu equipo:"
  echo "               ssh -L $PORT:127.0.0.1:$PORT usuario@$IP   y abre http://localhost:$PORT"
  echo "               (o reinstala con DOMAIN=tu.dominio para HTTPS automático)"
fi
if [ "$GENERATED" = 1 ]; then
  echo "  Contraseña:  $ADMIN_PASSWORD     <- guárdala ahora; no se vuelve a mostrar"
else
  echo "  Contraseña:  la que ya tenías configurada (cámbiala con: sudo -u $APP_USER DATA_DIR=$DATA_DIR node $APP_DIR/bin/set-password.js 'nueva')"
fi
echo "  Servicio:    systemctl status $SERVICE   ·   journalctl -u $SERVICE -f"
echo "  Rutas:       «admin» entra en /admin/ y solo administra; crea ahí tu usuario para trabajar (entra por la raíz)."
echo "  Siguiente:   en /admin/ → Usuarios crea tu usuario; con él entra, abre Ajustes y añade tu token de GitHub y la API key."
