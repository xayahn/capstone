import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  paper: '#E6D8B8',
  paperLight: '#F1E6C9',
  card: '#FBF6E7',
  cardStrong: '#FFFDF5',
  ink: '#33261A',
  inkSoft: '#4A3B2C',
  leather: '#5B3A22',
  leatherDark: '#3D2615',
  oxblood: '#6B2430',
  oxbloodDark: '#4F1A22',
  gold: '#A87C33',
  goldSoft: '#E8D6A0',
  green: '#4C5A34',
  greenSoft: '#E3E4CC',
  amber: '#9C6B1E',
  amberSoft: '#F0E0BC',
  red: '#7A3620',
  redSoft: '#F0DCC9',
  purple: '#5B3E9E',
  purpleSoft: '#EAE3F6',
  line: '#CBB88A',
  white: '#FFFFFF',
  transparent: 'transparent',
} as const;

export const fonts = {
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  display: 'CormorantGaramond_600SemiBold',
  displayBold: 'CormorantGaramond_700Bold',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const shadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
  },
  android: { elevation: 4 },
  default: {
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
}) ?? {};

export const type = {
  display: {
    fontFamily: fonts.displayBold,
    fontSize: 36,
    lineHeight: 42,
    color: colors.ink,
  } satisfies TextStyle,
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 29,
    lineHeight: 34,
    color: colors.ink,
  } satisfies TextStyle,
  heading: {
    fontFamily: fonts.display,
    fontSize: 25,
    lineHeight: 30,
    color: colors.ink,
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.body,
    fontSize: 16.5,
    lineHeight: 25,
    color: colors.ink,
  } satisfies TextStyle,
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.oxblood,
  } satisfies TextStyle,
};
