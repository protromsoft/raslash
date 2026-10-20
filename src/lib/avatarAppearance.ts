// Dark, deterministic backgrounds keep the white initial readable. No random
// portraits: an absent/broken photo must never imply a different identity.
const AVATAR_COLORS = ['#355C50', '#345A78', '#715475', '#85512D', '#4E586B', '#756029'];

export function avatarAppearance(name?: string, uri?: string) {
  const label = name?.trim() || '';
  let hash = 0;
  for (const char of label.toLocaleLowerCase('tr-TR')) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  const source = uri?.trim() || '';
  return {
    initial: Array.from(label)[0]?.toLocaleUpperCase('tr-TR') || '?',
    backgroundColor: AVATAR_COLORS[hash % AVATAR_COLORS.length],
    uri: /^(https?:\/\/|file:\/\/|content:\/\/|ph:\/\/|data:image\/)/i.test(source)
      ? source
      : undefined,
  };
}
