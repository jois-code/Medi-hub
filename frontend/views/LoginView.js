// ─── Login / Register View ────────────────────────────────────────────────────
// IMPORTANT: The backend uses Firebase Admin SDK's verifyIdToken() to authenticate
// ALL requests. This means every API call MUST carry a real Firebase ID token.
//
// Flow:
//   1. Sign in / sign up with Firebase client SDK → get Firebase ID token
//   2. Send that token as "Bearer <token>" on every API call
//   3. Backend verifies it with auth.verifyIdToken()
//
// The fallback demo path below uses Firebase email/password auth —
// it requires Firebase to be configured in index.html.

import api from '../services/api.js';
import { appState, setAuth, showToast } from '../services/state.js';

const { ref, reactive, defineComponent } = Vue;
const { useRouter } = VueRouter;

export const LoginView = defineComponent({
  name: 'LoginView',
  setup() {
    const router  = useRouter();
    const mode    = ref('login');
    const role    = ref('patient');
    const loading = ref(false);
    const error   = ref('');

    const form = reactive({
      email: '', password: '', displayName: '',
      dateOfBirth: '', gender: 'male', bloodGroup: '',
      specialization: '', licenseNumber: '',
      qualifications: '', yearsOfExperience: 0,
    });

    // ── Check whether Firebase client SDK is available ─────────────────────────
    function firebaseReady() {
      const hasCore = !!(window._firebaseAuth && window._firebaseSignIn);
      if (mode.value === 'register') {
        return hasCore && !!window._firebaseSignUp;
      }
      return hasCore;
    }


    function validateRegistrationForm() {
      if (!form.displayName || form.displayName.trim().length < 2) {
        return 'Please enter your full name (at least 2 characters).';
      }

      if (role.value === 'patient') {
        if (!form.dateOfBirth) return 'Please select your date of birth.';
        if (!['male', 'female', 'other', 'prefer_not_to_say'].includes(form.gender)) {
          return 'Please select a valid gender.';
        }
      }

      if (role.value === 'doctor') {
        if (!form.specialization || form.specialization.trim().length < 2) {
          return 'Please enter your specialization.';
        }
        if (!form.licenseNumber || form.licenseNumber.trim().length < 4) {
          return 'Please enter a valid license number.';
        }
        const quals = form.qualifications
          .split(',')
          .map((q) => q.trim())
          .filter(Boolean);
        if (!quals.length) {
          return 'Please add at least one qualification.';
        }
      }

      return null;
    }

    async function handleSubmit() {
      if (!form.email || !form.password) {
        error.value = 'Email and password are required.';
        return;
      }

      if (!firebaseReady()) {
        error.value = mode.value === 'register'
          ? 'Firebase register SDK is not configured. Please expose window._firebaseSignUp in index.html.'
          : 'Firebase login SDK is not configured. Please expose window._firebaseAuth and window._firebaseSignIn in index.html.';
        return;
      }

      if (mode.value === 'register') {
        const registrationError = validateRegistrationForm();
        if (registrationError) {
          error.value = registrationError;
          return;
        }
      }

      loading.value = true;
      error.value   = '';

      try {
        // ── Step 1: Authenticate with Firebase to get a real ID token ──────────
        let firebaseUser;
        let profileCreated = false;

        if (mode.value === 'login') {
          const cred = await window._firebaseSignIn(
            window._firebaseAuth, form.email, form.password
          );
          firebaseUser = cred.user;
        } else {
          // Register: create Firebase account first
          const cred = await window._firebaseSignUp(
            window._firebaseAuth, form.email, form.password
          );
          firebaseUser = cred.user;
        }

        // Force-refresh so we always have a fresh token
        const idToken = await firebaseUser.getIdToken(true);

        if (!idToken || idToken.trim() === '') {
          throw new Error('Firebase returned an empty ID token.');
        }

        // ── Step 2: Store token immediately so api.js can use it ───────────────
        const cleanToken = idToken.trim();
        window.appState.token = cleanToken;
        localStorage.setItem('ml_token', cleanToken);

        // ── Step 3: Create Firestore profile on backend (register only) ────────
        if (mode.value === 'register') {
          const endpoint = role.value === 'patient'
            ? '/auth/register/patient'
            : '/auth/register/doctor';

          const body = role.value === 'patient'
            ? {
                displayName:  form.displayName.trim(),
                dateOfBirth:  form.dateOfBirth,
                gender:       form.gender,
                bloodGroup:   form.bloodGroup,
              }
            : {
                displayName:        form.displayName.trim(),
                specialization:     form.specialization.trim(),
                licenseNumber:      form.licenseNumber.trim(),
                qualifications:     form.qualifications.split(',').map(q => q.trim()).filter(Boolean),
                yearsOfExperience:  Number(form.yearsOfExperience),
              };

          await api.post(endpoint, body);
          profileCreated = true;
        }

        // ── Step 4: Fetch full user profile from Firestore via backend ─────────
        const meRes = await api.get('/auth/me');
        const user    = meRes.user    || {};
        const profile = meRes.profile || {};

        if (!profile.role) {
          // Firebase account exists but backend profile is missing.
          if (mode.value === 'login') {
            mode.value = 'register';
            error.value = 'Your account exists, but your profile is incomplete. Please finish registration.';
            return;
          }
          throw new Error('User profile not found. Please complete registration first.');
        }

        setAuth(cleanToken, { uid: firebaseUser.uid, email: firebaseUser.email, ...user, ...profile });
        showToast('Welcome to Medilocker!');
        router.push('/dashboard');

      } catch (e) {
        // Map Firebase error codes → user-friendly messages
        const firebaseErrors = {
          'auth/wrong-password':       'Incorrect password.',
          'auth/user-not-found':       'No account with that email.',
          'auth/email-already-in-use': 'Email already registered. Please sign in instead.',
          'auth/invalid-email':        'Invalid email address.',
          'auth/weak-password':        'Password must be at least 6 characters.',
          'auth/invalid-credential':   'Incorrect email or password.',
          'auth/too-many-requests':    'Too many failed attempts. Please try again later.',
          'auth/network-request-failed': 'Network error. Check your connection.',
          'auth/user-disabled':        'This account has been disabled.',
        };
        if (mode.value === 'register' && firebaseUser && !profileCreated) {
          try {
            await firebaseUser.delete();
          } catch (cleanupErr) {
            console.warn('[auth] Failed to roll back Firebase user after registration error:', cleanupErr.message);
          }
          window.appState.token = null;
          localStorage.removeItem('ml_token');
          localStorage.removeItem('ml_user');
        }

        error.value = e.code ? (firebaseErrors[e.code] || e.message) : e.message;
      } finally {
        loading.value = false;
      }
    }

    function demoLogin(r) {
      mode.value       = 'login';
      role.value       = r;
      form.email       = r === 'doctor' ? 'dr.nair@demo.health' : 'patient@demo.health';
      form.password    = 'demo123';
      form.displayName = r === 'doctor' ? 'Dr. Meera Nair' : 'Aarav Shah';
      handleSubmit();
    }

    function firebaseHint() {
      return mode.value === 'register'
        ? '⚠ Firebase register SDK not configured. Expose window._firebaseSignUp in index.html to enable registration.'
        : '⚠ Firebase login SDK not configured. Expose window._firebaseAuth and window._firebaseSignIn in index.html to enable login.';
    }

    return { mode, role, loading, error, form, handleSubmit, demoLogin, firebaseReady, firebaseHint, validateRegistrationForm };
  },

  template: `
    <div class="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-sage-900/20 blur-3xl"></div>
        <div class="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-sage-800/10 blur-3xl"></div>
      </div>

      <div class="w-full max-w-md relative">
        <div class="text-center mb-10">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sage-900/50 border border-sage-700/30 mb-4">
            <span class="text-2xl">⊕</span>
          </div>
          <h1 class="serif text-3xl text-ink-100 mb-1">Medilocker</h1>
          <p class="text-ink-500 text-sm mono">Secure · Versioned · Transparent</p>
        </div>

        <!-- Firebase not configured warning -->
        <div v-if="!firebaseReady()" class="mb-4 px-4 py-3 rounded-lg bg-amber-950/50 border border-amber-800/40 text-amber-400 text-xs mono">
          {{ firebaseHint() }}
        </div>

        <!-- Demo buttons (only shown when Firebase is ready) -->
        <div v-if="firebaseReady()" class="flex gap-2 mb-6">
          <button @click="demoLogin('patient')" :disabled="loading" class="btn-ghost flex-1 text-xs mono">
            → Demo as Patient
          </button>
          <button @click="demoLogin('doctor')" :disabled="loading" class="btn-ghost flex-1 text-xs mono">
            → Demo as Doctor
          </button>
        </div>

        <div class="card p-6">
          <!-- Mode toggle -->
          <div class="flex gap-1 p-1 bg-ink-900 rounded-lg mb-6">
            <button
              v-for="m in ['login','register']" :key="m"
              @click="mode = m; error = ''"
              class="flex-1 py-1.5 rounded-md text-xs mono transition-all"
              :class="mode === m ? 'bg-ink-700 text-ink-100' : 'text-ink-500 hover:text-ink-300'">
              {{ m === 'login' ? 'Sign In' : 'Register' }}
            </button>
          </div>

          <!-- Role selector (register only) -->
          <div v-if="mode === 'register'" class="flex gap-2 mb-4">
            <button
              v-for="r in ['patient','doctor']" :key="r"
              @click="role = r"
              class="flex-1 py-2 rounded-lg text-xs mono border transition-all"
              :class="role === r
                ? 'bg-sage-900/40 border-sage-700/50 text-sage-300'
                : 'bg-transparent border-ink-800 text-ink-500'">
              {{ r === 'patient' ? '◎ Patient' : '⊕ Doctor' }}
            </button>
          </div>

          <div v-if="error" class="mb-4 px-3 py-2 rounded-lg bg-red-950/50 border border-red-900/40 text-red-400 text-xs">
            {{ error }}
          </div>

          <div class="space-y-4">
            <div v-if="mode === 'register'">
              <label>Full Name</label>
              <input v-model="form.displayName" type="text" class="input-field"
                :placeholder="role === 'doctor' ? 'Dr. Meera Nair' : 'Aarav Shah'" />
            </div>
            <div>
              <label>Email</label>
              <input v-model="form.email" type="email" class="input-field"
                placeholder="you@example.com" @keyup.enter="handleSubmit" />
            </div>
            <div>
              <label>Password</label>
              <input v-model="form.password" type="password" class="input-field"
                placeholder="••••••••" @keyup.enter="handleSubmit" />
            </div>

            <!-- Patient fields -->
            <template v-if="mode === 'register' && role === 'patient'">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label>Date of Birth</label>
                  <input v-model="form.dateOfBirth" type="date" class="input-field" />
                </div>
                <div>
                  <label>Gender</label>
                  <select v-model="form.gender" class="input-field">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label>Blood Group</label>
                <select v-model="form.bloodGroup" class="input-field">
                  <option value="">Select...</option>
                  <option v-for="bg in ['A+','A-','B+','B-','AB+','AB-','O+','O-']" :key="bg">{{ bg }}</option>
                </select>
              </div>
            </template>

            <!-- Doctor fields -->
            <template v-if="mode === 'register' && role === 'doctor'">
              <div>
                <label>Specialization</label>
                <input v-model="form.specialization" class="input-field" placeholder="Cardiology" />
              </div>
              <div>
                <label>License Number</label>
                <input v-model="form.licenseNumber" class="input-field" placeholder="MCI-12345" />
              </div>
              <div>
                <label>Qualifications (comma-separated)</label>
                <input v-model="form.qualifications" class="input-field" placeholder="MBBS, MD (Cardiology)" />
              </div>
              <div>
                <label>Years of Experience</label>
                <input v-model.number="form.yearsOfExperience" type="number" class="input-field" min="0" max="60" />
              </div>
            </template>

            <button @click="handleSubmit" class="btn-primary w-full mt-2"
              :disabled="loading || !firebaseReady()">
              <span v-if="loading" class="mono text-xs">◌ Processing...</span>
              <span v-else-if="!firebaseReady()" class="mono text-xs">Firebase not configured</span>
              <span v-else>{{ mode === 'login' ? 'Sign In →' : 'Create Account →' }}</span>
            </button>
          </div>
        </div>

        <!-- Setup hint -->
        <div v-if="!firebaseReady()" class="mt-4 card p-4">
          <p class="mono text-xs text-ink-600 mb-2 uppercase tracking-wider">Setup Required</p>
          <ol class="text-xs text-ink-500 space-y-1.5">
            <li class="flex gap-2"><span class="text-sage-600 mono">1.</span> Go to <a href="https://console.firebase.google.com" target="_blank" class="text-sage-500 underline">console.firebase.google.com</a></li>
            <li class="flex gap-2"><span class="text-sage-600 mono">2.</span> Enable <strong class="text-ink-400">Authentication → Email/Password</strong></li>
            <li class="flex gap-2"><span class="text-sage-600 mono">3.</span> Copy your project config</li>
            <li class="flex gap-2"><span class="text-sage-600 mono">4.</span> Uncomment the Firebase block in <span class="text-ink-300 mono">index.html</span> and paste your config</li>
          </ol>
        </div>

        <p class="text-center text-ink-600 text-xs mt-6 mono">
          No ads · No ratings · Only transparent contribution data
        </p>
      </div>
    </div>
  `,
});
