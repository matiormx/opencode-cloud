# OpenCode Cloud

WebUI al estilo Claude para [OpenCode](https://opencode.ai), pensada para un VPS con Ubuntu 24.04.

- **Proyectos**: crea proyectos vacíos o clónalos desde GitHub; cada uno es una carpeta git en el servidor con sus propias conversaciones.
- **Chat con OpenCode**: respuestas en streaming, herramientas desplegables, solicitud de permisos, selector de modelo y API keys de proveedores.
- **Destacadas y recientes**: encima de los proyectos salen tus conversaciones destacadas (★) y las 5 más recientes de todos los proyectos; desde ⋯ se cambia el título, se destaca o se elimina.
- **Recursos del VPS y peticiones**: en el menú lateral, minigráficos de CPU y RAM y una línea con el estado de OpenCode (inactivo, trabajando, esperando al proveedor o esperando tu permiso). Al pulsarlo se abre el detalle de la última hora: peticiones al modelo por minuto, reintentos y errores (por ejemplo, un límite de peticiones del proveedor), CPU, memoria, red, disco y carga. Si una conversación espera al proveedor, aparece un aviso sobre el cuadro de texto con el motivo y cuándo reintenta.
- **Cola de mensajes**: si OpenCode está trabajando, lo que escribas espera en una cola y se envía solo cuando termine, en orden y con el modelo elegido. Vive en el servidor, así que sigue aunque cierres la app.
- **Git y GitHub**: fetch, pull (fusión), push, commit, ramas, fusionar ramas, resolución de conflictos asistida por OpenCode, y crear/fusionar Pull Requests.
- **PWA mobile-first**: se instala como aplicación en móvil, tablet y escritorio, con cajón lateral, hojas inferiores y soporte de teclado en pantalla.
- **Autoactualización**: la WebUI compara tu instalación con la rama de GitHub y actualiza con un clic (con vuelta atrás a la versión anterior).

```
Navegador ──HTTPS──▶ Caddy ──▶ opencode-cloud (Node, :3000) ──▶ opencode serve (127.0.0.1:4096)
                                   │                                  └─ trabaja en /var/lib/opencode-cloud/projects/<proyecto>
                                   └─ git / GitHub API
```

OpenCode solo escucha en `127.0.0.1` y con contraseña interna aleatoria; lo único expuesto es esta aplicación, protegida por contraseña.

## 1. Subir este proyecto a GitHub

Desde la carpeta del proyecto, en tu equipo:

```bash
git add -A && git commit -m "OpenCode Cloud"
# con GitHub CLI:
gh repo create opencode-cloud --private --source=. --push
# o creando el repo vacío en github.com y luego:
git remote add origin https://github.com/TU_USUARIO/opencode-cloud.git
git push -u origin main
```

> Un repositorio **privado** es lo recomendable. Para que el VPS pueda clonarlo y actualizarse necesitará un token (ver abajo).

## 2. Instalar en el VPS

Conéctate por SSH al VPS (Ubuntu 24.04) y ejecuta:

```bash
git clone https://github.com/TU_USUARIO/opencode-cloud.git
cd opencode-cloud
sudo DOMAIN=cloud.midominio.com ./deploy/install.sh
```

El instalador:

1. instala Node.js 22, git, ripgrep y dependencias de compilación;
2. crea el usuario de sistema `occloud` e instala OpenCode para ese usuario;
3. clona el repositorio en `/opt/opencode-cloud` e instala dependencias;
4. guarda datos en `/var/lib/opencode-cloud` y genera una contraseña de administrador (se muestra una sola vez);
5. crea el servicio `opencode-cloud` en systemd (arranca solo y se reinicia si cae);
6. con `DOMAIN`, instala Caddy con HTTPS automático (el DNS debe apuntar ya al VPS y los puertos 80/443 estar abiertos).

Variables opcionales (se pasan delante del comando):

| Variable | Para qué |
|---|---|
| `DOMAIN=cloud.midominio.com` | HTTPS con Caddy. **Recomendado.** |
| `GITHUB_TOKEN=...` | Clonar un repo privado; además se guarda para que la WebUI pueda actualizarse |
| `ADMIN_PASSWORD=...` | Contraseña inicial (si no, se genera una) |
| `REPO_URL=...` | Repo del que instalar (por defecto, el `origin` del clon desde el que lanzas el script) |
| `BRANCH=main` | Rama que sigue el actualizador |
| `OC_PERMISSION=allow` | OpenCode edita y ejecuta comandos sin pedir permiso (por defecto `ask`) |
| `EXPOSE_HTTP=1` | Sin dominio: escucha en `0.0.0.0` por HTTP **sin cifrar** |
| `APP_USER`, `APP_DIR`, `DATA_DIR`, `PORT` | Rutas y puerto |

**Sin dominio** el servicio escucha solo en `127.0.0.1`. Accede con un túnel SSH:

```bash
ssh -L 3000:127.0.0.1:3000 usuario@IP_DEL_VPS     # y abre http://localhost:3000
```

El instalador se puede volver a ejecutar sin riesgo: actualiza el código, conserva datos y contraseña.

## 3. Primer uso

1. Entra con la contraseña que mostró el instalador.
2. **Ajustes → GitHub**: pega un token. La propia pantalla trae el enlace para crearlo ya con los permisos rellenados (no hace falta escribir tu usuario: se detecta solo). Enlaces directos: [fine-grained](https://github.com/settings/personal-access-tokens/new?name=OpenCode+Cloud&expires_in=90&contents=write&pull_requests=write) · [clásico](https://github.com/settings/tokens/new?scopes=repo&description=OpenCode+Cloud) · [gestionar mis tokens](https://github.com/settings/tokens).
   - *Fine-grained*: acceso a los repos que vayas a usar, con permisos **Contents: lectura y escritura** y **Pull requests: lectura y escritura**.
   - *Clásico*: scope `repo`.
3. **Ajustes → Proveedores de IA**: añade la API key de tu proveedor (Anthropic, OpenAI, OpenRouter, …). Los modelos aparecen en el selector del chat.
4. **Nuevo proyecto → Clonar desde GitHub**, elige un repositorio, y empieza a pedirle cosas a OpenCode.

### Cola de mensajes

Mientras OpenCode trabaja, el botón de enviar pasa a **Añadir a la cola** en cuanto escribes algo (y vuelve a ser **Detener** con el campo vacío). Los mensajes en espera aparecen encima del cuadro de texto: quita uno con la ✕ o usa **Vaciar**. Al pulsar **Detener** la cola se pone **en pausa** para que no arranque sola otra tarea; usa **Reanudar** para continuar. Máximo 20 mensajes por conversación.

### Sincronizar con GitHub

Panel **Git** (botón arriba a la derecha del proyecto):

- **Fetch / Pull / Push** contra `origin`. Pull fusiona (`--no-rebase`).
- **Fusionar rama**: elige una rama y fusiónala en la actual. Si hay conflictos, el panel los lista y puedes **pedir a OpenCode que los resuelva** o abortar la fusión. Revisas y haces commit tú.
- **Commit** de todos los cambios (también por OpenCode) y **Commit y push**.
- **Pull Requests**: crear uno desde la rama actual, o listar los abiertos y fusionarlos en GitHub (merge o squash). Después, haz Pull para traer el resultado.

## 4. Instalar como aplicación (PWA)

La interfaz es *mobile-first* y se puede instalar para abrirla a pantalla completa:

- **Android / Chrome, Edge (escritorio)**: aparece el botón **Instalar aplicación** en la barra lateral y en Ajustes (o en el menú del navegador).
- **iPhone / iPad (Safari)**: *Compartir → Añadir a pantalla de inicio*.

Requisitos y detalles:

- Hace falta **HTTPS** (o `localhost`). Con `DOMAIN=` el instalador lo deja listo; por HTTP plano con IP los navegadores no ofrecen instalar.
- Tras instalar, la app abre al instante y muestra un aviso si no hay conexión. Las respuestas de la API (proyectos, mensajes) **nunca se guardan en caché**: sin red, el chat no funciona.
- El *service worker* usa estrategia «red primero», así que una actualización desde GitHub se ve en la siguiente apertura sin vaciar cachés.
- En móvil: desliza desde el borde izquierdo para abrir el menú, y el botón Git abre una hoja inferior.

## 5. Actualizar la aplicación desde GitHub

Sube cambios a la rama `main` de tu repo. En la WebUI aparecerá un aviso **«Actualización disponible»** (se consulta cada 6 h y al abrir Ajustes). En **Ajustes → Actualizaciones**:

- **Actualizar ahora**: hace `git merge --ff-only`, ejecuta `npm ci` si cambiaron las dependencias y reinicia el servicio (la página se recarga sola).
- **Volver a la versión anterior**: restaura el commit previo a la última actualización.
- Se bloquea si hay cambios locales sin confirmar en `/opt/opencode-cloud`, y si `npm ci` falla se revierte automáticamente.

Si OpenCode está trabajando en alguna conversación, la app te avisa antes de actualizar o reiniciar, porque esa tarea se interrumpiría (los mensajes en cola sí se envían después).

También puedes **actualizar OpenCode** (`opencode upgrade`) o reiniciarlo desde Ajustes.

## Salir a internet por tu casa (WireGuard, opcional)

Si el proveedor de los modelos gratuitos bloquea la IP de tu VPS, puedes sacar **solo el tráfico de OpenCode** por un servidor WireGuard propio (por ejemplo, en casa). SSH, Caddy, `apt` y las respuestas a la WebUI siguen usando la IP normal del VPS.

1. **Una sola vez, por SSH**, instala el ayudante: `sudo /opt/opencode-cloud/deploy/egress.sh setup`
2. En tu servidor de casa crea un cliente nuevo y copia el contenido de su `.conf`.
3. En la WebUI: **Ajustes → Salida a internet (WireGuard)**: pega el contenido (o pulsa «Cargar archivo…») y **Guardar y activar**. Ahí mismo puedes desactivarlo, reactivarlo o quitarlo, y ves la IP con la que sale OpenCode.

Requisitos del lado de casa: `AllowedIPs` del cliente debe incluir `0.0.0.0/0`, el servidor debe reenviar paquetes (`net.ipv4.ip_forward=1`) y hacer NAT hacia internet (`MASQUERADE`), y el puerto UDP debe estar abierto en el router.

Cómo funciona y por qué es seguro: la WebUI no es root. Deja la petición en una carpeta suya y una unidad systemd de root (`opencode-egress.path`) la procesa con una copia del script instalada en `/usr/local/lib/opencode-cloud` (de root, la app no puede modificarla). El `.conf` se **reconstruye** solo con las claves permitidas (`PrivateKey`, `Address`, `PublicKey`, `PresharedKey`, `Endpoint`, `AllowedIPs`, `PersistentKeepalive`) y con valores validados; `PostUp`, `PreUp`, `Table`, `DNS`… se descartan, así que un fichero malicioso no puede ejecutar comandos. El túnel solo enruta el usuario del servicio (`ip rule uidrange`). Si cae, OpenCode vuelve a salir por la IP del VPS en lugar de quedarse sin conexión. La clave privada se guarda en `/etc/wireguard` (solo root) y no vuelve a mostrarse.

Si actualizas la aplicación y `deploy/egress.sh` cambia, vuelve a ejecutar `sudo /opt/opencode-cloud/deploy/egress.sh setup` para actualizar el ayudante. Desde la versión 0.8.4 el ayudante incluye un **vigilante** (temporizador de systemd, cada minuto) que reinicia el túnel si se cae —por ejemplo si el DNS no respondía al arrancar o cambió la IP de tu casa— y vuelve a resolver el Endpoint. La WebUI muestra la configuración guardada (servidor y dirección, nunca la clave), el último handshake y un botón **Reconectar**. Ojo: mientras el túnel esté caído, OpenCode no tiene salida a internet (no hay vuelta automática a la IP del VPS); desactívalo desde Ajustes si quieres volver a salir directo. También se puede usar sin WebUI: `egress.sh install cliente.conf | on | off | status | remove`.

## Seguridad: léelo antes de exponerlo

Esta aplicación da a un agente de IA acceso a una shell del servidor. Trátala como si fuera una terminal remota.

- **Usa HTTPS** (`DOMAIN=`). Con HTTP plano, la contraseña y las sesiones viajan sin cifrar.
- El agente se ejecuta con los permisos del usuario `occloud` y **puede leer sus archivos**, incluido `/var/lib/opencode-cloud/settings.json` (token de GitHub) y las claves de proveedores. Por eso:
  - usa un token de GitHub *fine-grained* limitado a los repos necesarios;
  - mantén `OC_PERMISSION=ask` salvo que aceptes ese riesgo, y no pegues credenciales en el chat.
- No ejecutes nada más sensible en el mismo VPS. Un VPS dedicado es lo ideal.
- Login con límite de intentos, cookie `HttpOnly`/`SameSite=Strict`/`Secure` (con dominio) y cabecera anti-CSRF. Es un único usuario administrador.
- El token de GitHub solo se envía a hosts de `GIT_ALLOWED_HOSTS` (por defecto `github.com`) y nunca queda en `.git/config`.
- Cambia la contraseña en **Ajustes → Seguridad**, o desde el servidor:
  `sudo -u occloud DATA_DIR=/var/lib/opencode-cloud node /opt/opencode-cloud/bin/set-password.js 'nueva'`

## Operación

```bash
systemctl status opencode-cloud        # estado
journalctl -u opencode-cloud -f        # registros
sudo systemctl restart opencode-cloud
sudo nano /etc/opencode-cloud.env      # configuración (luego reiniciar)
```

Copia de seguridad: basta con `/var/lib/opencode-cloud` (proyectos, ajustes, contraseña). OpenCode guarda sus conversaciones y credenciales en `~occloud/.local/share/opencode`.

## Desarrollo local

```bash
npm install
npm run set-password -- "mi-contraseña"
npm start            # http://127.0.0.1:3000, datos en ./data
```

Requiere `opencode` en el PATH (o `OPENCODE_BIN=/ruta/a/opencode`) y Node ≥ 20.11.

## Varios usuarios (opcional)

Puedes dar acceso a más personas, cada una con **su propio espacio aislado**: su usuario de Linux, su OpenCode, sus proyectos, sus claves de API y su token de GitHub. Un usuario no puede leer los archivos, claves ni procesos de otro.

1. **Una sola vez, por SSH:** `sudo /opt/opencode-cloud/deploy/multiuser.sh setup`. Tu cuenta sigue funcionando igual: usuario `admin` y tu contraseña de siempre, con tus proyectos de siempre.
2. En la WebUI: **Ajustes → Usuarios**: crea usuarios (nombre y contraseña, o «Generar contraseña»), cambia contraseñas, desactívalos, reinicia su espacio o elimínalos (archivando o borrando sus archivos). Solo el administrador crea usuarios; no hay registro libre.
3. Los usuarios entran con su usuario y contraseña. Cada uno gestiona sus propias claves y su token de GitHub; las actualizaciones de la app, la salida WireGuard y la actualización de OpenCode las gestiona el administrador.

Cómo funciona: la app que ya tienes pasa a ser la **pasarela** (login, usuarios y proxy). Cada usuario ejecuta su propia copia de la app y de OpenCode como servicio systemd (`opencode-cloud-user@<usuario>`) con su usuario de Linux (`ocu-<usuario>`, uid 61000+), sus datos en `/var/lib/opencode-users/<usuario>` (modo 700) y un servidor que solo acepta peticiones de la pasarela (secreto propio, en `/etc/opencode-cloud/instances`, solo legible por ese usuario). Los servicios se endurecen con `ProtectHome`, `ProtectProc=invisible` y `PrivateTmp`. Como en el modo de un solo usuario, el administrador es de confianza: su OpenCode corre con el usuario del servicio, que **no** puede leer las carpetas de los demás usuarios (esas son de cada `ocu-<usuario>`).

Detalles:
- **Seguridad:** la WebUI no es root. Pide crear/borrar usuarios a un ayudante de root (`opencode-multiuser.path`) que valida el nombre con una lista cerrada y usa una copia del script en `/usr/local/lib/opencode-cloud` que la app no puede modificar.
- **Permisos de OpenCode de cada usuario:** por defecto piden permiso (`OC_PERMISSION=ask`). Se puede cambiar en `/etc/opencode-cloud/instances/<usuario>.env` y reiniciando su espacio.
- **Memoria:** cada espacio ejecuta su propia app y su OpenCode (del orden de 150-300 MB por usuario activo).
- **Actualizaciones:** al actualizar desde la WebUI, todos los espacios se reinician con la versión nueva. Si cambia `deploy/multiuser.sh`, vuelve a ejecutar `setup` (la WebUI avisa).
- **WireGuard:** el rango de uids de los usuarios también sale por el túnel; si ya lo tenías configurado, vuelve a ejecutar `egress.sh setup` y guarda la configuración otra vez.
- **Volver atrás:** `sudo deploy/multiuser.sh disable` desactiva el modo (los espacios y sus datos se conservan); `multiuser.sh status` los lista.

## Comprobar la instalación

`sudo /opt/opencode-cloud/deploy/doctor.sh` revisa (sin cambiar nada) el sistema, el servicio, la WebUI, OpenCode, Caddy, WireGuard, los permisos de archivos y los cambios locales, y te dice qué corregir. Si la WebUI no arranca: `journalctl -u opencode-cloud -n 60 --no-pager`.

## Problemas frecuentes

- **«OpenCode no responde»**: Ajustes → OpenCode → *Ver registro*. Comprueba que existe `~occloud/.opencode/bin/opencode`.
- **No salen modelos**: añade una API key en Ajustes y pulsa *Reiniciar OpenCode*.
- **Clonar un repo privado falla**: revisa el token y sus permisos; la URL debe ser `https://github.com/...` (no SSH).
- **El botón de actualizar está bloqueado**: hay cambios locales en `/opt/opencode-cloud` (`sudo -u occloud git -C /opt/opencode-cloud status`).
- **Caddy no obtiene el certificado**: el DNS del dominio debe apuntar al VPS y los puertos 80 y 443 deben estar abiertos.

## Estructura

```
server/   backend Express (auth, proyectos, git, GitHub, proxy a OpenCode, actualizador)
public/   WebUI sin build (HTML + JS + CSS)
bin/      set-password.js, git-askpass.sh
deploy/   install.sh, doctor.sh (diagnóstico), egress.sh (túnel WireGuard opcional), multiuser.sh (varios usuarios opcional)
```
