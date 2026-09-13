import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function redactEmails(value: string) {
  return value.replace(EMAIL_PATTERN, '[email removed]');
}

/**
 * Crash reports deliberately exclude screenshots, view hierarchy, request
 * payloads, console breadcrumbs and user PII. App code must also avoid adding
 * chat text or coordinates through Sentry.setExtra/addBreadcrumb.
 */
export function initializeSentry() {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
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
        message: breadcrumb.message ? redactEmails(breadcrumb.message) : undefined,
        // Network/navigation metadata can help reproduce a crash, but arbitrary
        // breadcrumb data may contain chat text or exact coordinates.
        data: undefined,
      };
    },
    beforeSend(event) {
      event.user = undefined;
      event.request = undefined;
      event.extra = undefined;
      event.message = event.message ? redactEmails(event.message) : undefined;
      event.exception?.values?.forEach((exception) => {
        if (exception.value) exception.value = redactEmails(exception.value);
      });
      return event;
    },
  });
}

export { Sentry };
