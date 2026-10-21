import type { ChatMessage } from './chatPresentation';

/**
 * Place chat photos are shown as Instagram-style stories on the people strip,
 * never as chat bubbles. Pure helpers so the grouping rules stay testable.
 */
export const STORY_WINDOW_MS = 24 * 60 * 60_000;

export type StoryItem = {
  id: string;
  photoPath?: string;
  /** Our own just-taken shot, shown from the device while it uploads. */
  localPhotoUri?: string;
  caption: string;
  createdAt: string;
  pending?: boolean;
};

export type PersonStory = {
  userId: string;
  author: string;
  avatarUrl?: string;
  mine: boolean;
  /** Oldest first, so the viewer plays them in the order they were taken. */
  items: StoryItem[];
  latestAt: number;
};

/** A message that carries a photo belongs to the story row, not the transcript. */
export function isPhotoMessage(message: Pick<ChatMessage, 'photoPath' | 'localPhotoUri'>) {
  return !!(message.photoPath || message.localPhotoUri);
}

/**
 * Groups photo messages from the last 24 hours into one story per person.
 * Items are ordered oldest to newest; people are ordered by their newest photo,
 * most recent first. Messages without a user id cannot be attributed and are
 * skipped, as are future timestamps beyond a small clock-skew allowance.
 */
export function groupPhotoStories(
  messages: ChatMessage[],
  now: number,
  windowMs: number = STORY_WINDOW_MS,
): PersonStory[] {
  const byUser = new Map<string, PersonStory>();
  for (const message of messages) {
    if (!message.userId || !isPhotoMessage(message)) continue;
    const at = Date.parse(message.createdAt);
    if (!Number.isFinite(at) || now - at >= windowMs || at - now > 5 * 60_000) continue;
    let story = byUser.get(message.userId);
    if (!story) {
      story = {
        userId: message.userId,
        author: message.author,
        avatarUrl: message.avatarUrl,
        mine: !!message.mine,
        items: [],
        latestAt: at,
      };
      byUser.set(message.userId, story);
    }
    story.items.push({
      id: message.id,
      photoPath: message.photoPath,
      localPhotoUri: message.localPhotoUri,
      caption: message.text.trim(),
      createdAt: message.createdAt,
      pending: message.pending,
    });
    if (at >= story.latestAt) {
      story.latestAt = at;
      // The newest message carries the freshest name and avatar.
      story.author = message.author || story.author;
      story.avatarUrl = message.avatarUrl ?? story.avatarUrl;
    }
  }
  const stories = [...byUser.values()];
  for (const story of stories) {
    story.items.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }
  return stories.sort((a, b) => b.latestAt - a.latestAt);
}

/** Our own story never needs a "new" ring; anyone else's does until every photo was seen. */
export function isStorySeen(story: PersonStory, seenIds: ReadonlySet<string>) {
  return story.mine || story.items.every((item) => seenIds.has(item.id));
}

/** Resume at the first unseen photo, or from the start when all were seen. */
export function storyStartIndex(story: PersonStory, seenIds: ReadonlySet<string>) {
  const index = story.items.findIndex((item) => !seenIds.has(item.id));
  return index < 0 ? 0 : index;
}

/**
 * Story row order: you first, then people with unseen stories, then seen
 * stories, then everyone else. The incoming order is kept within each group.
 */
export function orderStoryRow<P extends { id: string; isMe?: boolean }>(
  people: P[],
  stories: PersonStory[],
  seenIds: ReadonlySet<string>,
): P[] {
  const storyOf = new Map(stories.map((story) => [story.userId, story]));
  const rank = (person: P) => {
    if (person.isMe) return 0;
    const story = storyOf.get(person.id);
    if (!story) return 3;
    return isStorySeen(story, seenIds) ? 2 : 1;
  };
  return people
    .map((person, index) => ({ person, index, rank: rank(person) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ person }) => person);
}

/** "şimdi", "12 dk önce", "2 sa önce". */
export function formatStoryAge(iso: string, now: number) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return 'şimdi';
  if (minutes < 60) return `${minutes} dk önce`;
  return `${Math.floor(minutes / 60)} sa önce`;
}

/** How a person's avatar is ringed in the story row. */
export type StoryRing = 'none' | 'unseen' | 'seen';

export function storyRing(story: PersonStory | undefined, seenIds: ReadonlySet<string>): StoryRing {
  if (!story || story.items.length === 0) return 'none';
  return isStorySeen(story, seenIds) ? 'seen' : 'unseen';
}

/** Seen photo ids kept on the device; only the newest ones matter after 24 hours. */
export const SEEN_STORIES_KEY = 'raslash.seenStories';
export const SEEN_STORIES_LIMIT = 300;

/** Reads the stored list defensively: anything that is not a string array is ignored. */
export function parseSeenIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Appends newly seen ids (oldest first) and keeps only the latest `limit`. */
export function addSeenIds(stored: string[], ids: string[], limit: number = SEEN_STORIES_LIMIT): string[] {
  const fresh = ids.filter((id, index) => id && !stored.includes(id) && ids.indexOf(id) === index);
  const next = fresh.length ? [...stored, ...fresh] : stored;
  return next.length > limit ? next.slice(next.length - limit) : next;
}
