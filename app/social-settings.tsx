import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Switch, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui';
import { SocialHeader, SocialNotice, socialStyles as s } from '@/components/SocialUI';
import { useSocialQuery } from '@/hooks/useSocialQuery';
import { socialAction, socialErrorText, type SocialPerson, type SocialPreferences } from '@/lib/socialDiscovery';
import { colors } from '@/theme/colors';
import { useApp } from '@/context/AppContext';

export default function SocialSettingsScreen() {
  const { user } = useApp();
  return <SocialSettings key={user?.id} />;
}
function SocialSettings() {
  const prefs = useSocialQuery<SocialPreferences>('preferences');
  const blocks = useSocialQuery<{ people: SocialPerson[] }>('blocks');
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const save = async (next: SocialPreferences) => {
    if (!live.current) return;
    setBusy(true);
    try { await socialAction('set_preferences', next); await prefs.refresh(); }
    catch (e) { if (live.current) Alert.alert('Kaydedilemedi', socialErrorText(e)); }
    finally { if (live.current) setBusy(false); }
  };
  function change(field: keyof SocialPreferences, value: boolean) {
    if (!prefs.data || busy) return;
    const next = { ...prefs.data, [field]: value };
    if (!value) { void save(next); return; }
    Alert.alert(field === 'map_visible' ? 'Haritada görünmek istiyor musun?' : 'Mesaj isteklerini aç?',
      field === 'map_visible'
        ? 'Adın, profil fotoğrafın, mesleğin ve biyografin; check-in yaptığın mekânda diğer giriş yapmış üyelere gösterilir. Kesin GPS konumun paylaşılmaz. Check-out yaptığında veya check-in üzerinden 3 saat geçtiğinde görünürlüğün biter.'
        : 'Haritada görünürken diğer üyeler sana bir mesaj isteği gönderebilir. Kabul etmeden devam edemezler. Kabul edilen sohbetler check-out sonrası da sürer.',
      [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Aç', onPress: () => { void save(next); } }]);
  }
  return <Screen scroll><SocialHeader title="Görünürlük ve mesajlar" />
    <Text style={[s.body, { marginBottom: 18 }]}>Kontrol sende. Konum izni vermek seni otomatik olarak diğer üyelere göstermez.</Text>
    {prefs.loading ? <ActivityIndicator /> : prefs.error ? <SocialNotice text={prefs.error} retry={prefs.refresh} /> : <View style={s.card}>
      <View style={s.row}><View style={{ flex: 1 }}><Text style={s.subtitle}>Haritada görün</Text>
        <Text style={s.muted}>Yalnızca aktif check-in yaptığın mekânda · en fazla 3 saat</Text></View>
        <Switch accessibilityLabel="Haritada görün" value={prefs.data?.map_visible ?? false} disabled={busy}
          onValueChange={(v) => change('map_visible', v)} trackColor={{ true: colors.green }} /></View>
      <View style={s.row}><View style={{ flex: 1 }}><Text style={s.subtitle}>Mesaj istekleri</Text>
        <Text style={s.muted}>Sadece görünür olduğunda yeni istek alırsın.</Text></View>
        <Switch accessibilityLabel="Mesaj isteklerine izin ver" value={prefs.data?.allow_dm_requests ?? false} disabled={busy}
          onValueChange={(v) => change('allow_dm_requests', v)} trackColor={{ true: colors.green }} /></View>
      <Text style={s.muted}>Kapatmak mevcut kabul edilmiş sohbetleri sonlandırmaz. Bir kişinin erişimini kesmek için onu engelle. Diğer cihazlardaki haritalar yenilendiğinde görünürlüğün kalkar.</Text>
    </View>}
    <Text style={s.subtitle}>Engellediklerin</Text>
    {blocks.error ? <SocialNotice text={blocks.error} retry={blocks.refresh} /> : null}
    {blocks.data?.people.length === 0 ? <SocialNotice text="Engellediğin kişi yok." /> : null}
    {blocks.data?.people.map((person) => <View key={person.id} style={s.row}>
      <Avatar uri={person.avatar_url ?? undefined} name={person.first_name} />
      <Text style={[s.body, { flex: 1 }]}>{person.first_name}</Text>
      <Button label="Kaldır" tone="outline" full={false} size="sm" disabled={busy} onPress={() => Alert.alert('Engeli kaldır?',
        'Mevcut sohbetiniz yeniden erişilebilir olur.', [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Kaldır', onPress: async () => {
          if (!live.current) return;
          setBusy(true); try { await socialAction('unblock', { peer_id: person.id }); await blocks.refresh(); }
          catch (e) { Alert.alert('İşlem tamamlanamadı', socialErrorText(e)); } finally { setBusy(false); }
        } }])} />
    </View>)}
  </Screen>;
}
