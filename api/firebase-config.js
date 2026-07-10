function parseFirebaseConfig() {
  if (process.env.FIREBASE_WEB_CONFIG_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_WEB_CONFIG_JSON);
    } catch {
      return null;
    }
  }

  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  };

  return Object.values(config).every(Boolean) ? config : null;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const firebaseConfig = parseFirebaseConfig();
  const vapidKey = process.env.FIREBASE_VAPID_KEY || '';
  const webPushPublicKey = process.env.WEB_PUSH_PUBLIC_KEY || '';
  const missing = [];

  if (!firebaseConfig) missing.push('FIREBASE_WEB_CONFIG_JSON or FIREBASE_* web config');

  res.status(200).json({
    enabled: missing.length === 0,
    firebaseConfig: missing.length === 0 ? firebaseConfig : null,
    vapidKey: vapidKey || null,
    webPushPublicKey: webPushPublicKey || null,
    missing,
  });
}
