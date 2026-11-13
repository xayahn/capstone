import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Notice } from '../components/ui';
import { ASSISTANT_DISCLAIMER, newAssistantMessage } from '../lib/assistant';
import { colors, fonts, radii, shadow, spacing, type } from '../theme';
import type { AssistantAction, AssistantMessage } from '../types/domain';

const DEFAULT_PROMPTS = [
  'What documents do I need?',
  'What is my next appointment step?',
  'How does the walk-in queue work?',
];

const GEMINI_PROMPTS = [
  'How does document verification work?',
  'How do rescheduling and cancellation work?',
  'How does the walk-in queue work?',
];

export const initialAssistantMessages = (): AssistantMessage[] => [
  {
    ...newAssistantMessage(
      'assistant',
      'I can use current ParishLink information to explain requirements, booking, your request status, and the walk-in queue.',
    ),
    title: 'Hello. What can I help you prepare?',
    followUpPrompts: DEFAULT_PROMPTS,
  },
];

const actionIcon = (action: AssistantAction): keyof typeof Ionicons.glyphMap => {
  if (action.kind === 'queue') return 'ticket-outline';
  if (action.kind === 'appointment' || action.kind === 'documents') return 'calendar-outline';
  if (action.kind === 'contact_parish') return 'call-outline';
  if (action.kind === 'home') return 'home-outline';
  return action.id.startsWith('book-') ? 'add-circle-outline' : 'book-outline';
};

const sourceDate = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : ` · updated ${parsed.toLocaleDateString()}`;
};

export const AssistantScreen = ({
  messages,
  setMessages,
  onAsk,
  onAction,
  allowExternalAI,
  onToggleExternalAI,
  canUseGemini,
}: {
  messages: AssistantMessage[];
  setMessages: Dispatch<SetStateAction<AssistantMessage[]>>;
  onAsk: (prompt: string, allowExternalAI?: boolean) => Promise<AssistantMessage>;
  onAction: (action: AssistantAction) => void;
  allowExternalAI: boolean;
  onToggleExternalAI: (enabled: boolean) => void;
  canUseGemini: boolean;
}) => {
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const hasMounted = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const { width } = useWindowDimensions();
  const latestAssistant = [...messages].reverse().find((message) => message.from === 'assistant');
  const suggestedPrompts = useMemo(() => {
    if (canUseGemini && allowExternalAI && messages.length <= 1) {
      return [...GEMINI_PROMPTS, ...DEFAULT_PROMPTS.slice(0, 2)];
    }
    return latestAssistant?.followUpPrompts?.slice(0, 4) ?? DEFAULT_PROMPTS;
  }, [allowExternalAI, canUseGemini, latestAssistant, messages.length]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    const timeout = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timeout);
  }, [messages, sending]);

  const ask = async (value = prompt) => {
    const clean = value.trim();
    if (!clean || sending) return;
    setPrompt('');
    setMessages((current) => [...current, newAssistantMessage('user', clean)]);
    setSending(true);
    try {
      const reply = await onAsk(clean, canUseGemini && allowExternalAI);
      if (!active.current) return;
      setMessages((current) => [...current, reply]);
    } catch {
      if (!active.current) return;
      setMessages((current) => [
        ...current,
        {
          ...newAssistantMessage(
            'assistant',
            'I could not reach the guidance service. Your appointments and documents are unaffected. Try again or contact the parish office.',
            true,
          ),
          title: 'Guidance is temporarily unavailable',
          actions: [{ id: 'contact-parish', label: 'Contact parish staff', kind: 'contact_parish' }],
        },
      ]);
    } finally {
      if (active.current) setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      style={styles.flex}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, width > 720 && styles.scrollWide]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <View style={styles.guideIcon}><Ionicons name="sparkles-outline" size={25} color={colors.goldSoft} /></View>
          <View style={styles.flex}>
            <Text style={styles.introEyebrow}>ParishLink AI Assistant</Text>
            <Text style={styles.introTitle}>Clear answers. Helpful next steps.</Text>
            <Text style={styles.introBody}>Ask about sacramental services, rescheduling, your own requests, documents, or a parish-office visit.</Text>
          </View>
        </View>

        <Notice title="Information, not approval" body={ASSISTANT_DISCLAIMER} tone="warning" icon="shield-checkmark-outline" />
        <View style={styles.introCard}>
          <View style={styles.flex}>
            <View style={styles.consentHeader}>
              <Text style={styles.introEyebrow}>{canUseGemini ? (allowExternalAI ? 'GEMINI ON' : 'LOCAL MODE') : 'DEMO MODE'}</Text>
            </View>
            <Text style={styles.introTitle}>Use Gemini for general questions</Text>
            <Text style={styles.introBody}>{canUseGemini
              ? 'When enabled, general public questions use Google Gemini grounded on ParishLink directory and service rules. Exact document checklists and your personal requests stay strictly inside ParishLink.'
              : 'This demonstration uses ParishLink local guidance only. Connect to the live ParishLink backend to enable Google Gemini.'}</Text>
          </View>
          <Switch accessibilityLabel="Allow general questions to be sent to Google Gemini"
            value={canUseGemini && allowExternalAI} disabled={!canUseGemini || sending}
            onValueChange={onToggleExternalAI} trackColor={{ false: colors.line, true: colors.greenSoft }}
            thumbColor={allowExternalAI ? colors.green : colors.inkSoft} />
        </View>

        <View style={styles.promptSection}>
          <Text style={styles.promptLabel}>Suggested questions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptRow}>
            {suggestedPrompts.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityLabel={item}
                accessibilityState={{ disabled: sending }}
                disabled={sending}
                onPress={() => void ask(item)}
                style={({ pressed }) => [styles.promptButton, sending && styles.disabled, pressed && styles.pressed]}
              >
                <Text style={styles.promptButtonText}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.messages}>
          {messages.map((message) => {
            const user = message.from === 'user';
            return (
              <View key={message.id} style={[styles.messageRow, user && styles.messageRowUser]}>
                {!user ? <View style={styles.assistantAvatar}><Ionicons name="sparkles" size={17} color={colors.goldSoft} /></View> : null}
                <View
                  accessibilityLiveRegion={user ? 'none' : 'polite'}
                  style={[styles.message, user ? styles.userMessage : styles.assistantMessage]}
                >
                  <Text style={[styles.messageAuthor, user && styles.userMessageAuthor]}>{user ? 'You' : message.provider === 'gemini' ? 'Gemini AI · public guidance' : 'ParishLink · local guidance'}</Text>
                  {!user && message.fallbackReason && ['disabled', 'unavailable', 'invalid_response'].includes(message.fallbackReason)
                    ? <Text style={styles.localPrivacyNote}>Gemini is unavailable for this reply. Showing ParishLink local guidance.</Text> : null}
                  {!user && canUseGemini && allowExternalAI && message.provider === 'parishlink' && message.fallbackReason === 'private_or_sensitive'
                    ? <Text style={styles.localPrivacyNote}>Answered locally inside ParishLink to protect personal request data or exact parish checklists.</Text> : null}
                  {message.title ? <Text style={[styles.messageTitle, user && styles.userMessageText]}>{message.title}</Text> : null}
                  <Text style={[styles.messageText, user && styles.userMessageText]}>{message.text}</Text>

                  {message.bullets?.length ? (
                    <View style={styles.bulletList}>
                      {message.bullets.map((item, index) => (
                        <View key={`${message.id}-bullet-${index}`} style={styles.bulletRow}>
                          <View style={styles.bulletDot} />
                          <Text style={styles.bulletText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {message.clarification ? (
                    <View style={styles.clarification}>
                      <Text style={styles.clarificationTitle}>{message.clarification.question}</Text>
                      <View style={styles.optionGrid}>
                        {message.clarification.options.map((option) => (
                          <Pressable
                            key={option.id}
                            accessibilityRole="button"
                            onPress={() => void ask(option.prompt)}
                            style={({ pressed }) => [styles.optionButton, pressed && styles.pressed]}
                          >
                            <Text style={styles.optionText}>{option.label}</Text>
                            <Ionicons name="chevron-forward" size={17} color={colors.oxblood} />
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {message.sources?.length ? (
                    <View style={styles.sources}>
                      <View style={styles.sourceHeading}>
                        <Ionicons name="checkmark-circle-outline" size={17} color={colors.green} />
                        <Text style={styles.sourceHeadingText}>Based on ParishLink data</Text>
                      </View>
                      {message.sources.map((source, index) => (
                        <Text key={`${message.id}-source-${index}`} style={styles.sourceText}>
                          {source.label}{sourceDate(source.updatedAt)}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  {message.actions?.length ? (
                    <View style={styles.actions}>
                      {message.actions.map((action) => (
                        <Pressable
                          key={action.id}
                          accessibilityRole="button"
                          onPress={() => action.kind === 'contact_parish'
                            ? void ask('Show my home parish office address and office hours.')
                            : onAction(action)}
                          style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
                        >
                          <Ionicons name={actionIcon(action)} size={18} color={colors.oxblood} />
                          <Text style={styles.actionText}>{action.label}</Text>
                          <Ionicons name="arrow-forward" size={17} color={colors.oxblood} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {message.escalation ? (
                    <View style={styles.handoff}>
                      <Ionicons name="people-outline" size={18} color={colors.red} />
                      <Text style={styles.handoffText}>This question needs help from parish staff or an appropriate professional.</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}

          {sending ? (
            <View style={styles.typing} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.oxblood} />
              <Text style={styles.typingText}>Checking current ParishLink information…</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.composer}>
        <View style={styles.composerField}>
          <TextInput
            accessibilityLabel="Ask ParishLink a question"
            placeholder="Ask about a service or your request…"
            placeholderTextColor={colors.inkSoft}
            value={prompt}
            onChangeText={setPrompt}
            onSubmitEditing={() => void ask()}
            multiline
            style={styles.composerInput}
            maxLength={500}
          />
          <Text style={styles.characterCount}>{prompt.length}/500</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send question"
          disabled={!prompt.trim() || sending}
          onPress={() => void ask()}
          style={({ pressed }) => [styles.sendButton, (!prompt.trim() || sending) && styles.disabled, pressed && styles.pressed]}
        >
          <Ionicons name="send" size={21} color={colors.card} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  scrollWide: { alignSelf: 'center', maxWidth: 760, width: '100%' },
  introCard: { alignItems: 'center', backgroundColor: colors.leatherDark, borderColor: colors.gold, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg, ...shadow },
  guideIcon: { alignItems: 'center', backgroundColor: colors.oxblood, borderColor: colors.gold, borderRadius: radii.md, borderWidth: 1, height: 52, justifyContent: 'center', width: 52 },
  introEyebrow: { color: colors.goldSoft, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  consentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  introTitle: { color: colors.card, fontFamily: fonts.displayBold, fontSize: 25, lineHeight: 29, marginTop: 2 },
  introBody: { color: colors.paperLight, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: 4 },
  localPrivacyNote: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  promptSection: { gap: spacing.xs },
  promptLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14 },
  promptRow: { gap: spacing.xs, paddingRight: spacing.md },
  promptButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: 10 },
  promptButtonText: { color: colors.ink, fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20 },
  messages: { gap: spacing.md },
  messageRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  messageRowUser: { justifyContent: 'flex-end' },
  assistantAvatar: { alignItems: 'center', backgroundColor: colors.leather, borderRadius: radii.pill, height: 34, justifyContent: 'center', marginTop: 3, width: 34 },
  message: { borderRadius: radii.lg, gap: spacing.xs, maxWidth: '88%', padding: spacing.md },
  assistantMessage: { backgroundColor: colors.card, borderColor: colors.line, borderTopLeftRadius: 6, borderWidth: 1, ...shadow },
  userMessage: { backgroundColor: colors.oxblood, borderTopRightRadius: 6 },
  messageAuthor: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  userMessageAuthor: { color: colors.goldSoft },
  messageTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 26 },
  messageText: { color: colors.ink, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  userMessageText: { color: colors.card },
  bulletList: { gap: spacing.xs, marginTop: spacing.xxs },
  bulletRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  bulletDot: { backgroundColor: colors.gold, borderRadius: 4, height: 7, marginTop: 8, width: 7 },
  bulletText: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
  clarification: { backgroundColor: colors.paperLight, borderRadius: radii.md, gap: spacing.sm, marginTop: spacing.xs, padding: spacing.sm },
  clarificationTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 21 },
  optionGrid: { gap: spacing.xs },
  optionButton: { alignItems: 'center', backgroundColor: colors.cardStrong, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 46, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  optionText: { color: colors.ink, flex: 1, fontFamily: fonts.bodySemibold, fontSize: 14 },
  sources: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 4, marginTop: spacing.xs, paddingTop: spacing.sm },
  sourceHeading: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  sourceHeadingText: { color: colors.green, fontFamily: fonts.bodyBold, fontSize: 13 },
  sourceText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  actions: { gap: spacing.xs, marginTop: spacing.xs },
  actionButton: { alignItems: 'center', backgroundColor: colors.cardStrong, borderColor: colors.oxblood, borderRadius: radii.sm, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 46, paddingHorizontal: spacing.sm },
  actionText: { color: colors.oxblood, flex: 1, fontFamily: fonts.bodyBold, fontSize: 14 },
  handoff: { alignItems: 'flex-start', backgroundColor: colors.redSoft, borderRadius: radii.sm, flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, padding: spacing.sm },
  handoffText: { color: colors.red, flex: 1, fontFamily: fonts.bodySemibold, fontSize: 13, lineHeight: 20 },
  typing: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.card, borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  typingText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14 },
  composer: { alignItems: 'flex-end', backgroundColor: colors.card, borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', gap: spacing.xs, padding: spacing.sm },
  composerField: { flex: 1 },
  composerInput: { backgroundColor: colors.paperLight, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 16, lineHeight: 23, maxHeight: 120, minHeight: 54, paddingBottom: 20, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  characterCount: { bottom: 5, color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 12, position: 'absolute', right: 10 },
  sendButton: { alignItems: 'center', backgroundColor: colors.oxblood, borderRadius: radii.md, height: 54, justifyContent: 'center', width: 54 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
