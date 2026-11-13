import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radii, shadow, spacing, type } from '../theme';
import type { StatusTone } from '../lib/status';

export type IconName = ComponentProps<typeof Ionicons>['name'];

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
    <Ionicons name={name} size={25} color={color} />
  </View>
);

export const Divider = () => <View style={styles.divider} />;

export const Field = ({ label, ...props }: TextInputProps & { label: string }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors.inkSoft} style={styles.input} {...props} />
  </View>
);

export const Feature = ({ icon, title, body }: { icon: IconName; title: string; body: string }) => (
  <View style={styles.feature}>
    <IconTile name={icon} />
    <View style={styles.flex}>
      <Text style={styles.itemTitle}>{title}</Text>
      <Text style={styles.mutedText}>{body}</Text>
    </View>
  </View>
);

export const QuickAction = ({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [styles.quickAction, pressed && styles.cardPressed]}
  >
    <IconTile name={icon} />
    <Text style={styles.quickActionLabel}>{label}</Text>
    <Ionicons name="arrow-forward" size={17} color={colors.oxblood} />
  </Pressable>
);

export const MoreLink = ({ icon, title, body, onPress }: { icon: IconName; title: string; body: string; onPress: () => void }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={title}
    onPress={onPress}
    style={({ pressed }) => [styles.moreLink, pressed && styles.cardPressed]}
  >
    <IconTile name={icon} />
    <View style={styles.flex}>
      <Text style={styles.itemTitle}>{title}</Text>
      <Text style={styles.mutedText}>{body}</Text>
    </View>
    <Ionicons name="chevron-forward" size={21} color={colors.oxblood} />
  </Pressable>
);

export const InfoRow = ({ icon, text }: { icon: IconName; text: string }) => (
  <View style={styles.infoRow}>
    <Ionicons name={icon} size={17} color={colors.gold} />
    <Text style={styles.infoText}>{text}</Text>
  </View>
);

export const ReviewRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.reviewRow}>
    <Text style={styles.reviewLabel}>{label}</Text>
    <Text style={styles.reviewValue}>{value}</Text>
  </View>
);

export const QueueStat = ({ value, label }: { value: string; label: string }) => (
  <View style={styles.queueStat}>
    <Text style={styles.queueStatValue}>{value}</Text>
    <Text style={styles.queueStatLabel}>{label}</Text>
  </View>
);

export const EmptyCard = ({ title, body }: { title: string; body: string }) => (
  <Card style={styles.emptyCard}>
    <Ionicons name="leaf-outline" size={28} color={colors.gold} />
    <Text style={styles.itemTitle}>{title}</Text>
    <Text style={styles.mutedCentered}>{body}</Text>
  </Card>
);

export const EmptyState = ({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action: ReactNode;
}) => (
  <View style={styles.emptyState}>
    <Ionicons name={icon} size={40} color={colors.gold} />
    <Text style={type.title}>{title}</Text>
    <Text style={styles.mutedCentered}>{body}</Text>
    {action}
  </View>
);

export const FormSection = ({ number, title, children }: { number: string; title: string; children: ReactNode }) => (
  <Card>
    <View style={styles.formHeading}>
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View>
      <Text style={styles.formTitle}>{title}</Text>
    </View>
    <Divider />
    {children}
  </Card>
);

export const LoadingScreen = ({ label }: { label: string }) => (
  <View style={styles.loadingScreen}>
    <BrandMark />
    <ActivityIndicator size="large" color={colors.oxblood} />
    <Text style={styles.mutedText}>{label}</Text>
  </View>
);

export const Screen = ({ children, keyboard = false }: { children: ReactNode; keyboard?: boolean }) => {
  const { width } = useWindowDimensions();
  const content = (
    <ScrollView
      contentContainerStyle={[styles.screenScroll, width > 720 && styles.screenScrollWide]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
  return keyboard ? (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      {content}
    </KeyboardAvoidingView>
  ) : (
    content
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
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
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  button_primary: { backgroundColor: colors.oxblood, borderColor: colors.oxbloodDark },
  button_secondary: { backgroundColor: colors.card, borderColor: colors.oxblood },
  button_ghost: { backgroundColor: colors.transparent, borderColor: colors.transparent },
  button_danger: { backgroundColor: colors.redSoft, borderColor: colors.red },
  buttonLabel: { fontFamily: fonts.bodyBold, fontSize: 16.5, lineHeight: 22 },
  buttonLabel_primary: { color: colors.card },
  buttonLabel_secondary: { color: colors.oxblood },
  buttonLabel_ghost: { color: colors.oxblood },
  buttonLabel_danger: { color: colors.red },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
  badge: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 13.5, lineHeight: 18 },
  notice: { borderRadius: radii.md, flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  noticeCopy: { flex: 1, gap: spacing.xxs },
  noticeTitle: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22 },
  noticeBody: { color: colors.ink, fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  choice: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choiceSelected: { backgroundColor: colors.oxblood, borderColor: colors.oxblood },
  choiceDisabled: { opacity: 0.42 },
  choiceText: { color: colors.ink, fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22 },
  choiceTextSelected: { color: colors.card, fontFamily: fonts.bodyBold },
  iconTile: {
    alignItems: 'center',
    backgroundColor: colors.goldSoft,
    borderRadius: radii.md,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  divider: { backgroundColor: colors.line, height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  field: { marginTop: spacing.sm },
  fieldLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.cardStrong,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  feature: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16.5, lineHeight: 23 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22 },
  mutedCentered: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22, textAlign: 'center' },
  quickAction: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 74,
    padding: spacing.sm,
    width: '48%',
    ...shadow,
  },
  quickActionLabel: { color: colors.ink, flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 21 },
  moreLink: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 80,
    padding: spacing.md,
  },
  infoRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  infoText: { color: colors.inkSoft, flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  reviewRow: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  reviewLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 15 },
  reviewValue: { color: colors.ink, flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, textAlign: 'right' },
  queueStat: { alignItems: 'center', flex: 1 },
  queueStatValue: { color: colors.oxblood, fontFamily: fonts.displayBold, fontSize: 31 },
  queueStatLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 14 },
  emptyCard: { alignItems: 'center', gap: spacing.xs },
  emptyState: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  formHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  stepNumber: { alignItems: 'center', backgroundColor: colors.oxblood, borderRadius: radii.pill, height: 34, justifyContent: 'center', width: 34 },
  stepNumberText: { color: colors.card, fontFamily: fonts.bodyBold, fontSize: 13 },
  formTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 24 },
  loadingScreen: { alignItems: 'center', backgroundColor: colors.paper, flex: 1, gap: spacing.lg, justifyContent: 'center' },
  screenScroll: { gap: spacing.lg, padding: spacing.md, paddingBottom: 120 },
  screenScrollWide: { alignSelf: 'center', maxWidth: 760, width: '100%' },
});
