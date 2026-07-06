'use strict';

// TLS 1.3 es responsabilidad del Apache que actúa como reverse proxy.
// Este proceso solo corre el NestJS en HTTP en localhost:3007.

module.exports = {
  apps: [
    {
      name: 'api-middleware-service',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_development: {
        NODE_ENV: 'development',
      },
      env_staging: {
        NODE_ENV: 'staging',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
    {
      // Sirve el build de dashboard/dist con `vite preview`, que hereda el
      // proxy /api -> localhost:3007 de vite.config.ts. Requiere haber
      // ejecutado `npm run build` dentro de dashboard/ antes de arrancar.
      name: 'dashboard',
      cwd: './dashboard',
      script: 'npm',
      args: 'run preview -- --host --port 4173',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env_staging: {
        NODE_ENV: 'staging',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
