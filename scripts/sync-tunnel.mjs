#!/usr/bin/env node
/**
 * Points CrowdClip at the current ngrok tunnel.
 *
 * The tunnel URL changes every time ngrok restarts on the free plan, and it has
 * to match in three places: the API's public origin, the web app's API base,
 * and the callback URL registered in the Meta app dashboard. This writes the
 * first two and prints the third.
 *
 *   pnpm run tunnel:sync              # read the URL from the running agent
 *   pnpm run tunnel:sync <url>        # set it explicitly
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(apiRoot, '../crowdclip-web');
const NGROK_AGENT_API = 'http://127.0.0.1:4040/api/tunnels';

const targets = [
  {
    file: resolve(apiRoot, '.env'),
    variable: 'CROWDCLIP_API_PUBLIC_URL',
    label: 'API',
  },
  {
    file: resolve(webRoot, '.env.local'),
    variable: 'NEXT_PUBLIC_CROWDCLIP_API_URL',
    label: 'web',
  },
];

async function readTunnelUrlFromAgent() {
  let payload;
  try {
    const response = await fetch(NGROK_AGENT_API);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (cause) {
    throw new Error(
      `Could not reach the ngrok agent at ${NGROK_AGENT_API} (${cause.message}). ` +
        'Start ngrok, or pass the URL: pnpm run tunnel:sync <url>',
    );
  }

  const https = (payload.tunnels ?? []).filter((tunnel) =>
    tunnel.public_url?.startsWith('https://'),
  );
  if (https.length === 0) {
    throw new Error('The ngrok agent is running but has no HTTPS tunnel.');
  }
  const apiPort = process.env.PORT ?? '3000';
  const forApi = https.find((tunnel) => tunnel.config?.addr?.endsWith(`:${apiPort}`));
  if (!forApi) {
    const addresses = https.map((tunnel) => tunnel.config?.addr).join(', ');
    throw new Error(
      `No ngrok tunnel forwards to port ${apiPort}. Found: ${addresses || 'none'}.`,
    );
  }
  return forApi.public_url;
}

function normaliseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`"${value}" is not an absolute URL.`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `Instagram requires an HTTPS callback, so the tunnel URL must be https, got "${value}".`,
    );
  }
  return url.origin;
}

async function setVariable({ file, variable, label }, value) {
  let contents;
  try {
    contents = await readFile(file, 'utf8');
  } catch (cause) {
    if (cause.code !== 'ENOENT') throw cause;
    contents = '';
  }

  const line = `${variable}=${value}`;
  const pattern = new RegExp(`^${variable}=.*$`, 'm');
  const previous = pattern.exec(contents)?.[0]?.slice(variable.length + 1);

  if (pattern.test(contents)) {
    contents = contents.replace(pattern, line);
  } else {
    contents = contents.replace(/\n*$/, '\n');
    contents += `\n${line}\n`;
  }

  await writeFile(file, contents);
  const change = previous === value ? 'unchanged' : `was ${previous || 'unset'}`;
  console.log(`  ${label.padEnd(3)}  ${variable}=${value}  (${change})`);
}

async function main() {
  const explicit = process.argv[2];
  const tunnelUrl = normaliseUrl(explicit ?? (await readTunnelUrlFromAgent()));

  console.log(`Tunnel ${tunnelUrl}`);
  for (const target of targets) {
    await setVariable(target, tunnelUrl);
  }

  console.log(
    '\nRestart both dev servers to pick this up, then set the Meta app dashboard to:',
  );
  console.log(`  OAuth redirect URI   ${tunnelUrl}/auth/instagram/callback`);
  console.log(`  Webhook callback URL ${tunnelUrl}/webhooks/instagram`);
}

main().catch((error) => {
  console.error(`sync-tunnel: ${error.message}`);
  process.exit(1);
});
