import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radii, shadow, spacing, type } from '../theme';
import type { StatusTone } from '../lib/status';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const BrandMark = ({ compact = false }: { compact?: boolean }) => (
  <View style={[styles.brandMark, compact && styles.brandMarkCompact]} accessible accessibilityLabel="ParishLink cross emblem">
    <View style={styles.brandCross}>
      <Ionicons name="add" size={compact ? 18 : 30} color={colors.goldSoft} />
    </View>
  </View>
);

export const Card = ({
  children,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) => (
  <View
    style={[styles.card, style]}
    accessible={Boolean(accessibilityLabel)}
    accessibilityLabel={accessibilityLabel}
  >
    {children}
  </View>
);

export const Eyebrow = ({ children, light = false }: { children: ReactNode; light?: boolean }) => (
  <Text style={[type.label, light && styles.eyebrowLight]}>{children}</Text>
);

export const SectionTitle = ({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) => (
  <View style={styles.sectionTitleRow}>
    <Text accessibilityRole="header" style={[type.heading, styles.sectionTitleText]}>{children}</Text>
    {action}
  </View>
);

export const AppButton = ({
  label,
  icon,
  variant = 'primary',
  loading = false,
  style,
  ...props
}: PressableProps & {
  label: string;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}) => (
  <Pressable
    {...props}
    accessibilityRole="button"
    accessibilityLabel={props.accessibilityLabel ?? label}
    accessibilityState={{
      ...props.accessibilityState,
      busy: loading,
      disabled: Boolean(props.disabled),
    }}
    style={({ pressed }) => [
      styles.button,
      styles[`button_${variant}`],
      pressed && styles.pressed,
      props.disabled && styles.disabled,
      style as StyleProp<ViewStyle>,
    ]}
  >
    {loading ? (
      <ActivityIndicator color={variant === 'primary' ? colors.card : colors.oxblood} />
    ) : (
      <>
        {icon ? (
          <Ionicons
            name={icon}
            size={19}
            color={variant === 'primary' ? colors.card : variant === 'danger' ? colors.red : colors.oxblood}
          />
        ) : null}
        <Text style={[styles.buttonLabel, styles[`buttonLabel_${variant}`]]}>{label}</Text>
      </>
    )}
  </Pressable>
);

const toneStyles: Record<StatusTone, { backgroundColor: string; color: string }> = {
  neutral: { backgroundColor: colors.paperLight, color: colors.inkSoft },
  warning: { backgroundColor: colors.amberSoft, color: '#764A0E' },
  positive: { backgroundColor: colors.greenSoft, color: colors.green },
  critical: { backgroundColor: colors.redSoft, color: colors.red },
  info: { backgroundColor: colors.goldSoft, color: '#775315' },
};

export const StatusBadge = ({ label, tone }: { label: string; tone: StatusTone }) => {
  const palette = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.backgroundColor }]}>
      <Text style={[styles.badgeText, { color: palette.color }]}>{label}</Text>
    </View>
  );
};

export const Notice = ({
  title,
  body,
  tone = 'info',
  icon = 'information-circle-outline',
}: {
  title: string;
  body: string;
  tone?: StatusTone;
  icon?: IconName;
}) => {
  const palette = toneStyles[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.backgroundColor }]} accessible>
      <Ionicons name={icon} size={22} color={palette.color} />
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color: palette.color }]}>{title}</Text>
        <Text style={styles.noticeBody}>{body}</Text>
      </View>
    </View>
  );
};

export const ChoiceChip = ({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    accessibilityRole="radio"
    accessibilityState={{ selected, disabled }}
    accessibilityLabel={label}
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.choice,
      selected && styles.choiceSelected,
      disabled && styles.choiceDisabled,
      pressed && !disabled && styles.pressed,
    ]}
  >
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>
);

export const IconTile = ({ name, color = colors.oxblood }: { name: IconName; color?: string }) => (
  <View style={styles.iconTile}>
    <Ionicons name={name} size={23} color={color} />
  </View>
);

export const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  brandMark: {
    alignItems: 'center',
    backgroundColor: colors.oxblood,
    borderColor: colors.gold,
    borderRadius: 18,
    borderWidth: 2,
    height: 62,
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    width: 62,
  },
  // A 32 px square occupies about 45 px after rotation, keeping it inside the
  // header's 48 px side column without clipping the diamond corners.
  brandMarkCompact: { borderRadius: 10, borderWidth: 1.5, height: 32, width: 32 },
  brandCross: { transform: [{ rotate: '-45deg' }] },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.lg,
    ...shadow,
  },
  eyebrowLight: { color: colors.goldSoft },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitleText: { flex: 1 },
  button: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  button_primary: { backgroundColor: colors.oxblood, borderColor: colors.oxbloodDark },
  button_secondary: { backgroundColor: colors.card, borderColor: colors.oxblood },
  button_ghost: { backgroundColor: colors.transparent, borderColor: colors.transparent },
  button_danger: { backgroundColor: colors.redSoft, borderColor: colors.red },
  buttonLabel: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  buttonLabel_primary: { color: colors.card },
  buttonLabel_secondary: { color: colors.oxblood },
  buttonLabel_ghost: { color: colors.oxblood },
  buttonLabel_danger: { color: colors.red },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  badge: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 13, lineHeight: 18 },
  notice: { borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  noticeCopy: { flex: 1, gap: spacing.xxs },
  noticeTitle: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  noticeBody: { color: colors.ink, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  choice: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choiceSelected: { backgroundColor: colors.oxblood, borderColor: colors.oxblood },
  choiceDisabled: { opacity: 0.42 },
  choiceText: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20 },
  choiceTextSelected: { color: colors.card, fontFamily: fonts.bodyBold },
  iconTile: {
    alignItems: 'center',
    backgroundColor: colors.goldSoft,
    borderRadius: radii.md,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  divider: { backgroundColor: colors.line, height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
});
