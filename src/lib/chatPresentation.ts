import type { ChatPerson } from '../data/types';

export type ChatMessage = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  avatarUrl?: string;
  mine?: boolean;
  pending?: boolean;
  userId?: string;
  /** Storage path in the private `chat-photos` bucket. */
  photoPath?: string;
  /** On-device file shown while our own photo uploads (and after, to avoid a flash). */
  localPhotoUri?: string;
};

export type ChatRow = { message: ChatMessage; grouped: boolean };
const GROUP_WINDOW_MS = 5 * 60_000;

export function buildChatRows(messages: ChatMessage[], people: ChatPerson[]): ChatRow[] {
  const profiles = new Map(people.map((person) => [person.id, person]));
  return messages.map((original, index) => {
    const person = original.userId ? profiles.get(original.userId) : undefined;
    const message = person ? {
      ...original,
      author: person.firstName,
      avatarUrl: person.avatarUrl,
    } : original;
    const previous = messages[index - 1];
    const elapsed = previous ? Date.parse(message.createdAt) - Date.parse(previous.createdAt) : NaN;
    // Display names are not identity: two people named Ali need separate avatars.
    const sameSpeaker = !!previous && !!message.userId && previous.userId === message.userId &&
      !!previous.mine === !!message.mine;
    return { message, grouped: sameSpeaker && elapsed >= 0 && elapsed < GROUP_WINDOW_MS };
  });
}
