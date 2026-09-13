const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

// Backport iOS map insertion and Android Fabric marker bitmap fixes to 1.20.1.
const projectRoot = resolve(__dirname, '..');
const packagePath = join(projectRoot, 'node_modules/react-native-maps/package.json');
const patchPath = join(__dirname, 'react-native-maps+1.20.1.patch');

const installedVersion = JSON.parse(readFileSync(packagePath, 'utf8')).version;
if (installedVersion !== '1.20.1') {
  throw new Error(`react-native-maps patch targets 1.20.1, found ${installedVersion}`);
}

function gitApply(args) {
  const result = spawnSync('git', ['apply', ...args, patchPath], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result;
}

const files = [
  'node_modules/react-native-maps/ios/AirMaps/AIRMap.m',
  'node_modules/react-native-maps/android/src/main/java/com/rnmaps/maps/MapMarker.java',
];

for (const file of files) {
  const include = `--include=${file}`;
  if (gitApply(['--check', include]).status === 0) {
    const result = gitApply([include]);
    if (result.status !== 0) {
      throw new Error(`Failed to patch ${file}:\n${result.stderr}`);
    }
    console.log(`Applied react-native-maps 1.20.1 patch to ${file}.`);
  } else if (gitApply(['--reverse', '--check', include]).status === 0) {
    console.log(`react-native-maps 1.20.1 patch already applied to ${file}.`);
  } else {
    throw new Error(`react-native-maps 1.20.1 patch no longer matches ${file}.`);
  }
}
