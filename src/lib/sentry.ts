import * as Sentry from '@sentry/react-native';
import * as Device from 'expo-device';
import { redactAuthSecrets } from '@/lib/redactAuthSecrets';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

type StartupStage =
  | 'fonts_loading'
  | 'fonts_ready'
  | 'fonts_fallback'
  | 'cache_loading'
  | 'session_loading'
  | 'purchases_configuring'
  | 'profile_loading'
  | 'entitlement_loading'
  | 'bootstrap_ready'
  | 'bootstrap_failed'
  | 'routing_login'
  | 'routing_onboarding'
  | 'routing_main';

/** Fixed labels only: never pass emails, route parameters, chat text or GPS. */
export function recordStartupStage(stage: StartupStage) {
  if (!dsn) return;
  Sentry.setTag('startup.stage', stage);
  Sentry.addBreadcrumb({ category: 'app.startup', message: stage, level: 'info' });
}

export function recordMemoryWarning() {
  if (!dsn) return;
  // A breadcrumb, not a new error per warning. The native crash report can
  // retain it without collecting memory dumps, app contents or device paths.
  Sentry.addBreadcrumb({
    category: 'device.memory', message: 'os_memory_warning', level: 'warning',
  });
}

/**
 * Crash reports deliberately exclude screenshots, view hierarchy, request
 * payloads, console breadcrumbs and user PII. App code must also avoid adding
 * chat text or coordinates through Sentry.setExtra/addBreadcrumb.
 */
export function initializeSentry() {
  Sentry.init({
    dsn,
    // Simulators and emulators report startup hangs from test runs as user
    // errors (RASLASH-9…G were all the iOS simulator); real devices only.
    enabled: Boolean(dsn) && Device.isDevice,
    debug: false,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoPerformanceTracing: false,
    enableCaptureFailedRequests: false,
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    maxBreadcrumbs: 30,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') return null;
      return {
        ...breadcrumb,
        message: breadcrumb.message ? redactAuthSecrets(breadcrumb.message) : undefined,
        // Network/navigation metadata can help reproduce a crash, but arbitrary
        // breadcrumb data may contain chat text or exact coordinates.
        data: undefined,
      };
    },
    beforeSend(event) {
      event.user = undefined;
      event.request = undefined;
      event.extra = undefined;
      event.message = event.message ? redactAuthSecrets(event.message) : undefined;
      event.exception?.values?.forEach((exception) => {
        if (exception.value) exception.value = redactAuthSecrets(exception.value);
      });
      return event;
    },
  });
}

export { Sentry };
