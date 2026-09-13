const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Debug IDs make EAS source maps resolve to readable stack traces. Session
// Replay is intentionally excluded from the web bundle for this privacy-first
// first release.
module.exports = getSentryExpoConfig(__dirname, {
  annotateReactComponents: false,
  includeWebReplay: false,
});
