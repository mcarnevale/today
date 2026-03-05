#!/usr/bin/env node
// Load .env.local and run prisma db push (Prisma only reads .env by default)
import { execSync } from 'child_process';
import { resolve } from 'path';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';

const envLocalPath = resolve(process.cwd(), '.env.local');
const envPath = resolve(process.cwd(), '.env');

// Parse DATABASE_URL and DIRECT_URL from .env.local
function parseEnv(content, key) {
  const match = content.match(new RegExp(`^${key}=(?:"([^"]*)"|'([^']*)'|(\\S+))`, 'm'));
  return match ? (match[1] || match[2] || match[3]) : null;
}

let dbUrl = null;
let directUrl = null;
if (existsSync(envLocalPath)) {
  const content = readFileSync(envLocalPath, 'utf8');
  dbUrl = parseEnv(content, 'DATABASE_URL');
  directUrl = parseEnv(content, 'DIRECT_URL');
}

if (!dbUrl) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

// DIRECT_URL: use session mode (port 5432) for migrations; derive from DATABASE_URL if missing
if (!directUrl && dbUrl.includes(':6543/')) {
  directUrl = dbUrl.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

// Write .env so Prisma finds it
const hadEnv = existsSync(envPath);
const backup = hadEnv ? readFileSync(envPath, 'utf8') : null;
const envContent = [
  `DATABASE_URL="${dbUrl.replace(/"/g, '\\"')}"`,
  directUrl ? `DIRECT_URL="${directUrl.replace(/"/g, '\\"')}"` : '',
].filter(Boolean).join('\n') + '\n';
writeFileSync(envPath, envContent);
try {
  execSync('npx prisma db push', { stdio: 'inherit' });
} finally {
  if (hadEnv && backup) writeFileSync(envPath, backup);
  else if (!hadEnv) unlinkSync(envPath);
}
