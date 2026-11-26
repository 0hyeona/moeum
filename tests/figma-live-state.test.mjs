import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code = ts.transpileModule(await readFile(new URL('../src/data/figmaLiveState.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { figmaLiveState, remainingTime } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const now = Date.parse('2026-11-25T12:00:00Z');
const status = { enabled: true, connected: false, expires_at: null, last_received_at: null };
const pairing = { code: 'test', expires_at: '2026-11-25T12:10:00Z' };

test('unused code expires at its deadline and the countdown stops at zero', () => {
  assert.equal(figmaLiveState(undefined, undefined, now), 'idle');
  assert.equal(figmaLiveState(status, pairing, now), 'waiting');
  assert.equal(remainingTime(pairing.expires_at, now), '10:00');
  assert.equal(figmaLiveState(status, pairing, now + 600000), 'code-expired');
  assert.equal(remainingTime(pairing.expires_at, now + 610000), '0:00');
});

test('a redeemed code deadline cannot expire an active eight-hour session', () => {
  const connected = { ...status, connected: true, expires_at: '2026-11-25T20:00:00Z' };
  assert.equal(figmaLiveState(connected, pairing, now + 600001), 'baseline');
  assert.equal(figmaLiveState({ ...connected, last_received_at: '2026-11-25T12:01:00Z' }, pairing, now + 600001), 'connected');
  assert.equal(figmaLiveState(connected, pairing, now + 8 * 3600000), 'expired');
  assert.equal(figmaLiveState({ ...connected, connected: false }, undefined, now + 8 * 3600000), 'expired');
});
