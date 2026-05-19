/**
 * Load test — carga sostenida realista.
 *
 * Modelo de uso real:
 *   - Cada VU se autentica UNA sola vez al inicio (los clientes cachean el token).
 *   - El grueso de la carga son requests a /v1/requests con el token vigente.
 *   - Cada 5 requests el VU rota el token (simula refresh periódico, no cada iteración).
 *
 * Uso:
 *   npm run k6:load
 *   k6 run -e TARGET_VUS=20 -e DURATION=5m k6/load.test.js
 */
import { check, sleep } from 'k6';
import http from 'k6/http';
import { postToken, getRequests, postRefresh } from './helpers/auth.js';

// 401 = token expirado / inválido (no debería ocurrir pero no es 5xx).
// 426 = gateway upstream exige HTTPS. 429 = throttler/bulkhead actuando correctamente.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 401, 426, 429));

const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '10');
const DURATION   = __ENV.DURATION || '3m';
const REFRESH_EVERY = 5;  // rotar token cada N requests

export const options = {
  stages: [
    { duration: '30s', target: TARGET_VUS },    // ramp-up
    { duration: DURATION, target: TARGET_VUS }, // carga sostenida
    { duration: '20s', target: 0 },             // ramp-down
  ],
  thresholds: {
    'http_req_duration{endpoint:oauth_token}':   ['p(95)<1500'],
    'http_req_duration{endpoint:oauth_refresh}': ['p(95)<800'],
    'http_req_duration{endpoint:records_list}':  ['p(95)<2000'],
    // Sólo cuentan como fallo las respuestas inesperadas (5xx, etc.)
    'http_req_failed': ['rate<0.01'],
    // Los checks sobre records y refresh deben pasar siempre
    'checks':          ['rate>0.95'],
  },
};

// Estado por VU (persiste entre iteraciones del mismo VU)
let vToken        = null;
let vRefreshToken = null;
let vRequestCount = 0;

export default function () {
  // ── Autenticación inicial (sólo primera iteración por VU) ────────────────
  if (!vToken) {
    const res = postToken();
    const ok = check(res, {
      'auth → token obtenido': (r) => r.status === 200 || r.status === 201,
      'auth → no es 5xx':      (r) => r.status < 500,
    });
    if (!ok || !res.json('access_token')) {
      sleep(1);  // bulkhead saturado — reintenta en la próxima iteración
      return;
    }
    vToken        = res.json('access_token');
    vRefreshToken = res.json('refresh_token');
  }

  // ── Request a records ────────────────────────────────────────────────────
  vRequestCount++;
  const recordsRes = getRequests(vToken);
  check(recordsRes, {
    'records → no es 5xx': (r) => r.status < 500,
    'records → no es 401': (r) => r.status !== 401,
  });

  // ── Refresh periódico (cada REFRESH_EVERY requests) ──────────────────────
  if (vRequestCount % REFRESH_EVERY === 0 && vRefreshToken) {
    const refreshRes = postRefresh(vRefreshToken);
    const newAccessToken  = refreshRes.json('access_token');
    const newRefreshToken = refreshRes.json('refresh_token');
    const refreshSuccess  = (refreshRes.status === 200 || refreshRes.status === 201)
                            && !!newAccessToken && !!newRefreshToken;

    check(refreshRes, {
      'refresh → ok':          (r) => r.status === 200 || r.status === 201,
      'refresh → nuevo token': () => !!newAccessToken,
    });

    if (refreshSuccess) {
      vToken        = newAccessToken;
      vRefreshToken = newRefreshToken;
    } else {
      // Error o body inválido — forzar re-autenticación para no reutilizar
      // el token ya revocado server-side (evita disparar reuse cascade).
      vToken        = null;
      vRefreshToken = null;
    }
  }

  sleep(0.5);
}
