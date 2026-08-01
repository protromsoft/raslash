import { Tabs } from 'expo-router';
import { TabBar } from '@/components/TabBar';
import { usePlaces } from '@/context/PlacesContext';
import { colors } from '@/theme/colors';

export default function TabsLayout() {
  const { unreadCount } = usePlaces();

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Harita' }} />
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
