// src/scripts/bootstrap-admin.ts
// Crea el primer administrador directamente contra la base, sin necesitar que
// el servidor HTTP este levantado (equivalente a POST /admin/setup, misma
// logica que AdminService.setup(): bcrypt con 12 rounds, solo funciona si no
// existe ningun admin todavia).
//
// Vive en src/ (no en scripts/ suelto) para que `nest build` lo compile junto
// con el resto a dist/scripts/*.js — asi el paquete de deploy.js lo incluye
// automaticamente y en el servidor corre con `node` puro, sin ts-node.
//
// Uso en desarrollo (interactivo — pide username y password por consola):
//   npx ts-node -r tsconfig-paths/register src/scripts/bootstrap-admin.ts
//
//   # no interactivo, para CI/deploy sin TTY:
//   ADMIN_FORCE=true ADMIN_USERNAME=admin ADMIN_PASSWORD=algo-seguro-12+chars \
//   npx ts-node -r tsconfig-paths/register src/scripts/bootstrap-admin.ts
//
// Uso ya compilado (en el servidor, sin ts-node):
//   ADMIN_FORCE=true ADMIN_USERNAME=admin ADMIN_PASSWORD=algo-seguro \
//   node dist/scripts/bootstrap-admin.js
//
//   # apuntando a un host remoto sin tocar los .env del repo:
//   DB_HOST=<host-remoto> DB_USERNAME=<user> DB_PASSWORD=<pass> DB_DATABASE=middleware_db \
//   NODE_ENV=production ADMIN_FORCE=true ADMIN_USERNAME=admin ADMIN_PASSWORD=algo-seguro \
//   node dist/scripts/bootstrap-admin.js
//
// Requiere que la tabla `admins` ya exista (correr antes bootstrap-schema.ts
// o npm run migration:run). Idempotente: si ya hay un admin, no hace nada y avisa.

import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';
import { AppDataSource } from '../database/data-source';
import { AdminEntity } from '../admin/entities/admin.entity';

const BCRYPT_ROUNDS = 12; // igual que AdminService

function generateSecurePassword(): string {
    return crypto.randomBytes(12).toString('base64url');
}

async function promptAdminInfo(): Promise<{ username: string; password: string }> {
    if (process.env.ADMIN_FORCE === 'true') {
        return {
            username: process.env.ADMIN_USERNAME || 'admin',
            password: process.env.ADMIN_PASSWORD || generateSecurePassword(),
        };
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string): Promise<string> => new Promise((res) => rl.question(q, res));

    console.log('\n📝 CONFIGURACIÓN DEL ADMINISTRADOR\n');
    const username = await ask('Username  [admin]: ');
    const password = await ask('Password (mínimo 8 caracteres) [auto-generar]: ');
    rl.close();

    return {
        username: username || 'admin',
        password: password || generateSecurePassword(),
    };
}

async function main() {
    const { username, password: passwordPlain } = await promptAdminInfo();

    await AppDataSource.initialize();
    console.log('✅ Conectado a la base de datos');

    const adminRepo = AppDataSource.getRepository(AdminEntity);

    const existingCount = await adminRepo.count();
    if (existingCount > 0) {
        console.log(`⚠️  Ya existe al menos un administrador (${existingCount}) — no se crea ninguno nuevo.`);
        await AppDataSource.destroy();
        return;
    }

    const passwordHash = await bcrypt.hash(passwordPlain, BCRYPT_ROUNDS);
    const admin = await adminRepo.save(adminRepo.create({ username, passwordHash }));

    console.log('\n✅ Administrador creado');
    console.log('══════════════════════════════════════════');
    console.log(`  Username : ${admin.username}`);
    console.log(`  Password : ${passwordPlain}`);
    console.log(`  ID       : ${admin.id}`);
    console.log('══════════════════════════════════════════');
    console.log('\n⚠  Copia la contraseña ahora — no se guarda en ningun archivo.\n');

    await AppDataSource.destroy();
}

main().catch((err) => {
    const error = err as Error & { code?: string; sqlMessage?: string };
    console.error(`❌ Error en bootstrap-admin [${error.code ?? error.name ?? 'Error'}]: ${error.sqlMessage ?? error.message}`);
    if (error.stack) console.error(error.stack);
    process.exit(1);
});
