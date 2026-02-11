import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: 9000,
        path: pathname,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );

    req.on('error', reject);
  });
}

async function waitForServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const health = await request('/health');
      if (health.status === 200) return;
    } catch {
      // retry
    }
    await sleep(300);
  }
  throw new Error('Server did not become ready in time');
}

async function main() {
  const server = spawn('node', ['dist/app.js'], {
    env: {
      ...process.env,
      DISABLE_LOCAL_DICTS: '1',
      DISABLE_GOOGLE_SEARCH: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  server.stdout.on('data', (data) => (stdout += data.toString()));
  server.stderr.on('data', (data) => (stderr += data.toString()));

  try {
    await waitForServer();
    await sleep(500);

    const enNot = await request('/api/v2/entries/en/not');
    assert.equal(enNot.status, 200, 'fallback should return data for common EN word');
    assert.equal(enNot.body.source, 'google', 'fallback source should remain "google" for compatibility');
    assert.ok(Array.isArray(enNot.body.definitions) && enNot.body.definitions.length > 0, 'fallback should contain definitions');

    assert.match(stdout, /\[LOOKUP\] local dictionaries disabled, force fallback provider="google"/);
    assert.match(stdout, /\[GOOGLE\] Querying dictionaryapi\.dev/);
    assert.doesNotMatch(stdout, /fallback to legacy google scraping/, 'legacy google scraping must remain disabled');

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: [
            'fallback works with dictionaryapi.dev',
            'local dictionaries bypassed by DISABLE_LOCAL_DICTS',
            'legacy google scraping disabled by DISABLE_GOOGLE_SEARCH',
          ],
          sample: {
            word: enNot.body.word,
            source: enNot.body.source,
            definitions: enNot.body.definitions.length,
          },
          stderrHead: stderr.split('\n').filter(Boolean).slice(0, 5),
        },
        null,
        2
      )
    );
  } finally {
    server.kill('SIGTERM');
    await sleep(500);
  }
}

main().catch((error) => {
  console.error('[TEST FAILED]', error?.message || error);
  process.exit(1);
});
