// src/scripts/bootstrap-schema.ts
// Bootstrap manual del esquema de middleware_db, usando el mismo AppDataSource
// que ya define src/database/data-source.ts (misma config de conexion y de
// .env.<NODE_ENV> que usa el resto del proyecto).
//
// Equivalente a correr `npm run migration:run`, pero pensado para cuando NO
// hay shell/npm en el servidor de destino: se corre desde una maquina que SI
// tenga Node y conexion directa a la base (por ejemplo, apuntando DB_HOST al
// host remoto via variables de entorno).
//
// Vive en src/ (no en scripts/ suelto) para que `nest build` lo compile junto
// con el resto a dist/scripts/*.js — asi el paquete de deploy.js lo incluye
// automaticamente y en el servidor corre con `node` puro, sin ts-node.
//
// Uso en desarrollo (ts-node):
//   npx ts-node -r tsconfig-paths/register src/scripts/bootstrap-schema.ts
//
// Uso ya compilado (en el servidor, sin ts-node):
//   node dist/scripts/bootstrap-schema.js
//
//   # apuntando a un host remoto sin tocar los .env del repo:
//   DB_HOST=<host-remoto> DB_PORT=3306 DB_USERNAME=<user> DB_PASSWORD=<pass> \
//   DB_DATABASE=middleware_db NODE_ENV=production \
//   node dist/scripts/bootstrap-schema.js
//
// Representa, en orden, las migraciones ya existentes en src/migrations/:
//   1740000000000-InitialSchema
//   1745000000000-AddJtiHashToRefreshTokens
//   1748302418000-AddGrantedScopesToRefreshTokens
//
// Es idempotente: se puede correr mas de una vez sin duplicar tablas ni filas.
// Deja poblada la tabla `migrations` de TypeORM para que, si mas adelante SI
// se puede correr `npm run migration:run` contra esta misma base, TypeORM
// detecte que ya estan aplicadas y no intente re-ejecutarlas.

import { AppDataSource } from '../database/data-source';

async function main() {
    await AppDataSource.initialize();
    console.log('✅ Conectado a la base de datos');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`admins\` (
                \`id\`           int          NOT NULL AUTO_INCREMENT,
                \`username\`     varchar(100) NOT NULL,
                \`passwordHash\` varchar(128) NOT NULL,
                \`createdAt\`    datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedAt\`    datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                UNIQUE KEY \`UQ_admins_username\` (\`username\`),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('📦 Tabla `admins` OK');

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`external_clients\` (
                \`clientId\`              varchar(64)  NOT NULL,
                \`clientSecretHash\`      varchar(128) NOT NULL,
                \`name\`                  varchar(100) NOT NULL,
                \`description\`           varchar(255) NULL,
                \`tokenExpiresInSeconds\` int          NOT NULL DEFAULT 3600,
                \`allowedScopes\`         text         NULL,
                \`isActive\`              tinyint      NOT NULL DEFAULT 1,
                \`createdAt\`             datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedAt\`             datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`clientId\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('📦 Tabla `external_clients` OK');

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`refresh_tokens\` (
                \`id\`            int          NOT NULL AUTO_INCREMENT,
                \`clientId\`      varchar(64)  NOT NULL,
                \`tokenHash\`     varchar(128) NOT NULL,
                \`expiresAt\`     datetime     NOT NULL,
                \`revokedAt\`     datetime     NULL,
                \`createdAt\`     datetime(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`jtiHash\`       varchar(64)  NULL,
                \`grantedScopes\` text         NULL,
                INDEX \`IDX_refresh_tokens_clientId\` (\`clientId\`),
                INDEX \`IDX_refresh_tokens_jtiHash\` (\`jtiHash\`),
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('📦 Tabla `refresh_tokens` OK (incluye jtiHash y grantedScopes)');

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`migrations\` (
                \`id\`        int          NOT NULL AUTO_INCREMENT,
                \`timestamp\` bigint       NOT NULL,
                \`name\`      varchar(255) NOT NULL,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB
        `);

        const appliedMigrations: [number, string][] = [
            [1740000000000, 'InitialSchema1740000000000'],
            [1745000000000, 'AddJtiHashToRefreshTokens1745000000000'],
            [1748302418000, 'AddGrantedScopesToRefreshTokens1748302418000'],
        ];

        for (const [timestamp, name] of appliedMigrations) {
            await queryRunner.query(
                `INSERT INTO \`migrations\` (\`timestamp\`, \`name\`)
                 SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM \`migrations\` WHERE \`name\` = ?)`,
                [timestamp, name, name],
            );
        }
        console.log('📦 Tabla `migrations` OK (bookkeeping de TypeORM al dia)');

        await queryRunner.commitTransaction();
        console.log('\n✅ Schema listo. Ya se puede llamar a POST /admin/setup para crear el administrador.');
    } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
        await AppDataSource.destroy();
    }
}

main().catch((err) => {
    const error = err as Error & { code?: string; sqlMessage?: string };
    console.error(`❌ Error en bootstrap-schema [${error.code ?? error.name ?? 'Error'}]: ${error.sqlMessage ?? error.message}`);
    if (error.stack) console.error(error.stack);
    process.exit(1);
});
