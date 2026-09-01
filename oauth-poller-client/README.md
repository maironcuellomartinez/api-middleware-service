# oauth-poller-client

Cliente OAuth2 (`client_credentials`) standalone que se autentica contra
`api-middleware-service` y consulta `GET /v1/requests` cada cierto intervalo
(default 5 minutos), dejando un log de cada petición para diagnosticar
fallas sin depender de tener la terminal abierta.

No persiste el objeto de negocio que devuelve la API — solo registra
metadata de cada intento (éxito/error, duración, status, mensaje).

Es un proyecto standalone (su propio `package.json`), pensado para vivir
fuera de `api-middleware-service` — se puede copiar/mover esta carpeta a
cualquier lugar y funciona con solo `npm install` ahí adentro.

---

## Requisitos previos

- Node.js >= 18
- Un client OAuth2 dado de alta en `api-middleware-service` (`client_id` con
  prefijo `mc_` + `client_secret`), emitido vía el módulo de administración
  (`/clients`)

---

## Instalación

```bash
cd oauth-poller-client
npm install
```

---

## Configuración

Copiar la plantilla y completar credenciales:

```bash
cp .env.example .env
```

Variables (`.env`):

| Variable               | Descripción                                              | Default            |
|------------------------|-----------------------------------------------------------|---------------------|
| `MW_BASE_URL`           | URL base de `api-middleware-service`                      | *(requerida)*        |
| `MW_CLIENT_ID`          | `client_id` del cliente OAuth2 (empieza con `mc_`)         | *(requerida)*        |
| `MW_CLIENT_SECRET`      | `client_secret` del cliente OAuth2                         | *(requerida)*        |
| `MW_SCOPE`              | Scope(s) a solicitar, separados por espacio                | *(sin scope)*         |
| `MW_POLL_INTERVAL_MS`   | Cada cuanto se corre el ciclo, en milisegundos               | `300000` (5 min)     |
| `MW_LOOKBACK_DAYS`      | Cuantos días hacia atrás pedir en `dateFrom` (independiente del intervalo) | `1`     |
| `MW_CA_CERT_PATH`       | Ruta a un certificado CA a confiar puntualmente (ver abajo) | *(opcional)*          |
| `MW_INSECURE_SKIP_TLS_VERIFY` | Desactiva la verificación TLS por completo (ver abajo) — **peligroso** | `false`         |

### Certificados autofirmados (staging propio)

Si `MW_BASE_URL` apunta a un staging con certificado autofirmado, Node lo va
a rechazar con `UNABLE_TO_VERIFY_LEAF_SIGNATURE` — es el comportamiento
correcto, Node valida certificados por default (a diferencia de Postman, que
trae la verificación SSL desactivada).

En vez de desactivar la verificación TLS por completo (lo que aceptaría
*cualquier* certificado de *cualquier* servidor, exponiendo el
`client_secret` a un posible MITM), apuntá `MW_CA_CERT_PATH` al certificado
real de ese staging (ej: el que usa su Apache en `SSLCertificateFile`):

```
MW_CA_CERT_PATH=/ruta/al/staging/certs/fullchain.pem
```

Esto agrega ese certificado puntual a la lista de confianza — la
verificación sigue activa para cualquier otro servidor.

> **Importante**: `MW_CA_CERT_PATH` tiene que apuntar al certificado **real**
> que el servidor destino ya está sirviendo — no sirve generar uno nuevo con
> `generate-self-signed-cert.sh` "con el mismo dominio" y esperar que
> funcione. La confianza TLS se basa en la firma criptográfica del archivo,
> no en que el nombre (CN) coincida; un certificado inventado por vos es una
> clave distinta a la que usa el servidor real, así que sigue sin validar.
>
> Si no tenés acceso directo al archivo del servidor, extraé el certificado
> real de la conexión:
> ```bash
> echo | openssl s_client -connect TU_HOST:443 -servername TU_HOST 2>/dev/null | openssl x509 -outform PEM > server-real.pem
> ```
> y usá `MW_CA_CERT_PATH=./server-real.pem`.

`generate-self-signed-cert.sh` sirve para el caso contrario: cuando **vos
mismo** levantás un servidor de prueba (ej. un staging local en Docker) y
necesitás generarle un certificado desde cero — ahí sí, el mismo archivo que
generás es el que termina sirviendo el servidor, así que coincide.

```bash
cd oauth-poller-client   # pararte en esta carpeta, donde esta el script
MSYS_NO_PATHCONV=1 bash generate-self-signed-cert.sh
```

`MSYS_NO_PATHCONV=1` es obligatorio en Git Bash / Windows — sin eso, Git Bash
traduce `/CN=...` como si fuera una ruta de archivo y el comando falla con
`subject name is expected to be in the format...`.

Sin argumentos genera el certificado para `localhost`. El **dominio va como
argumento**, después del nombre del script, en la misma línea:

```bash
MSYS_NO_PATHCONV=1 bash generate-self-signed-cert.sh staging.micorner.com
```

Genera `certs/privkey.pem` y `certs/fullchain.pem` (`certs/` está en
`.gitignore` — la clave privada nunca se commitea). Después, en `.env`:

```
MW_CA_CERT_PATH=./certs/fullchain.pem
```

### Desactivar la verificación TLS por completo (`MW_INSECURE_SKIP_TLS_VERIFY`)

**Peligroso — evitar salvo pruebas puntuales y aisladas.** Es el equivalente
a apagar "SSL certificate verification" en Postman: el poller deja de
verificar el certificado del servidor por completo y acepta cualquiera,
incluido el de un atacante interceptando la conexión (el `client_secret`
viaja en cada petición de token). `MW_CA_CERT_PATH` (arriba) resuelve el
mismo problema sin este riesgo — usar esto solo si no hay forma de conseguir
el certificado real del servidor.

```
MW_INSECURE_SKIP_TLS_VERIFY=true
```

Al arrancar, el poller imprime una advertencia bien visible en consola
mientras esta variable esté activa, para que no pase desapercibido.

`.env` está en `.gitignore` — nunca se commitea.

---

## Uso

```bash
npm start
```

Corre el ciclo inmediatamente al arrancar y luego cada `MW_POLL_INTERVAL_MS`.
Se detiene limpiamente con `Ctrl+C`.

Para dejarlo corriendo desatendido (ej: overnight, para atrapar un error
intermitente):

```bash
nohup npm start > /dev/null 2>&1 &
```

o correrlo dentro de una sesión de `tmux`/`screen`/PM2 según lo que uses en
el entorno donde lo dejes corriendo.

---

## Cómo funciona

1. **Autenticación** — `POST /oauth/token` con Basic Auth
   (`client_id`/`client_secret`). Guarda `access_token` + `refresh_token`.
2. **Token siempre vigente** — antes de expirar (con 60s de margen), renueva
   con `POST /oauth/refresh`; si el refresh falla, reautentica desde cero.
   Ante un 401 inesperado en una consulta, fuerza reautenticación y
   reintenta una vez.
3. **Ventana de fechas** — cada ciclo calcula, en formato ISO 8601 completo:
   - `dateFrom` = ahora menos `MW_LOOKBACK_DAYS` **días** (no minutos —
     independiente de `MW_POLL_INTERVAL_MS`, que solo controla cada cuánto
     se corre el ciclo). Con una ventana de solo minutos, casi todas las
     corridas dan `count=0` porque rara vez hay una cita creada/actualizada
     en un margen tan chico.
   - `dateTo` = **fin del día actual** (`23:59:59.999Z`), no "ahora" — así
     la consulta también trae las citas programadas para el resto del día,
     no solo lo ya sucedido.
   - **Piso de fechas**: `dateFrom` nunca es anterior a
     `2026-07-16T08:00:00.000Z` (`MIN_VALID_DATE` en `index.ts`) porque el
     sistema origen no tiene datos válidos antes de esa fecha. Está cubierto
     por tests (`index.test.ts`).
4. **Consulta** — `GET /v1/requests` con `startDate`, `endDate`,
   `status=CREATED,IN_PROGRESS`, `page=1`, `limit=20`. Para agregar o
   modificar consultas, editar `buildQueries`/`runQuery` en `index.ts`.
5. **Resiliencia** — si una consulta falla o el ciclo entero lanza un error
   no previsto, se loguea y el proceso sigue corriendo (no se cae).

---

## Logs

Cada petición deja una línea en `logs/poller.log` (se crea solo, ignorado
en git) y también se imprime en consola:

```
[2026-09-01T13:50:27.532Z] OK    requests ultimos 1d params={"dateFrom":"2026-08-31T13:50:27.532Z","dateTo":"2026-09-01T23:59:59.999Z"} duration=149ms count=1
[2026-09-01T13:55:27.913Z] ERROR requests ultimos 1d params={"dateFrom":"2026-08-31T13:55:27.913Z","dateTo":"2026-09-01T23:59:59.999Z"} duration=218ms message="ECONNREFUSED"
```

Campos: timestamp, `OK`/`ERROR`, nombre de la consulta, `params` usados,
`duration`, y si aplica `count` (resultados) o `status`/`message` (error).
Nunca incluye el contenido de las solicitudes/citas devueltas.

Si la respuesta llega con `200 OK` pero en una forma que el poller no
reconoce (no es un array ni tiene `.data` array — solo esas dos formas se
cuentan), en vez de `count` aparece `shape=object{clave1,clave2,...}` (solo
los **nombres** de las claves de primer nivel, nunca sus valores). Sirve
para confirmar que sí llegó una respuesta real y ver cómo viene armada, sin
persistir el contenido de negocio. Ejemplo:
```
[...] OK    requests (...) params={...} duration=143ms shape=object{success,requests} (conteo no reconocido)
```

Para revisar después de dejarlo corriendo toda la noche:

```bash
tail -f logs/poller.log      # en vivo
grep ERROR logs/poller.log    # solo fallas
```

---

## Tests

```bash
npm test
```

Cubre el clamping del piso de fechas (`buildWindow`) con distintos
escenarios: ventana normal, ventana que cruzaría el piso, reloj del sistema
atrasado, y un barrido de intervalos.

---

## Estructura

```
oauth-poller-client/
├── index.ts                    # cliente OAuth2 + loop de polling + logging
├── index.test.ts                # tests de la ventana de fechas
├── generate-self-signed-cert.sh   # genera un cert de prueba para MW_CA_CERT_PATH
├── package.json                     # dependencias y scripts (start, test)
├── tsconfig.json                      # config de TypeScript propia del proyecto
├── .env.example                         # plantilla de configuración
├── .env                                   # credenciales reales (gitignored, no versionado)
├── .gitignore                               # ignora .env, logs/, node_modules/ y certs/
├── certs/
│   └── fullchain.pem                          # generado por el script (gitignored)
└── logs/
    └── poller.log                               # se genera al correr el script (gitignored)
```
