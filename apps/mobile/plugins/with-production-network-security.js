const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Production builds must never opt into Android cleartext networking. Local
 * development continues through Expo Go; preview and release API origins are
 * independently required to use public HTTPS URLs by app.config.ts.
 */
module.exports = function withProductionNetworkSecurity(config) {
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application manifest is unavailable.');
    application.$ = application.$ ?? {};
    application.$['android:usesCleartextTraffic'] = 'false';
    return result;
  });
};
