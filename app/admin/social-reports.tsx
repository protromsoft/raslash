import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { useApp } from '@/context/AppContext';
import { useSocialQuery } from '@/hooks/useSocialQuery';
import { socialAction, socialErrorText } from '@/lib/socialDiscovery';
import { Screen } from '@/components/Screen';
import { SocialHeader, SocialNotice, socialStyles as s } from '@/components/SocialUI';
import { Button } from '@/components/ui';

type Report = { id: string; body: string; reason: string; status: string; created_at: string; reporter_id: string; reported_user_id: string };
export default function DirectMessageReports() {
  const { isAdmin } = useApp();
  const query = useSocialQuery<{ reports: Report[] }>('admin_reports', {}, isAdmin);
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return <Redirect href="/(tabs)/profile" />;
  const resolve = async (report_id: string, status: 'reviewed' | 'dismissed') => {
    setBusy(true);
    try { await socialAction('resolve_report', { report_id, status }); await query.refresh(); }
    catch (e) { Alert.alert('İşlem tamamlanamadı', socialErrorText(e)); }
    finally { setBusy(false); }
  };
  return <Screen><SocialHeader title="DM şikâyetleri" />
    <Text style={[s.muted, { marginBottom: 12 }]}>Yalnızca şikâyet edilen mesajlar gösterilir; özel sohbet geçmişine erişim verilmez. En son 100 kayıt.</Text>
    {query.error ? <SocialNotice text={query.error} retry={query.refresh} /> : <FlatList
      data={query.data?.reports ?? []} keyExtractor={(r) => r.id}
      ListEmptyComponent={<SocialNotice text={query.loading ? 'Yükleniyor…' : 'Şikâyet yok.'} />}
      renderItem={({ item }) => <View style={s.card}>
        <Text style={s.subtitle}>{item.reason} · {item.status}</Text>
        <Text style={s.body}>{item.body}</Text>
        <Text style={s.muted}>{new Date(item.created_at).toLocaleString('tr-TR')}{'\n'}Şikâyet edilen: {item.reported_user_id}</Text>
        <Button label="İncelendi" disabled={busy} onPress={() => void resolve(item.id, 'reviewed')} />
        <Button label="Şikâyeti reddet" tone="outline" disabled={busy} onPress={() => void resolve(item.id, 'dismissed')} />
      </View>} />}
  </Screen>;
}
