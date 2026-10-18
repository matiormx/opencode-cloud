#!/usr/bin/env node
// Uso:
//   node bin/set-password.js "mi contraseña"
//   printf %s "mi contraseña" | node bin/set-password.js --stdin
// Respeta DATA_DIR (el mismo que usa el servicio).
import { setPassword } from '../server/auth.js';

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.replace(/\r?\n$/, '');
}

const args = process.argv.slice(2);
const password = args.includes('--stdin') ? await readStdin() : args[0];

if (!password) {
  console.error('Uso: node bin/set-password.js <contraseña>   (o --stdin)');
  process.exit(1);
}

try {
  await setPassword(password);
  console.log('Contraseña actualizada. Las sesiones abiertas se han cerrado.');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
