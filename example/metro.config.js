const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');

const pak = require('../package.json');

const root = path.resolve(__dirname, '..');
const modules = Object.keys({
  ...pak.peerDependencies,
});

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

const config = getDefaultConfig(__dirname);

config.watchFolders = [root];
config.resolver.blockList = modules.map(
  (name) =>
    new RegExp(
      `^${escapeRegExp(path.join(root, 'node_modules', name))}\\/.*$`,
    ),
);
config.resolver.extraNodeModules = modules.reduce((acc, name) => {
  acc[name] = path.join(__dirname, 'node_modules', name);
  return acc;
}, {});

module.exports = config;
