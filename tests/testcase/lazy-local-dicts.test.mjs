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
            resolve({ status: res.statusCode, body: body });
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
      // ignore and retry
    }
    await sleep(300);
  }
  throw new Error('Server did not become ready in time');
}

async function main() {
  const server = spawn('node', ['dist/app.js'], {
    env: {
      ...process.env,
      LOCAL_DICT_IDLE_RELEASE_MS: '10000',
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

    // Case 1: EN dictionaries loaded at startup, JP not loaded.
    const startupLog = stdout;
    assert.match(startupLog, /\[ECDICT\] Database opened:/, 'ECDICT should load at startup');
    assert.match(startupLog, /oxford_en_mac/, 'Oxford should be configured/logged at startup');
    assert.match(startupLog, /\[LAZY-DICT\] deferred provider="jaen_mac"/, 'jaen_mac should be deferred');
    assert.ok(!startupLog.includes('loading provider="jaen_mac"'), 'jaen_mac must not load before JP request');

    const healthStartup = await request('/health');
    assert.equal(healthStartup.status, 200, 'health should be reachable');
    const startupProviders = new Set((healthStartup.body.providers || []).map((p) => p.name));
    assert.ok(startupProviders.has('ecdict'), 'ecdict should be registered at startup');
    assert.ok(startupProviders.has('oxford_en_mac'), 'oxford_en_mac should be registered at startup');
    assert.ok(!startupProviders.has('jaen_mac'), 'jaen_mac should not be registered at startup');

    // Case 1.1: EN definitions should remain plain text (no raw HTML payload).
    const enNot = await request('/api/v2/entries/en/not');
    assert.equal(enNot.status, 200, 'EN lookup should succeed');
    assert.ok(Array.isArray(enNot.body.definitions) && enNot.body.definitions.length > 0, 'EN definitions should exist');
    assert.ok(!/<[^>]+>/.test(enNot.body.definitions[0].definition || ''), 'EN definition must be plain text, not HTML');

    // Case 2: JP dictionary loads on first request and is reused on second request.
    const jaFirst = await request('/api/v2/entries/ja/hello');
    assert.equal(jaFirst.status, 200, 'first JP lookup should succeed');
    assert.equal(jaFirst.body.source, 'jaen_mac', 'first JP lookup should use jaen_mac');

    const firstLoadCount = (stdout.match(/\[LAZY-DICT\] loading provider="jaen_mac"/g) || []).length;
    assert.equal(firstLoadCount, 1, 'jaen_mac should load exactly once after first JP request');

    const t0 = Date.now();
    const jaSecond = await request('/api/v2/entries/ja/hello');
    const elapsedSecond = Date.now() - t0;
    assert.equal(jaSecond.status, 200, 'second JP lookup should succeed');
    assert.equal(jaSecond.body.source, 'jaen_mac', 'second JP lookup should still use jaen_mac');
    assert.ok(elapsedSecond < 300, `second JP lookup should be fast, got ${elapsedSecond}ms`);

    const secondLoadCount = (stdout.match(/\[LAZY-DICT\] loading provider="jaen_mac"/g) || []).length;
    assert.equal(secondLoadCount, 1, 'jaen_mac should not reload on consecutive JP requests');

    // Case 3: release on idle timeout (10s in test env).
    await sleep(11500);
    assert.match(stdout, /\[LAZY-DICT\] unloaded provider="jaen_mac" reason=idle_timeout/, 'jaen_mac should unload after idle timeout');

    const healthAfterUnload = await request('/health');
    assert.equal(healthAfterUnload.status, 200, 'health should be reachable after unload');
    const providersAfterUnload = new Set((healthAfterUnload.body.providers || []).map((p) => p.name));
    assert.ok(!providersAfterUnload.has('jaen_mac'), 'jaen_mac should be unregistered after idle unload');

    // Case 4: reload after release.
    const jaThird = await request('/api/v2/entries/ja/hello');
    assert.equal(jaThird.status, 200, 'third JP lookup should succeed after reload');
    assert.equal(jaThird.body.source, 'jaen_mac', 'third JP lookup should use jaen_mac after reload');

    const thirdLoadCount = (stdout.match(/\[LAZY-DICT\] loading provider="jaen_mac"/g) || []).length;
    assert.equal(thirdLoadCount, 2, 'jaen_mac should load again after idle release');

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: [
            'en startup dictionaries loaded',
            'jp lazy load on first request',
            'jp no duplicate load on second request',
            'jp idle release at 10s',
            'jp reload after release',
          ],
          secondLookupElapsedMs: elapsedSecond,
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
