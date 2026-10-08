#!/usr/bin/env node
// Records a real AdMob response through the same request TRMNL sends, for use
// as a fixture once Google credentials exist. Nothing here runs in the recipe.
//
//   ADMOB_ACCESS_TOKEN=ya29... pnpm --filter @trmnl/admob-earnings fetch [--publisher pub-…] [--scale 0.37] [--output fixtures/recorded.json]
//
// The token needs the admob.readonly scope (for example from trmnlp serve's
// OAuth flow or gcloud with your own OAuth client). It is read from the
// environment only and never written. Without --publisher the script lists the
// accounts the token can see, which is also what the account picker shows.
// --scale multiplies every earnings figure, so a fixture can be committed
// without revealing real revenue; leave it out only for private files.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlugin, renderPolling } from '@trmnl/plugin-tools';

const flags = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map(pair => pair.split(/\s+/)).map(([key, value]) => [key, value ?? true]));
const token = process.env.ADMOB_ACCESS_TOKEN;
if (!token) throw new Error('Set ADMOB_ACCESS_TOKEN to an OAuth access token with the admob.readonly scope.');
const headers = { authorization: `Bearer ${token}` };

const accounts = await fetch('https://admob.googleapis.com/v1/accounts', { headers });
const list = await accounts.json();
if (!accounts.ok) throw new Error(`Accounts request failed (${accounts.status}): ${JSON.stringify(list.error ?? list)}`);
for (const account of list.account ?? []) console.log(`${account.publisherId} · ${account.currencyCode} · ${account.reportingTimeZone}`);
if (!flags.publisher) { console.log('Pass --publisher <id> to record a network report.'); process.exit(); }

const plugin = await loadPlugin(fileURLToPath(new URL('..', import.meta.url)));
const request = await renderPolling(plugin, { fields: { publisher_id: flags.publisher }, accessToken: token });
const response = await fetch(request.urls[0], { method: request.verb, headers: request.headers, body: request.body });
const report = await response.json();
console.log(`${request.verb} ${request.urls[0]} → ${response.status}`);
const scale = flags.scale === undefined ? 1 : Number(flags.scale);
if (!Number.isFinite(scale) || scale <= 0) throw new Error('--scale must be a positive number.');
const output = Array.isArray(report) ? report.map(element => {
  const earnings = element.row?.metricValues?.ESTIMATED_EARNINGS;
  return earnings ? { row: { ...element.row, metricValues: { ...element.row.metricValues, ESTIMATED_EARNINGS: { microsValue: String(Math.round(Number(earnings.microsValue) * scale)) } } } } : element;
}) : report;
const path = flags.output ?? `.cache/recorded-${new Date().toISOString().slice(0, 10)}.json`;
const target = fileURLToPath(new URL(`../${path}`, import.meta.url));
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(output, null, 2) + '\n');
console.log(`Wrote ${path} (polled ${new Date().toISOString()}; add that time to the fixture's entry in plugin.config.json).`);
