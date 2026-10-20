import { Tabs } from 'expo-router';
import { TabBar } from '@/components/TabBar';
import { usePlaces } from '@/context/PlacesContext';
import { colors } from '@/theme/colors';
import { useSocialQuery } from '@/hooks/useSocialQuery';
import type { DirectThread } from '@/lib/socialDiscovery';

export default function TabsLayout() {
  const { unreadCount } = usePlaces();
  const inbox = useSocialQuery<{ threads: DirectThread[] }>('inbox');
  const dmUnread = inbox.data?.threads.reduce((sum, thread) => sum + thread.unread, 0) ?? 0;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Harita' }} />
      <Tabs.Screen name="messages" options={{ title: 'Mesajlar', tabBarBadge: dmUnread > 0 ? (dmUnread > 99 ? '99+' : dmUnread) : undefined }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Bildirim',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
