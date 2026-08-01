module.exports = function (api) {
  api.cache(true);
  // babel-preset-expo already applies the Reanimated 4 / worklets transform,
  // so listing it manually would run it twice.
  return {
    presets: ['babel-preset-expo'],
  };
};
