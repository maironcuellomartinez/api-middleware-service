/**
 * Load test — carga sostenida realista.
 * Simula N clientes autenticándose y consultando registros de forma continua.
 *
 * Uso:
 *   k6 run -e K6_CLIENT_ID=mc_xxx -e K6_CLIENT_SECRET=yyy k6/load.test.js
 *
 * Para ajustar la carga:
 *   k6 run -e K6_CLIENT_ID=... -e K6_CLIENT_SECRET=... \
 *          -e TARGET_VUS=20 -e DURATION=5m k6/load.test.js
 */
import { check, sleep } from 'k6';
import { postToken, getRequests, postRefresh } from './helpers/auth.js';

const TARGET_VUS = parseInt(__ENV.TARGET_VUS || '10');
const DURATION   = __ENV.DURATION || '3m';

export const options = {
  stages: [
    { duration: '30s', target: TARGET_VUS },   // ramp-up
    { duration: DURATION, target: TARGET_VUS }, // carga sostenida
    { duration: '20s', target: 0 },             // ramp-down
  ],
  thresholds: {
    // Performance
    'http_req_duration{endpoint:oauth_token}':  ['p(95)<1500'],  // bcrypt es costoso
    'http_req_duration{endpoint:oauth_refresh}': ['p(95)<800'],
    'http_req_duration{endpoint:records_list}':  ['p(95)<2000'],
    'http_req_duration{endpoint:health_ping}':   ['p(95)<100'],

    // Errores — permitir 429 (throttle/bulkhead) pero no 5xx
    'http_req_failed': ['rate<0.01'],

    checks: ['rate>0.95'],
  },
};

export default function () {
  // Cada VU obtiene su token al inicio de cada iteración
  const tokenRes = postToken();
  const tokenOk = check(tokenRes, {
    'token → 200':                 (r) => r.status === 200,
    'token → tiene access_token':  (r) => !!r.json('access_token'),
    'token → no es 5xx':           (r) => r.status < 500,
  });

  // Si el bulkhead saturó (429) simplemente esperamos y continuamos
  if (!tokenOk || !tokenRes.json('access_token')) {
    sleep(1);
    return;
  }

  const accessToken  = tokenRes.json('access_token');
  const refreshToken = tokenRes.json('refresh_token');

  // Simular uso real: 3 consultas por token obtenido
  for (let i = 0; i < 3; i++) {
    const recordsRes = getRequests(accessToken);
    check(recordsRes, {
      'records → no es 5xx': (r) => r.status < 500,
      'records → no es 401': (r) => r.status !== 401,
    });
    sleep(0.5);
  }

  // Rotar el token al final de la iteración
  const refreshRes = postRefresh(refreshToken);
  check(refreshRes, {
    'refresh → 200':               (r) => r.status === 200,
    'refresh → nuevo access_token': (r) => !!r.json('access_token'),
  });

  sleep(1);
}
