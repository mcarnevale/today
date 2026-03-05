#!/usr/bin/env node
/**
 * Test HubSpot integration.
 * Run: node scripts/test-hubspot.mjs
 * Requires: .env.local with HUBSPOT_ACCESS_TOKEN
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

if (!process.env.HUBSPOT_ACCESS_TOKEN) {
  console.error('HUBSPOT_ACCESS_TOKEN not set in .env.local');
  process.exit(1);
}

const HUBSPOT_BASE = 'https://api.hubapi.com';
const props = 'dealname,dealstage,amount,closedate,hs_lastmodifieddate';

console.log('Testing HubSpot API...\n');

try {
  const res = await fetch(
    `${HUBSPOT_BASE}/crm/v3/objects/deals?properties=${props}&limit=10`,
    { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
  );

  console.log('Status:', res.status, res.statusText);

  if (!res.ok) {
    const text = await res.text();
    console.error('Error:', text);
    process.exit(1);
  }

  const data = await res.json();
  const results = data.results || [];
  console.log('Deals fetched:', results.length);

  if (results.length > 0) {
    console.log('\nSample deals:');
    results.slice(0, 3).forEach((d, i) => {
      const p = d.properties || {};
      console.log(`  ${i + 1}. ${p.dealname || 'Untitled'} (${p.dealstage || '—'})`);
    });
  }

  console.log('\n✓ HubSpot integration OK');
} catch (err) {
  console.error('Failed:', err.message);
  process.exit(1);
}
