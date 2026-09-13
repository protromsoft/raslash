// Expo SDK 54 reads app.json first and passes it to this dynamic config.
// A standalone Android build needs the Google Maps SDK key in its native
// manifest; Expo Go's built-in key does not carry over to an EAS APK/AAB.
module.exports = ({ config }) => {
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();

  if (process.env.EAS_BUILD_PLATFORM === 'android' && !androidMapsKey) {
    throw new Error(
      'Android EAS build requires GOOGLE_MAPS_ANDROID_API_KEY in its EAS environment.',
    );
  }

  if (!androidMapsKey) return config;

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: androidMapsKey,
        },
      },
    },
  };
};
