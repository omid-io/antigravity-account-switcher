import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSemver, getCurrentVersion } from '../src/sidecar/update-checker.js';

test('compareSemver accurately evaluates version precedence', () => {
  assert.equal(compareSemver('1.2.0', '1.1.0'), 1);
  assert.equal(compareSemver('1.1.0', '1.2.0'), -1);
  assert.equal(compareSemver('1.1.0', '1.1.0'), 0);
  assert.equal(compareSemver('v2.0.0', '1.9.9'), 1);
  assert.equal(compareSemver('1.0.5', '1.0.10'), -1);
});

test('getCurrentVersion returns package semver', () => {
  const ver = getCurrentVersion();
  assert.ok(typeof ver === 'string');
  assert.ok(/^\d+\.\d+\.\d+/.test(ver), `Version should be valid semver: ${ver}`);
});
