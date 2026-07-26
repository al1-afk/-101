import type { CapacitorConfig } from '@capacitor/cli';

/* NEXT GITAL — coque native (Capacitor).
   L'app charge le site déployé en live : toute mise à jour web est
   immédiatement reflétée dans l'app, sans recompiler l'APK. */
const config: CapacitorConfig = {
  appId: 'tech.nextgital.gestion',
  appName: 'NEXT GITAL',
  webDir: 'dist',
  server: {
    url: 'https://101.nextgital.tech',
    cleartext: false,
  },
  android: {
    backgroundColor: '#060d1c',
  },
};

export default config;
