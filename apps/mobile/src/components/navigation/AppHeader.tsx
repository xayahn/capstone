import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '../ui';
import { colors, fonts, spacing } from '../../theme';

export interface AppHeaderProps {
  title: string;
  isRoot: boolean;
  unreadCount: number;
  onBack: () => void;
  onNotifications: () => void;
}

export const AppHeader = ({
  title,
  isRoot,
  unreadCount,
  onBack,
  onNotifications,
}: AppHeaderProps) => (
  <LinearGradient colors={[colors.leatherDark, colors.oxblood]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
    <View style={styles.headerSide}>
      {isRoot ? (
        <BrandMark compact />
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={23} color={colors.paperLight} />
        </Pressable>
      )}
    </View>
    <View style={styles.headerCopy}>
      <Text style={styles.headerEyebrow}>{isRoot ? 'Archdiocese of San Fernando' : 'Parishioner portal'}</Text>
      <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
    </View>
    <View style={styles.headerSide}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${unreadCount} unread notifications`}
        onPress={onNotifications}
        style={styles.headerButton}
      >
        <Ionicons name={unreadCount ? 'notifications' : 'notifications-outline'} size={22} color={colors.paperLight} />
        {unreadCount ? (
          <View style={styles.unreadDot}>
            <Text style={styles.unreadDotText}>{Math.min(9, unreadCount)}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  </LinearGradient>
);

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomColor: colors.gold,
    borderBottomWidth: 1,
    flexDirection: 'row',
    minHeight: 70,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerSide: { alignItems: 'center', width: 48 },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xs },
  headerEyebrow: { color: colors.goldSoft, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase' },
  headerTitle: { color: colors.card, fontFamily: fonts.displayBold, fontSize: 23, lineHeight: 27 },
  unreadDot: {
    alignItems: 'center',
    backgroundColor: colors.goldSoft,
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 2,
    top: 2,
    width: 16,
  },
  unreadDotText: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 9 },
});
