#!/usr/bin/env node
/**
 * One-time Gmail OAuth flow to obtain a refresh token.
 * Run: npm run gmail:auth
 *
 * Prerequisites:
 * 1. Google Cloud Console: Enable Gmail API, add gmail.readonly scope
 * 2. Add http://localhost:8080/callback to OAuth client's Authorized redirect URIs
 * 3. .env.local: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET (or AUTH_GOOGLE_ID/SECRET)
 *
 * Output: GMAIL_REFRESH_TOKEN — add to .env.local
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { exec } from 'child_process';
import { platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, '..', '.env.local');
if (!existsSync(envPath)) {
  console.error('No .env.local found');
  process.exit(1);
}
const env = readFileSync(envPath, 'utf8');
for (const line of env.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const m = trimmed.match(/^([^=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const clientId = process.env.GMAIL_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;

if (!clientId || !clientSecret) {
  console.error('Need GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (or AUTH_GOOGLE_ID/SECRET) in .env.local');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:8080/callback';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

async function main() {
  const { google } = await import('googleapis');
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  const codePromise = new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (error) {
          res.end(`<h1>Error</h1><p>${error}</p><p>You can close this tab.</p>`);
          resolve(null);
        } else if (code) {
          res.end('<h1>Success!</h1><p>You can close this tab and return to the terminal.</p>');
          resolve(code);
        } else {
          res.end('<h1>No code received</h1><p>You can close this tab.</p>');
          resolve(null);
        }
        server.close();
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(8080, () => {
      console.log('\n1. Opening browser for authorization...\n');
      const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${cmd} "${authUrl}"`, () => {
        console.log('If the browser did not open, visit:', authUrl);
      });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('Port 8080 is in use. Stop the other process or use a different port.');
      }
      reject(err);
    });
  });

  const code = await codePromise;

  if (!code) {
    console.error('\nNo authorization code received.');
    process.exit(1);
  }

  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    console.error('\nNo refresh token received. Revoke access at');
    console.error('https://myaccount.google.com/permissions and try again.');
    process.exit(1);
  }

  console.log('\n✓ Success! Add this to your .env.local:\n');
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('\n(Also set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET if using different credentials.)\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
