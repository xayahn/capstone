import Ionicons from '@expo/vector-icons/Ionicons';
import { CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond/600SemiBold';
import { CormorantGaramond_700Bold } from '@expo-google-fonts/cormorant-garamond/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import * as DocumentPicker from 'expo-document-picker';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  AppButton,
  BrandMark,
  Card,
  ChoiceChip,
  Divider,
  Eyebrow,
  IconTile,
  Notice,
  SectionTitle,
  StatusBadge,
} from './src/components/ui';
import { PARISHES, QUEUE_SERVICES, SACRAMENT_SERVICES, getParish, getService } from './src/data/catalog';
import { useParishLink } from './src/hooks/useParishLink';
import { formatDate, getBookableDates } from './src/lib/scheduling';
import {
  appointmentStatusLabel,
  appointmentStatusTone,
  documentStatusLabel,
  documentStatusTone,
  getAppointmentTimeline,
  summarizeDocuments,
} from './src/lib/status';
import { AssistantScreen, initialAssistantMessages } from './src/screens/AssistantScreen';
import { ServicesScreen } from './src/screens/ServicesScreen';
import { colors, fonts, radii, shadow, spacing, type } from './src/theme';
import type {
  AppNotification,
  Appointment,
  AppointmentDocument,
  AvailabilitySearchInput,
  AvailabilitySlot,
  AssistantAction,
  AssistantMessage,
  CreateAppointmentInput,
  ParishId,
  ParishionerProfile,
  QueueService,
  RepositorySnapshot,
  SacramentId,
  UploadAppointmentDocumentInput,
} from './src/types/domain';

type Route =
  | 'home'
  | 'services'
  | 'appointments'
  | 'more'
  | 'booking'
  | 'appointment-detail'
  | 'notifications'
  | 'queue'
  | 'assistant'
  | 'profile';

const serviceIcons: Record<SacramentId, keyof typeof Ionicons.glyphMap> = {
  baptism: 'water-outline',
  wedding: 'heart-outline',
  confirmation: 'shield-checkmark-outline',
  first_communion: 'sunny-outline',
  funeral: 'flame-outline',
};

const mainRoutes = new Set<Route>(['home', 'services', 'appointments', 'more']);

const backRoute: Record<Route, Route> = {
  home: 'home',
  services: 'services',
  appointments: 'appointments',
  more: 'more',
  booking: 'services',
  'appointment-detail': 'appointments',
  notifications: 'more',
  queue: 'more',
  assistant: 'more',
  profile: 'more',
};

const AppContent = () => {
  const parishLink = useParishLink();
  const [route, setRoute] = useState<Route>('home');
  const [routeHistory, setRouteHistory] = useState<Route[]>([]);
  const [bookingServiceId, setBookingServiceId] = useState<SacramentId>('baptism');
  const [focusedServiceId, setFocusedServiceId] = useState<SacramentId>();
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(initialAssistantMessages);

  useEffect(() => {
    setRoute('home');
    setRouteHistory([]);
    setFocusedServiceId(undefined);
    setSelectedAppointmentId('');
    setAssistantMessages(initialAssistantMessages());
  }, [parishLink.session?.profile.id]);

  if (parishLink.initializing) {
    return <LoadingScreen label="Restoring your secure ParishLink session…" />;
  }

  if (!parishLink.session) {
    return (
      <WelcomeScreen
        loading={parishLink.loading}
        error={parishLink.error}
        mode={parishLink.repositoryMode}
        onSignIn={parishLink.signIn}
        onSignUp={parishLink.signUp}
      />
    );
  }

  if (!parishLink.snapshot) {
    return <LoadingScreen label="Preparing your parish dashboard…" />;
  }

  const snapshot = parishLink.snapshot;
  const navigate = (nextRoute: Route) => {
    if (nextRoute === route) return;
    setRouteHistory((current) => [...current, route].slice(-20));
    setRoute(nextRoute);
  };
  const navigateMain = (nextRoute: Route) => {
    setRouteHistory([]);
    setFocusedServiceId(undefined);
    setRoute(nextRoute);
  };
  const goBack = () => {
    const previousRoute = routeHistory.at(-1);
    if (previousRoute) {
      setRouteHistory((current) => current.slice(0, -1));
      setRoute(previousRoute);
      return;
    }
    setRoute(backRoute[route]);
  };
  const openServices = (serviceId?: SacramentId) => {
    setFocusedServiceId(serviceId);
    navigate('services');
  };
  const openBooking = (serviceId: SacramentId) => {
    setBookingServiceId(serviceId);
    navigate('booking');
  };
  const openAppointment = (id: string) => {
    setSelectedAppointmentId(id);
    navigate('appointment-detail');
  };
  const handleAssistantAction = (action: AssistantAction) => {
    if (action.kind === 'service') {
      if (action.serviceId && action.id.startsWith('book-')) openBooking(action.serviceId);
      else openServices(action.serviceId);
      return;
    }
    if (action.kind === 'appointment' || action.kind === 'documents') {
      if (action.appointmentId) openAppointment(action.appointmentId);
      else navigate('appointments');
      return;
    }
    if (action.kind === 'queue') {
      navigate('queue');
      return;
    }
    if (action.kind === 'home') {
      navigateMain('home');
      return;
    }
    Alert.alert(
      'Contact parish staff',
      `Please contact ${getParish(snapshot.profile.homeParishId)?.name ?? 'your parish office'} through its verified public contact details. ParishLink will not invent contact information.`,
    );
  };
  const selectedAppointment = snapshot.appointments.find(
    (appointment) => appointment.id === selectedAppointmentId,
  );

  const titleByRoute: Record<Route, string> = {
    home: 'ParishLink',
    services: 'Sacramental services',
    appointments: 'My appointments',
    more: 'More',
    booking: 'Request an appointment',
    'appointment-detail': 'Appointment details',
    notifications: 'Notifications',
    queue: 'Walk-in queue',
    assistant: 'Parish guide',
    profile: 'Profile & settings',
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <AppHeader
        title={titleByRoute[route]}
        isRoot={mainRoutes.has(route) && routeHistory.at(-1) !== 'assistant'}
        unreadCount={snapshot.notifications.filter((item) => !item.readAt).length}
        onBack={goBack}
        onNotifications={() => navigate('notifications')}
      />
      {parishLink.error ? (
        <View style={styles.globalNotice}>
          <Notice title="Couldn’t complete that action" body={parishLink.error} tone="critical" icon="alert-circle-outline" />
          <AppButton label="Dismiss" variant="ghost" onPress={parishLink.clearError} />
        </View>
      ) : null}
      {parishLink.warning ? (
        <View style={styles.globalNotice}>
          <Notice title="Request saved—documents need attention" body={parishLink.warning} tone="warning" icon="cloud-upload-outline" />
          <AppButton label="Dismiss" variant="ghost" onPress={parishLink.clearWarning} />
        </View>
      ) : null}
      <View style={styles.screenHost}>
        {route === 'home' ? (
          <HomeScreen
            snapshot={snapshot}
            onBook={openBooking}
            onServices={() => openServices()}
            onAppointment={openAppointment}
            onQueue={() => navigate('queue')}
            onAssistant={() => navigate('assistant')}
          />
        ) : null}
        {route === 'services' ? <ServicesScreen focusedServiceId={focusedServiceId} onBook={openBooking} /> : null}
        {route === 'appointments' ? (
          <AppointmentsScreen appointments={snapshot.appointments} onOpen={openAppointment} />
        ) : null}
        {route === 'more' ? (
          <MoreScreen
            snapshot={snapshot}
            mode={parishLink.repositoryMode}
            onNavigate={navigate}
          />
        ) : null}
        {route === 'booking' ? (
          <BookingScreen
            initialServiceId={bookingServiceId}
            profile={snapshot.profile}
            loading={parishLink.loading}
            onSearchAvailability={parishLink.searchAvailability}
            onCancel={goBack}
            onSubmit={async (input) => {
              const appointment = await parishLink.createAppointment(input);
              openAppointment(appointment.id);
            }}
          />
        ) : null}
        {route === 'appointment-detail' ? (
          selectedAppointment ? (
            <AppointmentDetailScreen
              appointment={selectedAppointment}
              onUpload={parishLink.uploadAppointmentDocument}
            />
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="Appointment not found"
              body="Return to your appointments and select a request."
              action={<AppButton label="View appointments" onPress={() => navigate('appointments')} />}
            />
          )
        ) : null}
        {route === 'notifications' ? (
          <NotificationsScreen
            notifications={snapshot.notifications}
            onOpen={async (notification) => {
              if (!notification.readAt) await parishLink.markNotificationRead(notification.id);
              if (notification.target.kind === 'appointment') openAppointment(notification.target.appointmentId);
              else if (notification.target.kind === 'queue') navigate('queue');
              else if (notification.target.kind === 'assistant') navigate('assistant');
              else navigateMain('home');
            }}
          />
        ) : null}
        {route === 'queue' ? (
          <QueueScreen
            profile={snapshot.profile}
            ticket={snapshot.activeQueueTicket}
            loading={parishLink.loading}
            onJoin={parishLink.joinQueue}
            onLeave={parishLink.leaveQueue}
          />
        ) : null}
        {route === 'assistant' ? (
          <AssistantScreen
            messages={assistantMessages}
            setMessages={setAssistantMessages}
            onAsk={parishLink.askAssistant}
            onAction={handleAssistantAction}
          />
        ) : null}
        {route === 'profile' ? (
          <ProfileScreen
            profile={snapshot.profile}
            mode={parishLink.repositoryMode}
            loading={parishLink.loading}
            onSave={parishLink.updateProfile}
            onChangePassword={parishLink.changePassword}
            onSignOut={parishLink.signOut}
            onReset={parishLink.resetDemo}
          />
        ) : null}
      </View>
      {mainRoutes.has(route) ? <BottomNavigation active={route} onNavigate={navigateMain} /> : null}
    </SafeAreaView>
  );
};

const WelcomeScreen = ({
  loading,
  error,
  mode,
  onSignIn,
  onSignUp,
}: {
  loading: boolean;
  error: string;
  mode: 'demo' | 'api';
  onSignIn: (input: { email: string; password: string }) => Promise<void>;
  onSignUp: (input: {
    displayName: string;
    email: string;
    mobileNumber: string;
    homeParishId: ParishId;
    password: string;
    confirmPassword: string;
    acceptPrivacyNotice: boolean;
  }) => Promise<void>;
}) => {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(mode === 'demo' ? 'maria.santos@example.test' : '');
  const [password, setPassword] = useState(mode === 'demo' ? 'parishlink-demo' : '');
  const [displayName, setDisplayName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [homeParishId, setHomeParishId] = useState<ParishId>('metropolitan-cathedral');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptPrivacyNotice, setAcceptPrivacyNotice] = useState(false);

  const chooseMode = (next: 'signin' | 'signup') => {
    setAuthMode(next);
    if (next === 'signup' && mode === 'demo' && email.endsWith('@example.test')) {
      setEmail('');
      setPassword('');
    }
  };

  const submitDisabled = loading || !email.trim() || !password || (
    authMode === 'signup' && (
      !displayName.trim() || !mobileNumber.trim() || !confirmPassword || !acceptPrivacyNotice
    )
  );

  return (
    <LinearGradient colors={[colors.leatherDark, colors.oxbloodDark, colors.leather]} style={styles.welcomeBackground}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.welcomeSafe}>
        <ScrollView contentContainerStyle={styles.welcomeScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.welcomeBrand}>
            <BrandMark />
            <Eyebrow light>Faith • Service • Community</Eyebrow>
            <Text style={styles.welcomeTitle}>ParishLink</Text>
            <Text style={styles.welcomeSubtitle}>Sacramental services, thoughtfully connected.</Text>
          </View>

          <Card style={styles.welcomeCard}>
            {showAuth ? (
              <>
                <Eyebrow>{mode === 'demo' ? 'Local review workspace' : 'Secure parishioner access'}</Eyebrow>
                <Text style={styles.cardHeadline}>{authMode === 'signin' ? 'Welcome back' : 'Create your account'}</Text>
                <View style={styles.authModeSwitch} accessibilityRole="tablist">
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: authMode === 'signin' }} onPress={() => chooseMode('signin')} style={[styles.authModeButton, authMode === 'signin' && styles.authModeButtonActive]}>
                    <Text style={[styles.authModeText, authMode === 'signin' && styles.authModeTextActive]}>Sign in</Text>
                  </Pressable>
                  <Pressable accessibilityRole="tab" accessibilityState={{ selected: authMode === 'signup' }} onPress={() => chooseMode('signup')} style={[styles.authModeButton, authMode === 'signup' && styles.authModeButtonActive]}>
                    <Text style={[styles.authModeText, authMode === 'signup' && styles.authModeTextActive]}>Create account</Text>
                  </Pressable>
                </View>
                {mode === 'demo' ? (
                  <Notice
                    title={authMode === 'signin' ? 'Review account' : 'Local account only'}
                    body={authMode === 'signin' ? 'Use the filled fictional account, or sign in with an account you created on this device.' : 'This creates a separate account only on this device. It is not yet an official parish account.'}
                    tone="warning"
                    icon="flask-outline"
                  />
                ) : null}
                {authMode === 'signup' ? (
                  <>
                    <Field label="Complete name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" autoComplete="name" textContentType="name" />
                    <Field label="Mobile number" value={mobileNumber} onChangeText={setMobileNumber} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+63 9XX XXX XXXX" />
                  </>
                ) : null}
                <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} textContentType={authMode === 'signup' ? 'newPassword' : 'password'} />
                {authMode === 'signup' ? (
                  <>
                    <Text style={styles.fieldHint}>12–128 characters with uppercase and lowercase letters plus a number.</Text>
                    <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
                    <View style={styles.authSection}>
                      <Text style={styles.authSectionLabel}>Home parish</Text>
                      <View style={styles.chipWrap}>{PARISHES.map((parish) => <ChoiceChip key={parish.id} label={parish.name} selected={homeParishId === parish.id} onPress={() => setHomeParishId(parish.id)} />)}</View>
                    </View>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acceptPrivacyNotice }} onPress={() => setAcceptPrivacyNotice((value) => !value)} style={styles.privacyConsent}>
                      <View style={[styles.checkbox, acceptPrivacyNotice && styles.checkboxChecked]}>{acceptPrivacyNotice ? <Ionicons name="checkmark" size={15} color={colors.paperLight} /> : null}</View>
                      <Text style={styles.privacyConsentText}>I understand ParishLink stores personal and sacramental-service information only for coordination, and authorized parish personnel make all official decisions.</Text>
                    </Pressable>
                  </>
                ) : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <AppButton
                  label={authMode === 'signin' ? (mode === 'demo' ? 'Enter demonstration' : 'Sign in securely') : 'Create account'}
                  icon={authMode === 'signin' ? 'log-in-outline' : 'person-add-outline'}
                  loading={loading}
                  disabled={submitDisabled}
                  onPress={() => void (authMode === 'signin'
                    ? onSignIn({ email, password })
                    : onSignUp({ displayName, email, mobileNumber, homeParishId, password, confirmPassword, acceptPrivacyNotice }))}
                />
                <AppButton label="Back to introduction" variant="ghost" onPress={() => setShowAuth(false)} />
                <Text style={styles.privacyNote}>Passwords are never included in uploaded documents or assistant messages. Production mode stores the session token in the device’s protected credential storage.</Text>
              </>
            ) : (
              <>
                <Eyebrow>One respectful path</Eyebrow>
                <Text style={styles.cardHeadline}>Prepare before you visit</Text>
                <Feature icon="calendar-outline" title="Request a schedule" body="Check parish, clergy, venue, and service-time availability." />
                <Feature icon="documents-outline" title="Prepare documents" body="Follow clear checklists and staff verification updates." />
                <Feature icon="notifications-outline" title="Stay informed" body="Track requests, notices, and your walk-in queue ticket." />
                <AppButton label="Continue" icon="arrow-forward" onPress={() => setShowAuth(true)} />
              </>
            )}
          </Card>
          <Text style={styles.welcomeFooter}>ParishLink supports coordination. Parish personnel retain final authority over approvals, records, and sacramental decisions.</Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const AppHeader = ({
  title,
  isRoot,
  unreadCount,
  onBack,
  onNotifications,
}: {
  title: string;
  isRoot: boolean;
  unreadCount: number;
  onBack: () => void;
  onNotifications: () => void;
}) => (
  <LinearGradient colors={[colors.leatherDark, colors.oxblood]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
    <View style={styles.headerSide}>
      {isRoot ? <BrandMark compact /> : (
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
      <Pressable accessibilityRole="button" accessibilityLabel={`${unreadCount} unread notifications`} onPress={onNotifications} style={styles.headerButton}>
        <Ionicons name={unreadCount ? 'notifications' : 'notifications-outline'} size={22} color={colors.paperLight} />
        {unreadCount ? <View style={styles.unreadDot}><Text style={styles.unreadDotText}>{Math.min(9, unreadCount)}</Text></View> : null}
      </Pressable>
    </View>
  </LinearGradient>
);

const Screen = ({ children, keyboard = false }: { children: React.ReactNode; keyboard?: boolean }) => {
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
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>{content}</KeyboardAvoidingView>
  ) : content;
};

const HomeScreen = ({
  snapshot,
  onBook,
  onServices,
  onAppointment,
  onQueue,
  onAssistant,
}: {
  snapshot: RepositorySnapshot;
  onBook: (service: SacramentId) => void;
  onServices: () => void;
  onAppointment: (id: string) => void;
  onQueue: () => void;
  onAssistant: () => void;
}) => {
  const nextAppointment = snapshot.appointments.find((item) => !['completed', 'cancelled', 'rejected'].includes(item.status));
  return (
    <Screen>
      {snapshot.source === 'demo' ? <Notice title="Demonstration mode" body="All people, records, schedules, and ticket numbers shown here are samples stored on this device." tone="warning" icon="flask-outline" /> : null}
      <LinearGradient colors={[colors.oxblood, colors.leather]} style={styles.heroCard}>
        <Eyebrow light>Good day, {snapshot.profile.displayName.split(' ')[0]}</Eyebrow>
        <Text style={styles.heroTitle}>How may your parish help?</Text>
        <Text style={styles.heroBody}>Prepare a sacramental service request, review its progress, or plan a parish office visit.</Text>
        <AppButton label="Explore services" icon="calendar-outline" variant="secondary" onPress={onServices} />
      </LinearGradient>

      <SectionTitle>Quick actions</SectionTitle>
      <View style={styles.actionGrid}>
        <QuickAction icon="water-outline" label="Baptism" onPress={() => onBook('baptism')} />
        <QuickAction icon="heart-outline" label="Wedding" onPress={() => onBook('wedding')} />
        <QuickAction icon="people-outline" label="Walk-in queue" onPress={onQueue} />
        <QuickAction icon="chatbubbles-outline" label="Ask ParishLink" onPress={onAssistant} />
      </View>

      <SectionTitle>Your next step</SectionTitle>
      {nextAppointment ? (
        <AppointmentCard appointment={nextAppointment} onPress={() => onAppointment(nextAppointment.id)} />
      ) : (
        <EmptyCard title="No active requests" body="Choose a sacramental service when you are ready to begin." />
      )}

      {snapshot.activeQueueTicket ? (
        <>
          <SectionTitle>Walk-in ticket</SectionTitle>
          <Card>
            <View style={styles.rowBetween}>
              <View>
                <Eyebrow>Now waiting</Eyebrow>
                <Text style={styles.ticketNumber}>{snapshot.activeQueueTicket.number}</Text>
              </View>
              <StatusBadge label={`${snapshot.activeQueueTicket.ahead} ahead`} tone="warning" />
            </View>
            <Text style={styles.mutedText}>{snapshot.activeQueueTicket.estimatedWaitMinutes === null
              ? 'A wait estimate will appear after this parish has enough recent completed tickets.'
              : `Measured wait: about ${snapshot.activeQueueTicket.estimatedWaitMinutes} minutes. This estimate can change as staff serve visitors.`}</Text>
            <AppButton label="View ticket" variant="secondary" onPress={onQueue} />
          </Card>
        </>
      ) : null}

      <SectionTitle>Parish reminder</SectionTitle>
      <Card style={styles.reminderCard}>
        <IconTile name="information-circle-outline" />
        <View style={styles.flex}>
          <Text style={styles.itemTitle}>Bring original documents when requested</Text>
          <Text style={styles.mutedText}>An uploaded copy helps with preparation but does not replace parish staff verification or official church records.</Text>
        </View>
      </Card>
    </Screen>
  );
};

const AppointmentsScreen = ({ appointments, onOpen }: { appointments: Appointment[]; onOpen: (id: string) => void }) => (
  <Screen>
    <Eyebrow>Request history</Eyebrow>
    <Text style={type.title}>Track every stage</Text>
    <Text style={styles.lead}>Status changes are recorded separately from file selection. Only staff-reviewed files display as verified.</Text>
    {appointments.length ? appointments.map((appointment) => (
      <AppointmentCard key={appointment.id} appointment={appointment} onPress={() => onOpen(appointment.id)} />
    )) : <EmptyCard title="No appointment requests" body="Your submitted requests will appear here." />}
  </Screen>
);

const AppointmentCard = ({ appointment, onPress }: { appointment: Appointment; onPress: () => void }) => {
  const service = getService(appointment.serviceId);
  const parish = getParish(appointment.parishId);
  const documents = summarizeDocuments(appointment.documents);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${service?.name ?? 'service'} appointment ${appointment.reference}`} onPress={onPress} style={({ pressed }) => pressed && styles.cardPressed}>
      <Card style={styles.appointmentCard}>
        <View style={styles.rowBetweenTop}>
          <View style={styles.serviceHeaderCompact}>
            <IconTile name={serviceIcons[appointment.serviceId]} />
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{service?.name}</Text>
              <Text style={styles.reference}>{appointment.reference}</Text>
            </View>
          </View>
          <StatusBadge label={appointmentStatusLabel[appointment.status]} tone={appointmentStatusTone[appointment.status]} />
        </View>
        <Divider />
        <InfoRow icon="calendar-outline" text={`${formatDate(appointment.date)} • ${appointment.time}`} />
        <InfoRow icon="location-outline" text={parish?.name ?? 'Parish'} />
        <InfoRow icon="documents-outline" text={`${documents.submitted}/${documents.total} submitted • ${documents.verified} staff verified`} />
        <View style={styles.inlineLink}>
          <Text style={styles.inlineLinkText}>View progress</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.oxblood} />
        </View>
      </Card>
    </Pressable>
  );
};

const BookingScreen = ({
  initialServiceId,
  profile,
  loading,
  onSearchAvailability,
  onCancel,
  onSubmit,
}: {
  initialServiceId: SacramentId;
  profile: ParishionerProfile;
  loading: boolean;
  onSearchAvailability: (input: AvailabilitySearchInput) => Promise<AvailabilitySlot[]>;
  onCancel: () => void;
  onSubmit: (input: CreateAppointmentInput) => Promise<void>;
}) => {
  const bookableParishes = PARISHES.filter((item) => item.clergy.length > 0 && Boolean(item.venueId));
  const defaultParishId = bookableParishes.some((item) => item.id === profile.homeParishId)
    ? profile.homeParishId
    : bookableParishes[0]?.id ?? profile.homeParishId;
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [parishId, setParishId] = useState<ParishId>(defaultParishId);
  const [clergyId, setClergyId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [documents, setDocuments] = useState<AppointmentDocument[]>(() => makeChecklist(initialServiceId));
  const [participantName, setParticipantName] = useState(profile.displayName);
  const [participantDateOfBirth, setParticipantDateOfBirth] = useState('');
  const [localError, setLocalError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const service = getService(serviceId)!;
  const parish = getParish(parishId);
  const dates = useMemo(() => getBookableDates(new Date(), 10), []);
  const requiredComplete = documents.filter((document) => document.required).every((document) => ['selected', 'submitted', 'under_review', 'verified'].includes(document.status));
  const participantDateValid = !participantDateOfBirth || /^\d{4}-\d{2}-\d{2}$/.test(participantDateOfBirth);
  const complete = Boolean(serviceId && parish && clergyId && date && time
    && slots.some((slot) => slot.time === time && slot.available)
    && participantName.trim().length >= 2 && participantDateValid && requiredComplete);

  useEffect(() => {
    let active = true;
    setTime('');
    setAvailabilityError('');
    if (!date || !clergyId || !parish) {
      setSlots([]);
      setAvailabilityLoading(false);
      return () => { active = false; };
    }
    setSlots([]);
    setAvailabilityLoading(true);
    void onSearchAvailability({ serviceId, parishId, clergyId, venueId: parish.venueId, date })
      .then((next) => {
        if (active) setSlots(next);
      })
      .catch((cause) => {
        if (active) setAvailabilityError(cause instanceof Error ? cause.message : 'Availability could not be checked.');
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => { active = false; };
  }, [clergyId, date, onSearchAvailability, parish, parishId, serviceId]);

  const chooseService = (id: SacramentId) => {
    setServiceId(id);
    setDocuments(makeChecklist(id));
    setDate('');
    setTime('');
  };
  const chooseParish = (id: ParishId) => {
    setParishId(id);
    setClergyId('');
    setDate('');
    setTime('');
  };
  const pickDocument = async (document: AppointmentDocument) => {
    setLocalError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > 10 * 1024 * 1024) {
        setLocalError('Choose a PDF, JPG, or PNG file no larger than 10 MB.');
        return;
      }
      setDocuments((current) => current.map((item) => item.id === document.id ? {
        ...item,
        status: 'selected',
        fileName: asset.name,
        fileUri: asset.uri,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        ...(asset.size === undefined ? {} : { sizeBytes: asset.size }),
        note: 'Selected on this device. Parish staff have not verified this file.',
      } : item));
    } catch {
      setLocalError('The document picker could not open. Check the device permission and try again.');
    }
  };

  const submit = async () => {
    if (!complete || !parish) {
      setLocalError('Complete the schedule and select every required document before submitting.');
      return;
    }
    setLocalError('');
    try {
      await onSubmit({
        serviceId,
        parishId,
        clergyId,
        venueId: parish.venueId,
        date,
        time,
        durationMinutes: service.durationMinutes,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        participants: [{
          type: serviceId === 'funeral' ? 'deceased' : serviceId === 'wedding' ? 'principal' : 'candidate',
          fullName: participantName.trim().replace(/\s+/g, ' '),
          ...(participantDateOfBirth ? { dateOfBirth: participantDateOfBirth } : {}),
        }],
        documents,
      });
    } catch {
      // The shared repository error is displayed above the screen.
    }
  };

  if (!parish) {
    return <Screen><Notice title="Scheduling is being configured" body="No parish has an active priest and venue yet. Your system administrator must finish resource setup before appointment requests can be submitted." tone="warning" icon="construct-outline" /><AppButton label="Return to services" variant="ghost" onPress={onCancel} /></Screen>;
  }

  return (
    <Screen>
      <Notice title="Request, not automatic approval" body="Submitting sends the preferred schedule and documents for parish staff review. It does not confirm the sacrament or replace official records." tone="warning" icon="shield-checkmark-outline" />

      <FormSection number="1" title="Sacramental service">
        <View style={styles.chipWrap}>
          {SACRAMENT_SERVICES.map((item) => <ChoiceChip key={item.id} label={item.name} selected={item.id === serviceId} onPress={() => chooseService(item.id)} />)}
        </View>
        <Text style={styles.helperText}>{service.durationMinutes} minutes, plus 15-minute preparation buffers before and after.</Text>
      </FormSection>

      <FormSection number="2" title="Parish and clergy">
        <Text style={styles.fieldLabel}>Parish</Text>
        <View style={styles.chipWrap}>
          {bookableParishes.map((item) => <ChoiceChip key={item.id} label={item.name} selected={item.id === parishId} onPress={() => chooseParish(item.id)} />)}
        </View>
        <Text style={styles.fieldLabel}>Preferred clergy member</Text>
        <View style={styles.chipWrap}>
          {parish.clergy.map((clergy) => <ChoiceChip key={clergy.id} label={clergy.name} selected={clergy.id === clergyId} onPress={() => { setClergyId(clergy.id); setDate(''); setTime(''); }} />)}
        </View>
      </FormSection>

      <FormSection number="3" title="Preferred schedule">
        {!clergyId ? <Text style={styles.helperText}>Choose a clergy member before viewing availability.</Text> : (
          <>
            <Text style={styles.fieldLabel}>Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
              {dates.map((item) => <ChoiceChip key={item} label={formatDate(item, true)} selected={item === date} onPress={() => { setDate(item); setTime(''); }} />)}
            </ScrollView>
            <Text style={styles.fieldLabel}>Time</Text>
            {date ? (
              availabilityLoading ? <View style={styles.loadingRow}><ActivityIndicator color={colors.oxblood} /><Text style={styles.helperText}>Checking the live parish schedule…</Text></View> :
                <View style={styles.chipWrap}>
                  {slots.map((slot) => <ChoiceChip key={slot.time} label={slot.available ? slot.time : `${slot.time} • unavailable`} selected={slot.time === time} disabled={!slot.available} onPress={() => setTime(slot.time)} />)}
                </View>
            ) : <Text style={styles.helperText}>Choose a date to see time slots.</Text>}
            {availabilityError ? <Text style={styles.errorText}>{availabilityError}</Text> : null}
          </>
        )}
      </FormSection>

      <FormSection number="4" title="Participant details">
        <Notice title="Only necessary details" body="Enter the primary person connected to this request. Parish staff may ask for service-specific details through the approved review process." tone="info" icon="person-outline" />
        <Field label="Primary participant’s complete name" value={participantName} maxLength={160} autoCapitalize="words" onChangeText={setParticipantName} />
        <Field label="Birth date (optional, YYYY-MM-DD)" value={participantDateOfBirth} maxLength={10} inputMode="numeric" placeholder="YYYY-MM-DD" onChangeText={setParticipantDateOfBirth} />
        {!participantDateValid ? <Text style={styles.errorText}>Use the birth date format YYYY-MM-DD.</Text> : null}
      </FormSection>

      <FormSection number="5" title="Document checklist">
        <Notice title="Human verification" body="Selecting or submitting a file never marks it verified. Authorized parish staff review each file after submission." tone="info" icon="person-outline" />
        {documents.map((document) => (
          <View key={document.id} style={styles.documentRow}>
            <View style={styles.flex}>
              <View style={styles.documentHeading}>
                <Text style={styles.itemTitle}>{document.label}</Text>
                <StatusBadge label={document.required ? 'Required' : 'Optional'} tone={document.required ? 'warning' : 'neutral'} />
              </View>
              <Text style={styles.mutedText}>{document.fileName ?? (document.required ? 'No file selected' : 'You may provide this if available.')}</Text>
              {document.status === 'selected' ? <Text style={styles.selectedFileNote}>Selected locally • not staff verified</Text> : null}
            </View>
            <AppButton label={document.status === 'selected' ? 'Replace' : 'Choose file'} variant="secondary" onPress={() => void pickDocument(document)} />
          </View>
        ))}
        <Text style={styles.helperText}>Accepted formats: PDF, JPG, PNG • Maximum 10 MB per file.</Text>
      </FormSection>

      <FormSection number="6" title="Review and submit">
        <ReviewRow label="Service" value={service.name} />
        <ReviewRow label="Parish" value={parish.name} />
        <ReviewRow label="Clergy" value={parish.clergy.find((item) => item.id === clergyId)?.name ?? 'Not selected'} />
        <ReviewRow label="Primary participant" value={participantName.trim() || 'Not entered'} />
        <ReviewRow label="Schedule" value={date && time ? `${formatDate(date)} at ${time}` : 'Not selected'} />
        <ReviewRow label="Documents" value={`${documents.filter((item) => item.status === 'selected').length} selected • ${documents.filter((item) => item.status === 'verified').length} verified`} />
        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
        <AppButton label="Submit request for review" icon="send-outline" loading={loading} disabled={loading || !complete} onPress={() => void submit()} />
        <AppButton label="Cancel" variant="ghost" onPress={onCancel} />
      </FormSection>
    </Screen>
  );
};

const AppointmentDetailScreen = ({
  appointment,
  onUpload,
}: {
  appointment: Appointment;
  onUpload: (
    appointmentId: string,
    documentId: string,
    input: UploadAppointmentDocumentInput,
  ) => Promise<Appointment>;
}) => {
  const service = getService(appointment.serviceId)!;
  const parish = getParish(appointment.parishId)!;
  const clergy = parish.clergy.find((item) => item.id === appointment.clergyId);
  const summary = summarizeDocuments(appointment.documents);
  const timeline = getAppointmentTimeline(appointment.status);
  const [uploadingDocumentId, setUploadingDocumentId] = useState('');
  const [localError, setLocalError] = useState('');

  const retryUpload = async (document: AppointmentDocument) => {
    setLocalError('');
    let input: UploadAppointmentDocumentInput | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > 10 * 1024 * 1024) {
        setLocalError('Choose a PDF, JPG, or PNG file no larger than 10 MB.');
        return;
      }
      input = {
        fileUri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        ...(asset.size === undefined ? {} : { sizeBytes: asset.size }),
      };
    } catch {
      setLocalError('The document picker could not open. Check the device permission and try again.');
      return;
    }

    setUploadingDocumentId(document.id);
    try {
      await onUpload(appointment.id, document.id, input);
    } catch {
      // The shared repository error is displayed above the screen.
    } finally {
      setUploadingDocumentId('');
    }
  };

  return (
    <Screen>
      <Card style={styles.detailHero}>
        <View style={styles.rowBetweenTop}>
          <IconTile name={serviceIcons[appointment.serviceId]} />
          <StatusBadge label={appointmentStatusLabel[appointment.status]} tone={appointmentStatusTone[appointment.status]} />
        </View>
        <Text style={styles.detailTitle}>{service.name}</Text>
        <Text style={styles.reference}>{appointment.reference}</Text>
        <Divider />
        <InfoRow icon="calendar-outline" text={`${formatDate(appointment.date)} • ${appointment.time}`} />
        <InfoRow icon="location-outline" text={parish.name} />
        <InfoRow icon="person-outline" text={clergy?.name ?? 'Assigned clergy'} />
      </Card>

      <SectionTitle>Progress</SectionTitle>
      <Card>
        {timeline.map((item, index) => (
          <View key={item.key} style={styles.timelineRow}>
            <View style={styles.timelineTrack}>
              <View style={[styles.timelineDot, item.state === 'complete' && styles.timelineDotComplete, item.state === 'current' && styles.timelineDotCurrent, item.state === 'stopped' && styles.timelineDotStopped]}>
                <Ionicons name={item.state === 'complete' ? 'checkmark' : item.state === 'stopped' ? 'close' : 'ellipse'} size={12} color={item.state === 'upcoming' ? colors.inkSoft : colors.card} />
              </View>
              {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={styles.timelineCopy}>
              <Text style={[styles.itemTitle, item.state === 'upcoming' && styles.timelineUpcoming]}>{item.label}</Text>
              <Text style={styles.mutedText}>{item.description}</Text>
            </View>
          </View>
        ))}
      </Card>

      <SectionTitle>Documents</SectionTitle>
      <Card>
        <Notice title={`${summary.verified} of ${summary.total} staff verified`} body={`${summary.requiredReady} of ${summary.requiredTotal} required files have been submitted or reviewed.`} tone={summary.requiredReady === summary.requiredTotal ? 'positive' : 'warning'} icon="documents-outline" />
        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
        {appointment.documents.map((document) => (
          <View key={document.id} style={styles.detailDocumentBlock}>
            <View style={styles.detailDocumentRow}>
              <Ionicons name={document.status === 'verified' ? 'checkmark-circle' : document.status === 'needs_action' ? 'alert-circle' : 'document-text-outline'} size={22} color={document.status === 'verified' ? colors.green : document.status === 'needs_action' ? colors.red : colors.gold} />
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{document.label}</Text>
                <Text style={styles.mutedText}>{document.fileName ?? 'No file on record'}</Text>
                {document.note ? <Text style={styles.documentNote}>{document.note}</Text> : null}
              </View>
              <StatusBadge label={documentStatusLabel[document.status]} tone={documentStatusTone[document.status]} />
            </View>
            {['missing', 'needs_action'].includes(document.status) ? (
              <AppButton
                label={document.status === 'needs_action' ? 'Replace file' : 'Upload file'}
                icon="cloud-upload-outline"
                variant="secondary"
                loading={uploadingDocumentId === document.id}
                disabled={Boolean(uploadingDocumentId)}
                onPress={() => void retryUpload(document)}
              />
            ) : null}
          </View>
        ))}
      </Card>
      <Notice title="Need clarification?" body="Contact the parish office for official decisions, schedule changes, or documentary questions." tone="info" />
    </Screen>
  );
};

const NotificationsScreen = ({ notifications, onOpen }: { notifications: AppNotification[]; onOpen: (notification: AppNotification) => Promise<void> }) => (
  <Screen>
    <Text style={styles.lead}>Open a notice to mark it read and go to the related area.</Text>
    {notifications.length ? notifications.map((notification) => (
      <Pressable key={notification.id} accessibilityRole="button" accessibilityLabel={`${notification.readAt ? 'Read' : 'Unread'} notification: ${notification.title}`} onPress={() => void onOpen(notification)} style={({ pressed }) => pressed && styles.cardPressed}>
        <Card style={[styles.notificationCard, !notification.readAt && styles.notificationUnread]}>
          <View style={[styles.notificationDot, notification.readAt && styles.notificationDotRead]} />
          <View style={styles.flex}>
            <View style={styles.notificationTitleRow}>
              <Text style={styles.notificationTitle}>{notification.title}</Text>
              <Text style={styles.noticeTime}>{formatRelativeTime(notification.createdAt)}</Text>
            </View>
            <Text style={styles.mutedText}>{notification.body}</Text>
          </View>
        </Card>
      </Pressable>
    )) : <EmptyCard title="No notifications" body="Appointment, document, and queue updates will appear here." />}
  </Screen>
);

const QueueScreen = ({
  profile,
  ticket,
  loading,
  onJoin,
  onLeave,
}: {
  profile: ParishionerProfile;
  ticket?: RepositorySnapshot['activeQueueTicket'];
  loading: boolean;
  onJoin: (parishId: ParishId, service: QueueService) => Promise<unknown>;
  onLeave: () => Promise<void>;
}) => {
  const [parishId, setParishId] = useState<ParishId>(profile.homeParishId);
  const [service, setService] = useState<QueueService>('General inquiry');
  return (
    <Screen>
      <Notice title="Walk-in support only" body="A queue ticket estimates your place for a parish office visit. It is not an appointment and does not guarantee a completion time." tone="warning" icon="people-outline" />
      {ticket ? (
        <Card style={styles.ticketCard}>
          <Eyebrow>Active ticket</Eyebrow>
          <Text style={styles.ticketNumberLarge}>{ticket.number}</Text>
          <Text style={styles.ticketParish}>{getParish(ticket.parishId)?.name}</Text>
          <StatusBadge label={ticket.status === 'waiting' ? 'Waiting' : ticket.status} tone="warning" />
          <View style={styles.queueStats}>
            <QueueStat value={String(ticket.ahead)} label="people ahead" />
            <View style={styles.verticalDivider} />
            <QueueStat value={ticket.estimatedWaitMinutes === null ? '—' : `~${ticket.estimatedWaitMinutes}`} label={ticket.estimatedWaitMinutes === null ? 'estimate pending' : 'minutes'} />
          </View>
          <Text style={styles.mutedCentered}>For: {ticket.service}. Keep this screen available and follow parish staff instructions.</Text>
          <AppButton label="Leave queue" variant="danger" loading={loading} onPress={() => Alert.alert('Leave this queue?', 'Your current ticket will be released.', [{ text: 'Keep ticket', style: 'cancel' }, { text: 'Leave queue', style: 'destructive', onPress: () => void onLeave() }])} />
        </Card>
      ) : (
        <Card>
          <Eyebrow>Request one ticket</Eyebrow>
          <Text style={styles.cardHeadline}>Plan your parish visit</Text>
          <Text style={styles.fieldLabel}>Parish office</Text>
          <View style={styles.chipWrap}>{PARISHES.map((parish) => <ChoiceChip key={parish.id} label={parish.name} selected={parish.id === parishId} onPress={() => setParishId(parish.id)} />)}</View>
          <Text style={styles.fieldLabel}>Purpose of visit</Text>
          <View style={styles.chipWrap}>{QUEUE_SERVICES.map((item) => <ChoiceChip key={item} label={item} selected={item === service} onPress={() => setService(item)} />)}</View>
          <AppButton label="Join walk-in queue" icon="ticket-outline" loading={loading} onPress={() => void onJoin(parishId, service)} />
        </Card>
      )}
    </Screen>
  );
};

const MoreScreen = ({ snapshot, mode, onNavigate }: { snapshot: RepositorySnapshot; mode: 'demo' | 'api'; onNavigate: (route: Route) => void }) => (
  <Screen>
    <Card style={styles.profileSummary}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initials(snapshot.profile.displayName)}</Text></View>
      <View style={styles.flex}>
        <Text style={styles.itemTitle}>{snapshot.profile.displayName}</Text>
        <Text style={styles.mutedText}>{getParish(snapshot.profile.homeParishId)?.name}</Text>
      </View>
      <StatusBadge label={mode === 'demo' ? 'Demo' : 'Connected'} tone={mode === 'demo' ? 'warning' : 'positive'} />
    </Card>
    <MoreLink icon="notifications-outline" title="Notifications" body={`${snapshot.notifications.filter((item) => !item.readAt).length} unread updates`} onPress={() => onNavigate('notifications')} />
    <MoreLink icon="people-outline" title="Walk-in queue" body={snapshot.activeQueueTicket ? `Active ticket ${snapshot.activeQueueTicket.number}` : 'Request a parish office ticket'} onPress={() => onNavigate('queue')} />
    <MoreLink icon="chatbubbles-outline" title="Parish guide" body="General guidance with a staff handoff boundary" onPress={() => onNavigate('assistant')} />
    <MoreLink icon="person-circle-outline" title="Profile & settings" body="Contact details, home parish, and preferences" onPress={() => onNavigate('profile')} />
    <Notice title="Parishioner-only mobile app" body="Staff, clergy, and system-administration functions belong in the protected admin website, not this mobile interface." tone="info" icon="lock-closed-outline" />
  </Screen>
);

const ProfileScreen = ({
  profile,
  mode,
  loading,
  onSave,
  onChangePassword,
  onSignOut,
  onReset,
}: {
  profile: ParishionerProfile;
  mode: 'demo' | 'api';
  loading: boolean;
  onSave: (profile: ParishionerProfile) => Promise<void>;
  onChangePassword: (input: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<void>;
  onSignOut: () => void;
  onReset: () => Promise<void>;
}) => {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  return (
    <Screen keyboard>
      {mode === 'demo' ? <Notice title="Local demonstration profile" body="Changes stay on this device and do not update any parish record." tone="warning" icon="flask-outline" /> : null}
      <Card>
        <Eyebrow>Personal details</Eyebrow>
        <Text style={styles.cardHeadline}>Your contact profile</Text>
        <Field label="Full name" value={draft.displayName} onChangeText={(displayName) => setDraft({ ...draft, displayName })} />
        <Field label="Email address" value={draft.email} editable={false} keyboardType="email-address" autoCapitalize="none" />
        <Text style={styles.fieldHint}>The sign-in email is protected as the account identifier.</Text>
        <Field label="Mobile number" value={draft.mobileNumber} onChangeText={(mobileNumber) => setDraft({ ...draft, mobileNumber })} keyboardType="phone-pad" />
        <Text style={styles.fieldLabel}>Home parish</Text>
        <View style={styles.chipWrap}>{PARISHES.map((parish) => <ChoiceChip key={parish.id} label={parish.name} selected={parish.id === draft.homeParishId} onPress={() => setDraft({ ...draft, homeParishId: parish.id })} />)}</View>
        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <Text style={styles.itemTitle}>Notifications</Text>
            <Text style={styles.mutedText}>Allow appointment and queue reminders when supported by the deployed app.</Text>
          </View>
          <Switch accessibilityLabel="Enable notifications" value={draft.notificationsEnabled} onValueChange={(notificationsEnabled) => setDraft({ ...draft, notificationsEnabled })} trackColor={{ false: colors.line, true: colors.greenSoft }} thumbColor={draft.notificationsEnabled ? colors.green : colors.inkSoft} />
        </View>
        {saved ? <Text style={styles.savedText}>Profile changes saved.</Text> : null}
        <AppButton label="Save profile" icon="save-outline" loading={loading} disabled={loading || !draft.displayName.trim() || !draft.email.trim()} onPress={() => void onSave(draft).then(() => setSaved(true)).catch(() => undefined)} />
      </Card>
      <Card>
        <Eyebrow>Account security</Eyebrow>
        <Text style={styles.cardHeadline}>Change password</Text>
        <Text style={styles.mutedText}>Changing your password signs out other devices while keeping this one active.</Text>
        <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
        <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <Text style={styles.fieldHint}>12–128 characters with uppercase and lowercase letters plus a number.</Text>
        <Field label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        {passwordSaved ? <Text style={styles.savedText}>Password changed. Other sessions were signed out.</Text> : null}
        <AppButton label="Change password" icon="key-outline" loading={loading} disabled={loading || !currentPassword || !newPassword || !confirmPassword} onPress={() => void onChangePassword({ currentPassword, newPassword, confirmPassword }).then(() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordSaved(true); }).catch(() => undefined)} />
      </Card>
      <Card>
        <Text style={styles.itemTitle}>Privacy and account</Text>
        <Text style={styles.mutedText}>Avoid uploading documents unless the selected parish has asked for them. Official archive changes require parish staff.</Text>
        <AppButton label="Sign out" variant="secondary" icon="log-out-outline" onPress={onSignOut} />
        {mode === 'demo' ? <AppButton label="Reset sample data" variant="danger" icon="refresh-outline" onPress={() => Alert.alert('Reset demonstration?', 'This removes local sample changes and restores the original demonstration.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: () => void onReset() }])} /> : null}
      </Card>
    </Screen>
  );
};

const BottomNavigation = ({ active, onNavigate }: { active: Route; onNavigate: (route: Route) => void }) => (
  <SafeAreaView edges={['bottom']} style={styles.bottomSafe}>
    <View style={styles.bottomNav} accessibilityRole="tablist">
      <NavItem icon="home-outline" activeIcon="home" label="Home" active={active === 'home'} onPress={() => onNavigate('home')} />
      <NavItem icon="grid-outline" activeIcon="grid" label="Services" active={active === 'services'} onPress={() => onNavigate('services')} />
      <NavItem icon="calendar-outline" activeIcon="calendar" label="Appointments" active={active === 'appointments'} onPress={() => onNavigate('appointments')} />
      <NavItem icon="ellipsis-horizontal-circle-outline" activeIcon="ellipsis-horizontal-circle" label="More" active={active === 'more'} onPress={() => onNavigate('more')} />
    </View>
  </SafeAreaView>
);

const NavItem = ({ icon, activeIcon, label, active, onPress }: { icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void }) => (
  <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={styles.navItem}>
    <Ionicons name={active ? activeIcon : icon} size={22} color={active ? colors.oxblood : colors.inkSoft} />
    <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
  </Pressable>
);

const FormSection = ({ number, title, children }: { number: string; title: string; children: React.ReactNode }) => (
  <Card>
    <View style={styles.formHeading}>
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View>
      <Text style={styles.formTitle}>{title}</Text>
    </View>
    <Divider />
    {children}
  </Card>
);

const Field = (props: React.ComponentProps<typeof TextInput> & { label: string }) => {
  const { label, ...inputProps } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.inkSoft} style={styles.input} {...inputProps} />
    </View>
  );
};

const Feature = ({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) => (
  <View style={styles.feature}>
    <IconTile name={icon} />
    <View style={styles.flex}><Text style={styles.itemTitle}>{title}</Text><Text style={styles.mutedText}>{body}</Text></View>
  </View>
);

const QuickAction = ({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.cardPressed]}>
    <IconTile name={icon} />
    <Text style={styles.quickActionLabel}>{label}</Text>
    <Ionicons name="arrow-forward" size={17} color={colors.oxblood} />
  </Pressable>
);

const MoreLink = ({ icon, title, body, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.moreLink, pressed && styles.cardPressed]}>
    <IconTile name={icon} />
    <View style={styles.flex}><Text style={styles.itemTitle}>{title}</Text><Text style={styles.mutedText}>{body}</Text></View>
    <Ionicons name="chevron-forward" size={21} color={colors.oxblood} />
  </Pressable>
);

const InfoRow = ({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) => (
  <View style={styles.infoRow}><Ionicons name={icon} size={17} color={colors.gold} /><Text style={styles.infoText}>{text}</Text></View>
);

const ReviewRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.reviewRow}><Text style={styles.reviewLabel}>{label}</Text><Text style={styles.reviewValue}>{value}</Text></View>
);

const QueueStat = ({ value, label }: { value: string; label: string }) => (
  <View style={styles.queueStat}><Text style={styles.queueStatValue}>{value}</Text><Text style={styles.queueStatLabel}>{label}</Text></View>
);

const EmptyCard = ({ title, body }: { title: string; body: string }) => (
  <Card style={styles.emptyCard}><Ionicons name="leaf-outline" size={28} color={colors.gold} /><Text style={styles.itemTitle}>{title}</Text><Text style={styles.mutedCentered}>{body}</Text></Card>
);

const EmptyState = ({ icon, title, body, action }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; action: React.ReactNode }) => (
  <View style={styles.emptyState}><Ionicons name={icon} size={40} color={colors.gold} /><Text style={type.title}>{title}</Text><Text style={styles.mutedCentered}>{body}</Text>{action}</View>
);

const LoadingScreen = ({ label }: { label: string }) => (
  <SafeAreaView style={styles.loadingScreen}><BrandMark /><ActivityIndicator size="large" color={colors.oxblood} /><Text style={styles.mutedText}>{label}</Text></SafeAreaView>
);

const makeChecklist = (serviceId: SacramentId): AppointmentDocument[] => {
  const service = getService(serviceId)!;
  return service.requirements.map((label, index) => {
    const required = !/if available/i.test(label);
    return {
      id: `${serviceId}-requirement-${index + 1}`,
      label,
      required,
      status: required ? 'missing' : 'not_required',
      note: required ? 'Select a file before submitting.' : 'Optional if available.',
    };
  });
};

const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

const formatRelativeTime = (iso: string) => {
  const milliseconds = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

export default function App() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  return (
    <SafeAreaProvider>
      {fontsLoaded ? <AppContent /> : <LoadingScreen label="Opening ParishLink…" />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { backgroundColor: colors.paper, flex: 1 },
  screenHost: { flex: 1 },
  screenScroll: { gap: spacing.lg, padding: spacing.md, paddingBottom: 120 },
  screenScrollWide: { alignSelf: 'center', maxWidth: 760, width: '100%' },
  welcomeBackground: { flex: 1 },
  welcomeSafe: { flex: 1 },
  welcomeScroll: { alignItems: 'center', gap: spacing.xl, minHeight: '100%', padding: spacing.xl, paddingBottom: 48 },
  welcomeBrand: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  welcomeTitle: { color: colors.card, fontFamily: fonts.displayBold, fontSize: 48, lineHeight: 52 },
  welcomeSubtitle: { color: colors.paperLight, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, maxWidth: 330, textAlign: 'center' },
  welcomeCard: { gap: spacing.md, maxWidth: 520, width: '100%' },
  welcomeFooter: { color: colors.paperLight, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, maxWidth: 500, opacity: 0.88, textAlign: 'center' },
  cardHeadline: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 27, lineHeight: 31 },
  authModeSwitch: { backgroundColor: colors.paperLight, borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', padding: spacing.xxs },
  authModeButton: { alignItems: 'center', borderRadius: radii.pill, flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  authModeButtonActive: { backgroundColor: colors.oxblood },
  authModeText: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 14 },
  authModeTextActive: { color: colors.paperLight },
  authSection: { gap: spacing.sm, marginTop: spacing.sm },
  authSectionLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14 },
  fieldHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: -spacing.xs },
  privacyConsent: { alignItems: 'flex-start', backgroundColor: colors.paperLight, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.sm },
  checkbox: { alignItems: 'center', borderColor: colors.oxblood, borderRadius: 5, borderWidth: 1.5, height: 22, justifyContent: 'center', marginTop: 1, width: 22 },
  checkboxChecked: { backgroundColor: colors.oxblood },
  privacyConsentText: { color: colors.inkSoft, flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  privacyNote: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  feature: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  header: { alignItems: 'center', borderBottomColor: colors.gold, borderBottomWidth: 1, flexDirection: 'row', minHeight: 70, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerSide: { alignItems: 'center', width: 48 },
  headerButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xs },
  headerEyebrow: { color: colors.goldSoft, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase' },
  headerTitle: { color: colors.card, fontFamily: fonts.displayBold, fontSize: 23, lineHeight: 27 },
  unreadDot: { alignItems: 'center', backgroundColor: colors.goldSoft, borderRadius: 8, height: 16, justifyContent: 'center', position: 'absolute', right: 2, top: 2, width: 16 },
  unreadDotText: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 9 },
  globalNotice: { backgroundColor: colors.paper, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  heroCard: { borderColor: colors.gold, borderRadius: radii.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.xl, ...shadow },
  heroTitle: { color: colors.card, fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 38 },
  heroBody: { color: colors.paperLight, fontFamily: fonts.body, fontSize: 15, lineHeight: 23, marginBottom: spacing.sm },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickAction: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 68, padding: spacing.sm, width: '48%', ...shadow },
  quickActionLabel: { color: colors.ink, flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20 },
  appointmentCard: { gap: spacing.xs, marginBottom: spacing.md },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  rowBetweenTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  serviceHeaderCompact: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
  reminderCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  lead: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: -spacing.sm },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22 },
  reference: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.5 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  mutedCentered: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  ticketNumber: { color: colors.oxblood, fontFamily: fonts.displayBold, fontSize: 34 },
  infoRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  infoText: { color: colors.inkSoft, flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  inlineLink: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: spacing.xxs, marginTop: spacing.xs },
  inlineLinkText: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 14 },
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
  formHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  stepNumber: { alignItems: 'center', backgroundColor: colors.oxblood, borderRadius: radii.pill, height: 30, justifyContent: 'center', width: 30 },
  stepNumberText: { color: colors.card, fontFamily: fonts.bodyBold, fontSize: 12 },
  formTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 22 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  horizontalChips: { gap: spacing.xs, paddingVertical: spacing.xxs },
  fieldLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14, marginBottom: spacing.xs, marginTop: spacing.md },
  helperText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  documentRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  documentHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  selectedFileNote: { color: colors.oxblood, fontFamily: fonts.bodySemibold, fontSize: 12, lineHeight: 18, marginTop: 3 },
  reviewRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingVertical: spacing.sm },
  reviewLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 13 },
  reviewValue: { color: colors.ink, flex: 1, fontFamily: fonts.bodyBold, fontSize: 13, textAlign: 'right' },
  errorText: { color: colors.red, fontFamily: fonts.bodySemibold, fontSize: 13, lineHeight: 20 },
  detailHero: { gap: spacing.xs },
  detailTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 30, marginTop: spacing.sm },
  timelineRow: { flexDirection: 'row', gap: spacing.sm },
  timelineTrack: { alignItems: 'center', width: 24 },
  timelineDot: { alignItems: 'center', backgroundColor: colors.line, borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  timelineDotComplete: { backgroundColor: colors.green },
  timelineDotCurrent: { backgroundColor: colors.oxblood },
  timelineDotStopped: { backgroundColor: colors.red },
  timelineLine: { backgroundColor: colors.line, flex: 1, minHeight: 36, width: 2 },
  timelineCopy: { flex: 1, paddingBottom: spacing.lg },
  timelineUpcoming: { color: colors.inkSoft },
  detailDocumentBlock: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingBottom: spacing.md },
  detailDocumentRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  documentNote: { color: colors.oxblood, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  notificationCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  notificationTitleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  notificationTitle: { color: colors.ink, flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22, minWidth: 0 },
  notificationUnread: { backgroundColor: colors.cardStrong, borderColor: colors.gold },
  notificationDot: { backgroundColor: colors.oxblood, borderRadius: 5, height: 10, marginTop: 5, width: 10 },
  notificationDotRead: { backgroundColor: colors.line },
  noticeTime: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 12 },
  ticketCard: { alignItems: 'center', gap: spacing.md },
  ticketNumberLarge: { color: colors.oxblood, fontFamily: fonts.displayBold, fontSize: 64, lineHeight: 68 },
  ticketParish: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, textAlign: 'center' },
  queueStats: { alignItems: 'center', backgroundColor: colors.paperLight, borderRadius: radii.md, flexDirection: 'row', padding: spacing.md, width: '100%' },
  queueStat: { alignItems: 'center', flex: 1 },
  queueStatValue: { color: colors.oxblood, fontFamily: fonts.displayBold, fontSize: 31 },
  queueStatLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 13 },
  verticalDivider: { backgroundColor: colors.line, height: 46, width: 1 },
  profileSummary: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  avatar: { alignItems: 'center', backgroundColor: colors.oxblood, borderColor: colors.gold, borderRadius: 26, borderWidth: 2, height: 52, justifyContent: 'center', width: 52 },
  avatarText: { color: colors.card, fontFamily: fonts.displayBold, fontSize: 20 },
  moreLink: { alignItems: 'center', backgroundColor: colors.card, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 74, padding: spacing.md },
  settingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginVertical: spacing.lg },
  savedText: { color: colors.green, fontFamily: fonts.bodyBold, fontSize: 14, marginBottom: spacing.sm },
  bottomSafe: { backgroundColor: colors.card },
  bottomNav: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', minHeight: 62 },
  navItem: { alignItems: 'center', flex: 1, gap: 3, justifyContent: 'center', minHeight: 58 },
  navLabel: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 12 },
  navLabelActive: { color: colors.oxblood, fontFamily: fonts.bodyBold },
  field: { marginTop: spacing.sm },
  input: { backgroundColor: colors.cardStrong, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, color: colors.ink, fontFamily: fonts.body, fontSize: 16, minHeight: 50, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  emptyCard: { alignItems: 'center', gap: spacing.xs },
  emptyState: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.xl },
  loadingScreen: { alignItems: 'center', backgroundColor: colors.paper, flex: 1, gap: spacing.lg, justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
