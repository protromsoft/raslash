/** A deep-link URL can contain a one-use credential, not just a harmless route. */
export function redactAuthSecrets(value: string) {
  return value
    .replace(/\b(?:https?:\/\/|raslash:\/\/)[^\s<>"']*(?:[?&#](?:code|token|token_hash|access_token|refresh_token|code_verifier|auth_code)=)[^\s<>"']*/gi, '[auth link removed]')
    .replace(/((?:\b|[?&#])(?:code|token|token_hash|access_token|refresh_token|code_verifier|auth_code)\s*[=:]\s*)[^\s&,;"']+/gi, '$1[removed]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [removed]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]');
}
