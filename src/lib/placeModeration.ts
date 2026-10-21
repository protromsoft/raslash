import { supabase } from '@/lib/supabase';

/**
 * Private bucket that holds place-chat photos (stories); same value as
 * `CHAT_PHOTO_BUCKET` in placePhotos, kept here so this module stays free of
 * the camera/picker imports.
 */
const CHAT_PHOTO_BUCKET = 'chat-photos';

/** One reported place-chat message, as `admin_place_message_reports` returns it. */
export type PlaceMessageReport = {
  reportId: string;
  reason: string;
  reportedAt: string;
  reportCount: number;
  messageId: string;
  placeId: string;
  placeName: string;
  authorId: string;
  authorName: string;
  body: string;
  photoPath?: string;
  messageCreatedAt: string;
  removedAt?: string;
};

type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => PromiseLike<{ data: unknown; error: { message: string; statusCode?: string | number } | null }>;
    };
  };
};

function client(override?: RpcClient): RpcClient {
  const c = override ?? (supabase as unknown as RpcClient | null);
  if (!c) throw new Error('Sunucu bağlantısı yok.');
  return c;
}

function text(value: unknown) {
  return value == null ? '' : String(value);
}

export function toPlaceMessageReport(row: Record<string, unknown>): PlaceMessageReport {
  return {
    reportId: text(row.report_id),
    reason: text(row.reason),
    reportedAt: text(row.reported_at),
    reportCount: Number(row.report_count ?? 1) || 1,
    messageId: text(row.message_id),
    placeId: text(row.place_id),
    placeName: text(row.place_name) || 'Mekân',
    authorId: text(row.author_id),
    authorName: text(row.author_name).trim() || 'Misafir',
    body: text(row.body),
    photoPath: row.photo_path ? String(row.photo_path) : undefined,
    messageCreatedAt: text(row.message_created_at),
    removedAt: row.removed_at ? String(row.removed_at) : undefined,
  };
}

export async function fetchPlaceMessageReports(override?: RpcClient): Promise<PlaceMessageReport[]> {
  const { data, error } = await client(override).rpc('admin_place_message_reports');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toPlaceMessageReport);
}

/** A file that is already gone is not a reason to keep the message up. */
export function isStorageNotFound(error: { message?: string; statusCode?: string | number } | null) {
  if (!error) return false;
  if (String(error.statusCode ?? '') === '404') return true;
  return /not.?found|does not exist/i.test(error.message ?? '');
}

/**
 * Deletes the photo file first (so a removed story can't be fetched with an
 * old signed link for long), then hides the message and closes its reports.
 */
export async function removePlaceMessage(
  report: Pick<PlaceMessageReport, 'messageId' | 'photoPath'>,
  override?: RpcClient,
) {
  const c = client(override);
  if (report.photoPath) {
    const { error } = await c.storage.from(CHAT_PHOTO_BUCKET).remove([report.photoPath]);
    if (error && !isStorageNotFound(error)) throw new Error(error.message);
  }
  const { error } = await c.rpc('admin_remove_place_message', { target_message_id: report.messageId });
  if (error) throw new Error(error.message);
}

export async function dismissPlaceMessageReports(messageId: string, override?: RpcClient) {
  const { error } = await client(override).rpc('admin_dismiss_place_message_reports', {
    target_message_id: messageId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Deletes a photo from your own story: the file first (owner policy
 * "Members delete own chat photos"), then hides the message row.
 */
export async function removeOwnStoryPhoto(
  item: { messageId: string; photoPath: string },
  override?: RpcClient,
) {
  const c = client(override);
  const { error: storageError } = await c.storage.from(CHAT_PHOTO_BUCKET).remove([item.photoPath]);
  if (storageError && !isStorageNotFound(storageError)) throw new Error(storageError.message);
  const { error } = await c.rpc('remove_own_story_photo', { target_message_id: item.messageId });
  if (error) throw new Error(error.message);
}
