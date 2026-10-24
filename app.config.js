// Expo SDK 54 reads app.json first and passes it to this dynamic config.
// A standalone Android build needs the Google Maps SDK key in its native
// manifest; Expo Go's built-in key does not carry over to an EAS APK/AAB.
const { withAndroidManifest } = require('expo/config-plugins');

/**
 * The camera is optional: stories and rating photos need it, everything else
 * works without one. CAMERA permission alone makes Play require the hardware
 * and drop camera-less tablets, Chromebooks and car screens (433 devices on 1.0.7).
 */
function withOptionalCamera(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const features = manifest['uses-feature'] ?? [];
    for (const name of ['android.hardware.camera', 'android.hardware.camera.autofocus']) {
      const existing = features.find((f) => f.$?.['android:name'] === name);
      if (existing) existing.$['android:required'] = 'false';
      else features.push({ $: { 'android:name': name, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = features;
    return mod;
  });
}

module.exports = ({ config: base }) => {
  const config = withOptionalCamera(base);
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
