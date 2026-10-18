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

if [ "$INTERACTIVE" = 1 ]; then
  echo
  printf '\033[1mConfiguración de OpenCode Cloud\033[0m  (Enter = valor por defecto)\n\n' >/dev/tty

  if [ "$ASK_DOMAIN" = 1 ]; then
    echo "Dominio para HTTPS automático (el DNS debe apuntar ya a este servidor y los puertos 80/443 estar abiertos)." >/dev/tty
    while :; do
      ask "Dominio (vacío = sin dominio): " DOMAIN
      DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
      [ -z "$DOMAIN" ] || [[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] && break
      echo "  Dominio no válido, prueba de nuevo." >/dev/tty
    done
  fi
  if [ -z "$DOMAIN" ] && [ "$ASK_EXPOSE" = 1 ]; then
    echo "Sin dominio el servicio solo escucha en 127.0.0.1 (acceso por túnel SSH)." >/dev/tty
    if yesno "¿Exponerlo por HTTP sin cifrar en el puerto $PORT? (no recomendado)" n; then EXPOSE_HTTP=1; fi
  fi

  if [ "$ASK_PASSWORD" = 1 ]; then
    if [ -f "$DATA_DIR/auth.json" ]; then
      if yesno "Ya existe una contraseña de administrador. ¿Cambiarla?" n; then
        while :; do
          ask "Nueva contraseña (mín. 8 caracteres): " ADMIN_PASSWORD secret
          [ "${#ADMIN_PASSWORD}" -ge 8 ] || { echo "  Demasiado corta." >/dev/tty; continue; }
          ask "Repítela: " PW2 secret
          [ "$ADMIN_PASSWORD" = "$PW2" ] && break
          echo "  No coinciden." >/dev/tty
        done
      fi
    else
      while :; do
        ask "Contraseña de administrador (vacío = generar una aleatoria): " ADMIN_PASSWORD secret
        [ -z "$ADMIN_PASSWORD" ] && break
        [ "${#ADMIN_PASSWORD}" -ge 8 ] || { echo "  Mínimo 8 caracteres." >/dev/tty; continue; }
        ask "Repítela: " PW2 secret
        [ "$ADMIN_PASSWORD" = "$PW2" ] && break
        echo "  No coinciden." >/dev/tty
      done
    fi
  fi

  if [ "$ASK_TOKEN" = 1 ]; then
    echo "Token de GitHub: necesario si el repositorio es privado; la WebUI lo usa para actualizarse y sincronizar." >/dev/tty
    echo "  No hace falta tu usuario, se detecta solo. Créalo aquí (ya con los permisos rellenados):" >/dev/tty
    echo "  https://github.com/settings/personal-access-tokens/new?name=OpenCode+Cloud&expires_in=90&contents=write&pull_requests=write" >/dev/tty
    echo "  (o uno clásico: https://github.com/settings/tokens/new?scopes=repo&description=OpenCode+Cloud)" >/dev/tty
    ask "Token (vacío = omitir; se podrá añadir luego en Ajustes): " GITHUB_TOKEN secret
  fi

  if [ "$ASK_PERMISSION" = 1 ]; then
    if yesno "¿Dejar que OpenCode edite archivos y ejecute comandos SIN pedir permiso?" n; then OC_PERMISSION=allow; fi
  fi

  echo >/dev/tty
  echo "Resumen:" >/dev/tty
  echo "  Repositorio:   $REPO_URL (rama $BRANCH)" >/dev/tty
  if [ -n "$DOMAIN" ]; then echo "  Acceso:        https://$DOMAIN (Caddy + HTTPS)" >/dev/tty
  elif [ "$EXPOSE_HTTP" = 1 ]; then echo "  Acceso:        http://IP:$PORT (sin cifrar)" >/dev/tty
  else echo "  Acceso:        solo local (túnel SSH)" >/dev/tty; fi
  echo "  Token GitHub:  $([ -n "$GITHUB_TOKEN" ] && echo sí || echo no)" >/dev/tty
  echo "  Permisos IA:   $OC_PERMISSION" >/dev/tty
  yesno "¿Continuar con la instalación?" s || die "Instalación cancelada"
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
  cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT {
		flush_interval -1
	}
}
EOF
  systemctl enable caddy >/dev/null
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
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
echo "  Siguiente:   entra, abre Ajustes y añade tu token de GitHub y la API key de tu proveedor de IA."
