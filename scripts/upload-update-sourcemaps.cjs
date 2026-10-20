#!/usr/bin/env node
// Upload the exact EAS Update export, never a newly generated replacement.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const paths = args.filter(arg => arg !== '--check');
if (paths.length !== 1 || paths[0].startsWith('-')) {
  fail('Usage: npm run sentry:ota -- /path/to/exact-export [--check]');
}
const exportDir = path.resolve(paths[0]);
// The installed SDK uploader interpolates asset paths into a shell command.
if (!/^[A-Za-z0-9_./-]+$/.test(exportDir)) {
  fail('Use an export directory without spaces or shell metacharacters.');
}
let metadata;
try {
  metadata = JSON.parse(fs.readFileSync(path.join(exportDir, 'metadata.json'), 'utf8'));
} catch {
  fail('Export metadata.json is missing or invalid. Nothing uploaded.');
}
const platforms = ['ios', 'android'].filter(p => metadata.fileMetadata?.[p]);
if (!platforms.length) fail('Export has no iOS or Android bundle. Nothing uploaded.');
for (const platform of platforms) {
  const relativeBundle = metadata.fileMetadata[platform].bundle;
  if (typeof relativeBundle !== 'string' || !/^[A-Za-z0-9_./-]+\.(hbc|js)$/.test(relativeBundle)) {
    fail(`Invalid ${platform} bundle path.`);
  }
  const bundlePath = path.resolve(exportDir, relativeBundle);
  if (!bundlePath.startsWith(exportDir + path.sep) || !fs.existsSync(bundlePath)) {
    fail(`Missing ${platform} bundle inside the export directory.`);
  }
  let map;
  try {
    map = JSON.parse(fs.readFileSync(bundlePath + '.map', 'utf8'));
  } catch {
    fail(`Missing or invalid ${platform} source map. Nothing uploaded.`);
  }
  const debugId = map.debugId || map.debug_id;
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(debugId || '')) {
    fail(`Missing ${platform} source-map debug ID.`);
  }
  if (map.debugId && map.debug_id && map.debugId !== map.debug_id) {
    fail(`Conflicting ${platform} source-map debug IDs.`);
  }
  console.log(`${platform}: ${debugId}`);
}
if (checkOnly) {
  console.log('Export validation passed; no files uploaded.');
  process.exit(0);
}

const token = process.env.SENTRY_OTA_AUTH_TOKEN || process.env.SENTRY_AUTH_TOKEN;
if (!token) fail('Missing SENTRY_OTA_AUTH_TOKEN (or SENTRY_AUTH_TOKEN). Nothing uploaded.');
if (process.env.SENTRY_ORG !== 'protrom' || process.env.SENTRY_PROJECT !== 'raslash') {
  fail('Expected SENTRY_ORG=protrom and SENTRY_PROJECT=raslash. Nothing uploaded.');
}
const result = spawnSync(process.execPath, [
  require.resolve('@sentry/react-native/scripts/expo-upload-sourcemaps.js'), exportDir,
], {
  cwd: path.resolve(__dirname, '..'),
  env: {
    ...process.env,
    SENTRY_AUTH_TOKEN: token,
    SENTRY_URL: 'https://sentry.io',
    EXPO_NO_DOTENV: '1',
  },
  encoding: 'utf8', timeout: 180000, maxBuffer: 10 * 1024 * 1024,
});
const redact = value => String(value || '').split(token).join('[REDACTED]')
  .replace(/(?:sntrys|sntryu)_\S+/g, '[REDACTED]');
process.stdout.write(redact(result.stdout));
process.stderr.write(redact(result.stderr));
if (result.error) console.error('Uploader failed to start or timed out. Check Sentry before retrying.');
process.exit(result.status ?? 1);
