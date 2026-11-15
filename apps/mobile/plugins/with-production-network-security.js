const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Preview and production builds must never opt into Android cleartext networking.
 * Development builds allow cleartext HTTP only so physical Android devices on local
 * Wi-Fi can reach the LAN ParishLink development server; preview and release API
 * origins are independently required to use public HTTPS URLs by app.config.ts.
 */
module.exports = function withProductionNetworkSecurity(config) {
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application manifest is unavailable.');
    const appEnv = (process.env.EXPO_PUBLIC_APP_ENV || 'development').trim().toLowerCase();
    application.$ = application.$ ?? {};
    application.$['android:usesCleartextTraffic'] = appEnv === 'development' ? 'true' : 'false';
    return result;
  });
};
