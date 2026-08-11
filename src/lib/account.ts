import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type DeleteAccountResponse = {
  deleted?: boolean;
  message?: string;
};

/**
 * Permanently deletes the signed-in account through the authenticated Edge
 * Function. The service-role credential stays on Supabase and is never shipped
 * in the mobile bundle.
 */
export async function deleteCurrentAccount(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Hesap silme yalnızca canlı hesaplarda kullanılabilir.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (sessionError || !session) {
    throw new Error('Oturumun sona ermiş. Tekrar giriş yapıp yeniden dene.');
  }

  const { data, error } = await supabase.functions.invoke<DeleteAccountResponse>(
    'delete-account',
    {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { confirmation: 'DELETE' },
    },
  );

  if (error) {
    throw new Error('Hesap şu anda silinemedi. Lütfen biraz sonra tekrar dene.');
  }
  if (!data?.deleted) {
    throw new Error(data?.message || 'Hesap silme işlemi tamamlanamadı.');
  }

  // The remote user no longer exists. Clear the still-cached JWT locally so it
  // cannot be reused on this device during its remaining lifetime.
  await supabase.auth.signOut({ scope: 'local' });
}
