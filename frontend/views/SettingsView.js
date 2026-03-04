// ─── Settings View ────────────────────────────────────────────────────────────
import api from '../services/api.js';
import { appState, showToast, clearAuth } from '../services/state.js';

const { ref, reactive, onMounted, defineComponent } = Vue;
const { useRouter } = VueRouter;

export const SettingsView = defineComponent({
  name: 'SettingsView',
  setup() {
    const router    = useRouter();
    const loading   = ref(true);
    const saving    = ref(false);
    const profile   = ref(null);
    const resetting = ref(false);

    const form = reactive({
      displayName: '',
      phone: '',
    });

    const prefs = reactive({
      emailNotifications: true,
    });

    onMounted(async () => {
      try {
        const { profile: p } = await api.get('/settings/profile');
        profile.value = p;
        form.displayName = p.displayName || '';
        form.phone = p.phone || '';
        prefs.emailNotifications = p.preferences?.emailNotifications !== false;
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        loading.value = false;
      }
    });

    async function saveProfile() {
      saving.value = true;
      try {
        const payload = {};
        if (form.displayName !== profile.value.displayName) payload.displayName = form.displayName;
        if (form.phone !== (profile.value.phone || '')) payload.phone = form.phone || undefined;

        if (Object.keys(payload).length === 0) {
          showToast('No changes to save');
          return;
        }
        await api.patch('/settings/profile', payload);
        if (payload.displayName) {
          appState.user = { ...appState.user, displayName: payload.displayName };
        }
        profile.value = { ...profile.value, ...payload };
        showToast('Profile updated');
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        saving.value = false;
      }
    }

    async function savePreferences() {
      try {
        await api.patch('/settings/preferences', { emailNotifications: prefs.emailNotifications });
        showToast('Preferences saved');
      } catch (e) {
        showToast(e.message, 'error');
      }
    }

    async function sendPasswordReset() {
      if (!profile.value?.email) return;
      resetting.value = true;
      try {
        const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        await sendPasswordResetEmail(window._firebaseAuth, profile.value.email);
        showToast('Password reset email sent. Check your inbox.');
      } catch (e) {
        showToast(e.message || 'Failed to send reset email', 'error');
      } finally {
        resetting.value = false;
      }
    }

    function logout() {
      if (!confirm('Are you sure you want to sign out?')) return;
      if (window._firebaseAuth?.currentUser) {
        window._firebaseAuth.signOut().catch(() => {});
      }
      clearAuth();
      router.push('/login');
    }

    function formatDate(val) {
      if (!val) return 'N/A';
      const ms = val.seconds ? val.seconds * 1000 : val._seconds ? val._seconds * 1000 : new Date(val).getTime();
      return new Date(ms).toLocaleString('en-IN');
    }

    return { loading, saving, profile, form, prefs, resetting, saveProfile, savePreferences, sendPasswordReset, logout, formatDate };
  },

  template: `
    <div class="p-6 max-w-2xl mx-auto animate-fade-in">
      <div class="mb-6">
        <p class="mono text-ink-500 text-xs mb-1">— Account</p>
        <h1 class="serif text-3xl text-ink-100">Settings</h1>
      </div>

      <div v-if="loading" class="space-y-4">
        <div class="card p-6 animate-pulse h-40"></div>
        <div class="card p-6 animate-pulse h-28"></div>
      </div>

      <template v-else-if="profile">
        <!-- Profile Section -->
        <div class="card p-5 mb-4">
          <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-4">Profile</p>

          <div class="flex items-center gap-3 mb-5">
            <div class="w-12 h-12 rounded-full bg-sage-900 border border-sage-700/50 flex items-center justify-center text-sage-400 text-xl font-mono flex-shrink-0">
              {{ ((profile.displayName || '?')[0] || '?').toUpperCase() }}
            </div>
            <div>
              <p class="text-ink-200 font-medium">{{ profile.displayName }}</p>
              <p class="text-xs text-ink-500 mono">{{ profile.email }}</p>
              <span class="tag-badge mt-1">{{ profile.role }}</span>
            </div>
          </div>

          <div class="space-y-4">
            <div>
              <label>Display Name</label>
              <input v-model="form.displayName" type="text" class="input-field" placeholder="Your name" />
            </div>
            <div>
              <label>Phone (optional)</label>
              <input v-model="form.phone" type="tel" class="input-field" placeholder="+91 98765 43210" />
            </div>
          </div>

          <button @click="saveProfile" :disabled="saving" class="btn-primary mt-4 w-full">
            {{ saving ? 'Saving…' : 'Save Profile' }}
          </button>
        </div>

        <!-- Security Section -->
        <div class="card p-5 mb-4">
          <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-4">Security</p>

          <div class="flex items-center justify-between mb-4">
            <div>
              <p class="text-sm text-ink-200">Password Reset</p>
              <p class="text-xs text-ink-500 mt-0.5">We'll send a reset link to {{ profile.email }}</p>
            </div>
            <button @click="sendPasswordReset" :disabled="resetting" class="btn-ghost text-sm">
              {{ resetting ? 'Sending…' : 'Send Reset Email' }}
            </button>
          </div>

          <div v-if="profile.lastLogin" class="flex items-center justify-between text-sm">
            <span class="text-ink-500">Last login</span>
            <span class="mono text-xs text-ink-600">{{ formatDate(profile.lastLogin) }}</span>
          </div>
        </div>

        <!-- Preferences Section -->
        <div class="card p-5 mb-4">
          <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-4">Preferences</p>

          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-ink-200">Email Notifications</p>
              <p class="text-xs text-ink-500 mt-0.5">Receive updates about access requests and appointments</p>
            </div>
            <button @click="prefs.emailNotifications = !prefs.emailNotifications; savePreferences()"
              :class="['w-10 h-6 rounded-full transition-all relative', prefs.emailNotifications ? 'bg-sage-600' : 'bg-ink-700']">
              <span :class="['absolute top-1 w-4 h-4 rounded-full bg-white transition-all', prefs.emailNotifications ? 'right-1' : 'left-1']"></span>
            </button>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="card p-5 border border-rust-500/20">
          <p class="mono text-xs text-rust-400 uppercase tracking-wider mb-4">Danger Zone</p>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-ink-200">Sign Out</p>
              <p class="text-xs text-ink-500 mt-0.5">You will need to sign in again to access your records</p>
            </div>
            <button @click="logout" class="btn-danger text-sm">⊗ Sign Out</button>
          </div>
        </div>
      </template>
    </div>
  `,
});
