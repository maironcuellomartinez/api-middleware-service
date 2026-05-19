# api-middleware-service

Proxy OAuth 2.0 para aplicaciones externas que necesitan consultar incidencias y solicitudes del ecosistema **Event Corner**.

Actúa como puerta de entrada para terceros: emite tokens propios (HS256, MySQL), valida credenciales de clientes registrados y reenvía las consultas al `api-gateway` interno con un token M2M de servicio.

---

## Tabla de contenidos

- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Configuración](#configuración)
- [Inicio](#inicio)
- [API](#api)
  - [Auth — OAuth 2.0](#auth--oauth-20)
  - [Records — Consulta de solicitudes](#records--consulta-de-solicitudes)
  - [Clients — Gestión de aplicaciones](#clients--gestión-de-aplicaciones)
  - [Admin — Sesión de administración](#admin--sesión-de-administración)
  - [Health — Estado del servicio](#health--estado-del-servicio)
- [Resiliencia](#resiliencia)
- [Seguridad](#seguridad)
- [Base de datos](#base-de-datos)
- [Tests](#tests)

---

## Arquitectura

```
Aplicación externa
    │  POST /oauth/token  (Basic Auth: clientId + clientSecret)
    │  GET  /v1/requests  (Bearer <access_token>)
    ▼
api-middleware-service :3007
    │  valida token localmente (HS256 + MySQL)
    │  Authorization: Bearer <ABAC_M2M_TOKEN>
    ▼
api-gateway :3000  (/internal-api/*)
    ▼
monolith :3001
```

El servicio **no** llama a ningún servidor de introspección externo (RFC 7662). Los tokens se emiten y validan completamente de forma local.

---

## Requisitos

- Node.js 20+
- MySQL 8+ (base de datos `middleware_db`)
- `api-gateway` corriendo en `:3000` (para reenvío de consultas)

---

## Configuración

El servicio carga variables de entorno desde `.env.<NODE_ENV>` **antes** de inicializar NestJS. Crear el archivo correspondiente al entorno:

| Archivo | Entorno |
|---|---|
| `.env.development` | `npm run start:dev` |
| `.env.staging` | `npm run start:staging` |
| `.env.production` | `npm run start:prod` |

### Variables requeridas

```env
# Base de datos
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=root
DB_DATABASE=middleware_db

# Controla TypeORM synchronize — NUNCA true en producción
SYNCHRONIZE_DATABASE=true

# JWT para access tokens de clientes externos (mín. 32 caracteres en staging/prod)
JWT_SECRET=dev-only--replace-in-staging-and-production

# JWT para cookie de sesión de admin (mín. 32 caracteres en staging/prod)
ADMIN_SESSION_SECRET=dev-only--replace-in-staging-and-production

# Token M2M para autenticarse ante el api-gateway
ABAC_M2M_TOKEN=dev-only--replace-in-staging-and-production

# URL del api-gateway interno
API_GATEWAY_URL=http://localhost:3000
```

### Variables opcionales

```env
PORT=3007

# CORS en development (default: localhost:5173 y localhost:3000)
CORS_DEV_ORIGINS=http://localhost:5173,http://localhost:3000

# CORS en staging/production (requerido en esos entornos)
CORS_ALLOWED_ORIGINS=https://app.ejemplo.com

# API key de administración para endpoints /clients (si se usa AdminApiKeyGuard)
ADMIN_API_KEY=

# Protege GET /health/status con un header x-health-token
# Si no se configura, el endpoint es público
HEALTH_STATUS_TOKEN=

# Bulkhead HTTP global
HTTP_BULKHEAD_CONCURRENCY=50
HTTP_BULKHEAD_MAX_QUEUE=100
```

> **Nota:** En entornos `staging` y `production`, `requiredSecret` valida que `JWT_SECRET` y `ADMIN_SESSION_SECRET` tengan al menos 32 caracteres y no usen el prefijo `dev-only--`. El servicio no arranca si no se cumplen esas condiciones.

---

## Inicio

```bash
npm install

# Development (carga .env.development, hot-reload)
npm run start:dev

# Staging
npm run start:staging

# Production
npm run start:prod

# Debug
npm run start:debug
```

Swagger disponible en `http://localhost:3007/docs` en development y staging.

---

## API

### Auth — OAuth 2.0

#### `POST /oauth/token`

Emite un access token y un refresh token para una aplicación registrada.

**Autenticación:** HTTP Basic Auth — `clientId:clientSecret` codificado en base64.  
El `clientId` debe comenzar con `mc_`.

**Body:**
```json
{
  "grant_type": "client_credentials",
  "scope": "records:read incidents:read"
}
```

`scope` es opcional. Si se envía, se intersecta con los `allowedScopes` del cliente. Si la intersección queda vacía se retorna `400 invalid_scope`. Si no se envía, se otorgan todos los `allowedScopes` configurados.

**Respuesta exitosa:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "client_name": "Mi App",
  "scope": ["records:read", "incidents:read"]
}
```

**Límites:** 10 req/min (throttle) + bulkhead de 3 bcrypt concurrentes / cola de 5.

---

#### `POST /oauth/refresh`

Rota el par de tokens. El refresh token anterior queda revocado inmediatamente.

**Body:**
```json
{
  "refresh_token": "eyJ..."
}
```

**Respuesta exitosa:** igual que `/oauth/token` (sin `scope`).

**Detección de reuse:** si el refresh token ya fue usado, se revocan **todos** los tokens activos del cliente y se retorna `401`.

**Límites:** 5 req/min.

---

### Records — Consulta de solicitudes

Todos los endpoints requieren `Authorization: Bearer <access_token>` o cookie `admin_session` válida.

#### `GET /v1/requests/:number`

Obtiene una solicitud por su número (ej. `REQ0001234`).

```
GET /v1/requests/REQ0001234
Authorization: Bearer eyJ...
```

#### `GET /v1/requests`

Lista solicitudes con filtros opcionales.

| Query param | Tipo | Descripción |
|---|---|---|
| `status` | string | Estados separados por coma (`CREATED,IN_PROGRESS`) |
| `issueTypeId` | string | UUID del tipo de incidencia |
| `cornerId` | string | UUID del corner |
| `companyId` | string | UUID de la empresa |
| `dateFrom` | string | Fecha inicio (`YYYY-MM-DD`) |
| `dateTo` | string | Fecha fin (`YYYY-MM-DD`) |
| `page` | number | Página (default: 1) |
| `limit` | number | Registros por página, máx. 100 (default: 20) |

---

### Clients — Gestión de aplicaciones

Todos los endpoints requieren cookie de sesión `admin_session` activa (ver `/admin/login`).

#### `POST /clients`

Registra una nueva aplicación externa. Retorna `clientId` y `clientSecret` **una sola vez** — el secret no se puede recuperar.

**Body:**
```json
{
  "name": "Portal HR",
  "description": "Consulta de solicitudes para empleados",
  "tokenExpiresInSeconds": 3600,
  "scopes": ["records:read"]
}
```

`tokenExpiresInSeconds` mín. 3600 (1h), máx. 604800 (7 días). `scopes` es opcional; sin él, el cliente puede pedir cualquier scope.

**Respuesta:**
```json
{
  "clientId": "mc_a1b2c3...",
  "clientSecret": "f4e5d6...",
  "name": "Portal HR",
  "message": "Guarda el clientSecret — no se puede recuperar."
}
```

#### `GET /clients`

Lista aplicaciones registradas (paginado). Params: `page`, `limit` (máx. 100).

#### `GET /clients/:clientId`

Detalle de una aplicación.

#### `PATCH /clients/:clientId/rotate-secret`

Genera un nuevo `clientSecret`. Los tokens previamente emitidos siguen siendo válidos hasta su expiración.

#### `PATCH /clients/:clientId/token-expiry`

Actualiza la duración del access token.

```json
{ "tokenExpiresInSeconds": 7200 }
```

#### `PATCH /clients/:clientId/reactivate`

Reactiva una aplicación desactivada.

#### `DELETE /clients/:clientId`

Desactiva la aplicación (soft delete). Los refresh tokens activos quedan revocados inmediatamente.

#### `DELETE /clients/:clientId/permanent`

Elimina permanentemente la aplicación. No reversible.

---

### Admin — Sesión de administración

#### `GET /admin/setup-required`

Retorna si el primer administrador ya fue configurado.

```json
{ "setupRequired": true }
```

Límite: 3 req/min.

#### `POST /admin/setup`

Crea el primer administrador. Solo funciona si no existe ninguno.

```json
{
  "username": "admin",
  "password": "contrasena-segura"
}
```

`password` mínimo 8 caracteres. Límite: 3 req/min.

#### `POST /admin/login`

Valida credenciales y establece una cookie `admin_session` (httpOnly, JWT, 24h).

```json
{
  "username": "admin",
  "password": "contrasena-segura"
}
```

Límite: 5 req/min.

#### `POST /admin/logout`

Elimina la cookie de sesión.

#### `GET /admin/me`

Retorna el usuario de la sesión activa. Requiere cookie.

---

### Health — Estado del servicio

#### `GET /health/ping`

Liveness check mínimo. Sin autenticación. Sin throttle.

```json
{
  "status": "ok",
  "timestamp": "2026-05-19T12:00:00.000Z",
  "uptime": 3600
}
```

#### `GET /health/status`

Estado completo: base de datos, memoria, disco, circuit breaker y bulkheads.

Si `HEALTH_STATUS_TOKEN` está configurado, requiere el header `x-health-token`.

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "memory_heap": { "status": "up" },
    "memory_rss": { "status": "up" },
    "disk_storage": { "status": "up" }
  },
  "gateway": {
    "circuitBreaker": { "state": "CLOSED", "failureRate": 0 },
    "bulkhead": {
      "high": { "pending": 0, "size": 0, "concurrency": 10 },
      "low":  { "pending": 0, "size": 0, "concurrency": 5 }
    }
  },
  "bulkhead": { "active": 0, "queued": 0, "concurrency": 50 }
}
```

---

## Resiliencia

El servicio implementa tres capas independientes:

### 1. HTTP Bulkhead global

Middleware aplicado a todas las rutas (excepto `/health/status`).

| Parámetro | Default | Variable |
|---|---|---|
| Concurrencia | 50 | `HTTP_BULKHEAD_CONCURRENCY` |
| Cola máxima | 100 | `HTTP_BULKHEAD_MAX_QUEUE` |

Responde `429` cuando la cola está llena.

### 2. OAuth Bulkhead

Interceptor en `POST /oauth/token`. Limita las operaciones `bcrypt` concurrentes para prevenir DoS por CPU.

| Parámetro | Valor |
|---|---|
| Concurrencia máxima | 3 |
| Cola máxima | 5 |
| Timeout de cola | 5 segundos |

### 3. Gateway Circuit Breaker + Priority Bulkhead

Protege las llamadas al `api-gateway`.

| Parámetro | Valor |
|---|---|
| Umbral de fallo | 50% en ventana de 10 llamadas (mín. 5) |
| Tiempo abierto | 30 segundos |
| Lane alta prioridad | concurrencia 10 (by-number lookups) |
| Lane baja prioridad | concurrencia 5 (list queries) |

Cuando el circuito está abierto, retorna `503 Service Unavailable`.

---

## Seguridad

### Tokens

- **Access token:** JWT HS256, firmado con `JWT_SECRET`. Incluye `iss: api-middleware-service`, `aud: external-clients`. Duración configurable por cliente (1h–7d).
- **Refresh token:** JWT HS256 con `jti` único (UUID v4). El `SHA-256(jti)` se almacena en BD para lookup exacto. Expiración: 7 días. Rotación en transacción — si falla la emisión del nuevo token, el viejo no queda revocado.
- **Reuse attack detection:** si se usa un refresh token ya revocado, se revocan todos los tokens activos del cliente.

### Credenciales

- `clientSecret` almacenado como hash bcrypt (cost 10). Nunca se persiste en texto plano.
- `validateCredentials` ejecuta bcrypt dummy cuando el `clientId` no existe para evitar enumeración por timing.
- `AdminApiKeyGuard` usa `crypto.timingSafeEqual` para comparar la API key.

### Sesión de admin

- Cookie `admin_session`: httpOnly, SameSite=strict, Secure en staging/prod, 24h de vida.
- JWT firmado con `ADMIN_SESSION_SECRET` (secret independiente de `JWT_SECRET`).

### Rate limiting

| Endpoint | Límite |
|---|---|
| `POST /oauth/token` | 10 req/min + bulkhead |
| `POST /oauth/refresh` | 5 req/min |
| `POST /admin/login` | 5 req/min |
| `GET /admin/setup-required` | 3 req/min |
| `POST /admin/setup` | 3 req/min |
| Global (todos los demás) | 100 req/min |

> En deployments multi-instancia, el ThrottlerModule necesita `ThrottlerStorageRedisService` para compartir contadores entre instancias.

---

## Base de datos

El servicio gestiona tres tablas en `middleware_db`:

### `external_clients`

| Columna | Tipo | Descripción |
|---|---|---|
| `clientId` | varchar(64) PK | Identificador con prefijo `mc_` |
| `clientSecretHash` | varchar(128) | Hash bcrypt del secret |
| `name` | varchar(100) | Nombre de la aplicación |
| `description` | varchar(255) | Descripción (nullable) |
| `tokenExpiresInSeconds` | int | Duración del access token |
| `allowedScopes` | json | Scopes permitidos (null = sin restricción) |
| `isActive` | bool | Estado de la aplicación |

### `refresh_tokens`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | int PK autoincrement | — |
| `clientId` | varchar(64) idx | Referencia al cliente |
| `tokenHash` | varchar(128) | SHA-256 del jti (lookup) |
| `jtiHash` | varchar(64) idx | SHA-256 del jti (verificación) |
| `grantedScopes` | json | Scopes del token original |
| `expiresAt` | datetime | Expiración del token |
| `revokedAt` | datetime | Fecha de revocación (null = activo) |

Un cron job a las **3am** limpia tokens expirados y revocados con más de 24h de antigüedad.

### `admins`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | int PK autoincrement | — |
| `username` | varchar(100) unique | Nombre de usuario |
| `passwordHash` | varchar(128) | Hash bcrypt (cost 12) |

---

## Tests

```bash
# Todos los tests unitarios
npm test

# Con cobertura
npm run test:cov

# Tests e2e
npm run test:e2e
```

Los tests de guards e interceptores usan `.overrideInterceptor()` y `.overrideGuard()` de `@nestjs/testing` para aislar el comportamiento sin dependencias externas.
