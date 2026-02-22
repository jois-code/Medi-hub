// ─── Medilocker — main.js ─────────────────────────────────────────────────────
// Entry point. Boots Vue, wires the router.
//
// Auth flow:
//   - Firebase client SDK maintains the session across page refreshes.
//   - On load, we wait for Firebase's onAuthStateChanged before doing anything,
//     so we always have a valid ID token before hitting the backend.
//   - If Firebase is NOT configured, the app shows a setup notice on the login page.

import { router }   from './router.js';
import { appState, clearAuth } from './services/state.js';
import api          from './services/api.js';

const { createApp, onMounted } = Vue;

// ── Wait for Firebase auth state before navigating ────────────────────────────
function waitForFirebaseAuth() {
  return new Promise((resolve) => {
    const auth = window._firebaseAuth;
    if (!auth) {
      // Firebase not configured — resolve immediately (login page will explain)
      resolve(null);
      return;
    }

    if (typeof auth.onAuthStateChanged === 'function') {
      // onAuthStateChanged fires once with the current user (or null) on load
      const unsubscribe = auth.onAuthStateChanged((user) => {
        unsubscribe(); // Only need it once
        resolve(user);
      });
      return;
    }

    // Some Firebase bundles expose only currentUser without an observer method.
    resolve(auth.currentUser || null);
  });
}

const App = {
  setup() {
    onMounted(async () => {
      // Wait for Firebase to restore session from its own cache
      const firebaseUser = await waitForFirebaseAuth();

      if (firebaseUser) {
        // Firebase has a live session — get fresh token
        try {
          const token = await firebaseUser.getIdToken(false);
          if (token) {
            window.appState.token = token.trim();
            localStorage.setItem('ml_token', token.trim());
          }
        } catch (e) {
          console.warn('[main] Could not get Firebase token on mount:', e.message);
        }
      } else if (window._firebaseAuth) {
        // Firebase is configured but no user is signed in — clear any stale token
        clearAuth();
      }
      // If Firebase is not configured at all, leave the stored token as-is
      // (useful for development without Firebase)

      if (!appState.token) return;

      // Initial unread count
      try {
        const data = await api.get('/notifications');
        appState.unreadCount = data.unreadCount ?? 0;
      } catch { /* ignore — user may not have a profile yet */ }

      // Poll every 60 seconds while the tab is active
      setInterval(async () => {
        if (!appState.token) return;
        try {
          const data = await api.get('/notifications');
          appState.unreadCount = data.unreadCount ?? 0;
        } catch { /* silent */ }
      }, 60_000);
    });

    return {};
  },
  template: `<router-view />`,
};

const app = createApp(App);
app.use(router);
app.mount('#app');
