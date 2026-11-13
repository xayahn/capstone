import { CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond/600SemiBold';
import { CormorantGaramond_700Bold } from '@expo-google-fonts/cormorant-garamond/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from './src/components/navigation/AppHeader';
import { BottomNavigation, type MainNavTab } from './src/components/navigation/BottomNavigation';
import { AppButton, BrandMark, EmptyState, LoadingScreen, Notice } from './src/components/ui';
import { useParishLink } from './src/hooks/useParishLink';
import { AnnouncementsScreen } from './src/screens/AnnouncementsScreen';
import { AppointmentDetailScreen } from './src/screens/AppointmentDetailScreen';
import { AppointmentsScreen } from './src/screens/AppointmentsScreen';
import { AssistantScreen, initialAssistantMessages } from './src/screens/AssistantScreen';
import { BookingScreen } from './src/screens/BookingScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { MoreScreen, type RouteTarget } from './src/screens/MoreScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { ParishesScreen } from './src/screens/ParishesScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { QueueScreen } from './src/screens/QueueScreen';
import { ServicesScreen } from './src/screens/ServicesScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { colors, fonts, spacing } from './src/theme';
import type { AssistantAction, AssistantMessage, SacramentId } from './src/types/domain';

export type Route = RouteTarget;

const mainRoutes = new Set<Route>(['home', 'services', 'appointments', 'assistant', 'more']);

const backRoute: Record<Route, Route> = {
  home: 'home',
  services: 'services',
  appointments: 'appointments',
  more: 'more',
  booking: 'services',
  'appointment-detail': 'appointments',
  notifications: 'more',
  announcements: 'more',
  parishes: 'more',
  queue: 'more',
  assistant: 'home',
  profile: 'more',
};

const titleByRoute: Record<Route, string> = {
  home: 'ParishLink',
  services: 'Sacramental services',
  appointments: 'My appointments',
  more: 'More',
  booking: 'Request an appointment',
  'appointment-detail': 'Appointment details',
  notifications: 'Notifications',
  announcements: 'Announcements',
  parishes: 'Parishes & office hours',
  queue: 'Walk-in queue',
  assistant: 'AI Assistant',
  profile: 'Profile & settings',
};

const AppContent = () => {
  const parishLink = useParishLink();
  const [route, setRoute] = useState<Route>('home');
  const [routeHistory, setRouteHistory] = useState<Route[]>([]);
  const [bookingServiceId, setBookingServiceId] = useState<SacramentId>('baptism');
  const [focusedServiceId, setFocusedServiceId] = useState<SacramentId>();
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(initialAssistantMessages);
  const [allowExternalAI, setAllowExternalAI] = useState(false);

  useEffect(() => {
    setRoute('home');
    setRouteHistory([]);
    setFocusedServiceId(undefined);
    setSelectedAppointmentId('');
    setAssistantMessages(initialAssistantMessages());
    setAllowExternalAI(false);
  }, [parishLink.session?.profile.id, parishLink.session?.accessToken]);

  useEffect(() => {
    const notification = parishLink.openedPushNotification;
    if (!notification || !parishLink.session || !parishLink.snapshot) return;
    setRouteHistory([]);
    if (notification.target.kind === 'appointment') {
      setSelectedAppointmentId(notification.target.appointmentId);
      setRoute('appointment-detail');
    } else if (notification.target.kind === 'queue') {
      setRoute('queue');
    } else {
      setRoute('notifications');
    }
    if (!notification.readAt) void parishLink.markNotificationRead(notification.id).catch(() => undefined);
  }, [parishLink.openedPushNotification, parishLink.session?.profile.id]);

  if (parishLink.initializing) {
    return <LoadingScreen label="Restoring your secure ParishLink session…" />;
  }

  if (parishLink.initializationError && !parishLink.session) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <BrandMark />
        <Text style={styles.itemTitle}>Connection interrupted</Text>
        <Text style={styles.mutedCentered}>{parishLink.error}</Text>
        <AppButton label="Try again" onPress={parishLink.retryInitialization} />
        <AppButton label="Sign out on this device" variant="secondary" onPress={() => void parishLink.signOut()} />
      </SafeAreaView>
    );
  }

  if (!parishLink.session) {
    return (
      <WelcomeScreen
        loading={parishLink.loading}
        error={parishLink.error}
        mode={parishLink.repositoryMode}
        onSignIn={parishLink.signIn}
        onSignUp={parishLink.signUp}
        recoveryActions={{ request: parishLink.requestPasswordReset, confirm: parishLink.confirmPasswordReset }}
        onClearError={parishLink.clearError}
      />
    );
  }

  if (!parishLink.snapshot) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <BrandMark />
        <Text style={styles.itemTitle}>{parishLink.loading ? 'Loading your dashboard…' : 'Your dashboard could not load'}</Text>
        <Text style={styles.mutedCentered}>{parishLink.error || 'Check your connection, then try again.'}</Text>
        <AppButton label="Retry dashboard" loading={parishLink.loading} onPress={() => void parishLink.refresh().catch(() => undefined)} />
        <AppButton label="Sign out on this device" variant="secondary" onPress={() => void parishLink.signOut()} />
      </SafeAreaView>
    );
  }

  const snapshot = parishLink.snapshot;

  const navigate = (nextRoute: Route) => {
    if (nextRoute === route) return;
    setRouteHistory((current) => [...current, route].slice(-20));
    setRoute(nextRoute);
  };

  const navigateMain = (nextRoute: MainNavTab) => {
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
    navigate('parishes');
  };

  const selectedAppointment = snapshot.appointments.find((appointment) => appointment.id === selectedAppointmentId);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <AppHeader
        title={titleByRoute[route]}
        isRoot={mainRoutes.has(route) && (route === 'assistant' || routeHistory.at(-1) !== 'assistant')}
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
            onAnnouncements={() => navigate('announcements')}
            onParishes={() => navigate('parishes')}
            onQueue={() => navigate('queue')}
            onAssistant={() => navigate('assistant')}
          />
        ) : null}
        {route === 'services' ? <ServicesScreen focusedServiceId={focusedServiceId} onBook={openBooking} /> : null}
        {route === 'appointments' ? (
          <AppointmentsScreen appointments={snapshot.appointments} onOpen={openAppointment} />
        ) : null}
        {route === 'more' ? (
          <MoreScreen snapshot={snapshot} mode={parishLink.repositoryMode} onNavigate={navigate} />
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
              onSearchAvailability={parishLink.searchAvailability}
              onCancel={parishLink.cancelAppointment}
              onReschedule={parishLink.requestReschedule}
              onWithdraw={parishLink.withdrawChangeRequest}
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
        {route === 'announcements' ? (
          <AnnouncementsScreen
            announcements={snapshot.announcements ?? []}
            homeParishId={snapshot.profile.homeParishId}
          />
        ) : null}
        {route === 'parishes' ? (
          <ParishesScreen
            homeParishId={snapshot.profile.homeParishId}
            onExploreServices={() => openServices()}
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
            key={parishLink.session.profile.id}
            messages={assistantMessages}
            setMessages={setAssistantMessages}
            onAsk={parishLink.askAssistant}
            onAction={handleAssistantAction}
            allowExternalAI={allowExternalAI}
            onToggleExternalAI={setAllowExternalAI}
            canUseGemini={parishLink.repositoryMode === 'api'}
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
            pushState={parishLink.pushState}
            onEnablePush={parishLink.enablePush}
            onRetryPush={parishLink.retryPush}
            onNotificationSettings={parishLink.openNotificationSettings}
            onRequestEmailVerification={parishLink.requestEmailVerification}
            onConfirmEmailVerification={parishLink.confirmEmailVerification}
          />
        ) : null}
      </View>
      {mainRoutes.has(route) ? <BottomNavigation active={route} onNavigate={navigateMain} /> : null}
    </SafeAreaView>
  );
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
  safeArea: { backgroundColor: colors.paper, flex: 1 },
  screenHost: { flex: 1 },
  globalNotice: { backgroundColor: colors.paper, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16.5, lineHeight: 23 },
  mutedCentered: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22, textAlign: 'center' },
  loadingScreen: { alignItems: 'center', backgroundColor: colors.paper, flex: 1, gap: spacing.lg, justifyContent: 'center' },
});
