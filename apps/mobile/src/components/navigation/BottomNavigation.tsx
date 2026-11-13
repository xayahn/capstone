import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../../theme';

export type MainNavTab = 'home' | 'services' | 'appointments' | 'assistant' | 'more';

export interface BottomNavigationProps {
  active: string;
  onNavigate: (tab: MainNavTab) => void;
}

interface NavItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}

const NavItem = ({ icon, activeIcon, label, active, onPress }: NavItemProps) => (
  <Pressable
    accessibilityRole="tab"
    accessibilityLabel={label}
    accessibilityState={{ selected: active }}
    onPress={onPress}
    style={styles.navItem}
  >
    <Ionicons name={active ? activeIcon : icon} size={25} color={active ? colors.oxblood : colors.inkSoft} />
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
  </Pressable>
);

export const BottomNavigation = ({ active, onNavigate }: BottomNavigationProps) => (
  <SafeAreaView edges={['bottom']} style={styles.bottomSafe}>
    <View style={styles.bottomNav} accessibilityRole="tablist">
      <NavItem icon="home-outline" activeIcon="home" label="Home" active={active === 'home'} onPress={() => onNavigate('home')} />
      <NavItem icon="grid-outline" activeIcon="grid" label="Services" active={active === 'services'} onPress={() => onNavigate('services')} />
      <NavItem icon="calendar-outline" activeIcon="calendar" label="Appointments" active={active === 'appointments'} onPress={() => onNavigate('appointments')} />
      <NavItem icon="sparkles-outline" activeIcon="sparkles" label="Assistant" active={active === 'assistant'} onPress={() => onNavigate('assistant')} />
      <NavItem icon="ellipsis-horizontal-circle-outline" activeIcon="ellipsis-horizontal-circle" label="More" active={active === 'more'} onPress={() => onNavigate('more')} />
    </View>
  </SafeAreaView>
);

const styles = StyleSheet.create({
  bottomSafe: { backgroundColor: colors.card },
  bottomNav: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', minHeight: 68 },
  navItem: { alignItems: 'center', flex: 1, gap: 3, justifyContent: 'center', minHeight: 64 },
  navLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  navLabelActive: { color: colors.oxblood, fontFamily: fonts.bodyBold },
});
