export function normalizeInstagram(value?: string | null) {
  if (!value) return '';
  return value
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/$/, '')
    .split('?')[0];
}

export function normalizeLinkedIn(value?: string | null) {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/(in\/)?/i, '')
    .replace(/\/$/, '');
  return handle ? `https://www.linkedin.com/in/${handle}` : '';
}

export function instagramUrl(value?: string | null) {
  const handle = normalizeInstagram(value);
  return handle ? `https://instagram.com/${handle}` : null;
}

export function linkedInUrl(value?: string | null) {
  const url = normalizeLinkedIn(value);
  return url || null;
}
