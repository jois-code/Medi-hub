// ─── Emergency QR Code View ───────────────────────────────────────────────────
import api from '../services/api.js';
import { appState, showToast } from '../services/state.js';
import { relativeTime } from '../utils/time.js';

const { ref, reactive, onMounted, defineComponent } = Vue;

export const EmergencyView = defineComponent({
  name: 'EmergencyView',
  setup() {
    const tokens      = ref([]);
    const loading     = ref(true);
    const generating  = ref(false);
    const showModal   = ref(false);
    const qrContainer = ref(null);
    const activeQr    = ref(null);

    const form = reactive({ expiryHours: 24, label: '' });

    onMounted(loadTokens);

    async function loadTokens() {
      loading.value = true;
      try {
        const { tokens: data } = await api.get('/emergency/tokens');
        tokens.value = data || [];
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        loading.value = false;
      }
    }

    async function generateToken() {
      generating.value = true;
      try {
        const res = await api.post('/emergency/generate', {
          expiryHours: Number(form.expiryHours),
          label: form.label || undefined,
        });
        tokens.value.unshift(res.token);
        showToast('Emergency token generated');
        showModal.value = false;
        form.label = '';
        form.expiryHours = 24;
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        generating.value = false;
      }
    }

    async function revokeToken(tokenId) {
      if (!confirm('Revoke this emergency token? Anyone with the link will no longer be able to access your emergency info.')) return;
      try {
        await api.delete(`/emergency/tokens/${tokenId}`);
        tokens.value = tokens.value.filter((t) => t.tokenId !== tokenId);
        showToast('Token revoked');
      } catch (e) {
        showToast(e.message, 'error');
      }
    }

    function showQr(token) {
      activeQr.value = token;
      Vue.nextTick(() => {
        const el = document.getElementById('qr-canvas-' + token.tokenId);
        if (el) {
          el.innerHTML = '';
          if (window.QRCode) {
            new QRCode(el, {
              text: window.location.origin + window.location.pathname + '#/emergency-access/' + token.tokenId,
              width: 200,
              height: 200,
              colorDark: '#d8d8d4',
              colorLight: '#161614',
            });
          } else {
            el.innerHTML = '<p class="text-rust-400 text-xs p-2">QR library unavailable. Use the link below.</p>';
          }
        }
      });
    }

    function formatExpiry(ts) {
      if (!ts) return 'N/A';
      const ms = ts.seconds ? ts.seconds * 1000 : ts._seconds ? ts._seconds * 1000 : new Date(ts).getTime();
      return new Date(ms).toLocaleString('en-IN');
    }

    function isExpired(ts) {
      if (!ts) return false;
      const ms = ts.seconds ? ts.seconds * 1000 : ts._seconds ? ts._seconds * 1000 : new Date(ts).getTime();
      return ms < Date.now();
    }

    function accessUrl(tokenId) {
      return window.location.origin + window.location.pathname + '#/emergency-access/' + tokenId;
    }

    return { tokens, loading, generating, showModal, form, activeQr, generateToken, revokeToken, showQr, formatExpiry, isExpired, accessUrl, relativeTime };
  },

  template: `
    <div class="p-6 max-w-3xl mx-auto animate-fade-in">
      <div class="mb-6">
        <p class="mono text-ink-500 text-xs mb-1">— Emergency Access</p>
        <h1 class="serif text-3xl text-ink-100">Emergency QR Codes</h1>
        <p class="text-sm text-ink-500 mt-1">Generate a secure QR code that gives emergency responders instant access to your critical health info.</p>
      </div>

      <!-- Info card -->
      <div class="card p-4 mb-6 border-l-2 border-rust-400">
        <div class="flex gap-3">
          <span class="text-rust-400 text-xl">⚕</span>
          <div>
            <p class="text-sm text-ink-200 font-medium mb-1">What emergency responders will see</p>
            <p class="text-xs text-ink-500">Blood group, allergies, emergency contacts, and your latest prescriptions and vaccinations. No login required.</p>
          </div>
        </div>
      </div>

      <div class="flex justify-between items-center mb-4">
        <p class="mono text-xs text-ink-600 uppercase tracking-wider">Active Tokens ({{ tokens.length }})</p>
        <button @click="showModal = true" class="btn-primary text-sm">⊕ Generate QR Code</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 2" :key="i" class="card p-4 animate-pulse h-20"></div>
      </div>

      <!-- Token list -->
      <div v-else-if="tokens.length === 0" class="card p-8 text-center">
        <div class="text-4xl text-ink-800 mb-3">⊞</div>
        <p class="text-ink-500 text-sm">No active emergency tokens. Generate one to get started.</p>
      </div>

      <div v-else class="space-y-3">
        <div v-for="token in tokens" :key="token.tokenId" class="card p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-ink-200 text-sm font-medium truncate">{{ token.label }}</span>
                <span v-if="isExpired(token.expiresAt)" class="status-badge status-expired">expired</span>
                <span v-else class="status-badge status-approved">active</span>
              </div>
              <p class="mono text-xs text-ink-600">Expires: {{ formatExpiry(token.expiresAt) }}</p>
              <p class="mono text-xs text-ink-700 mt-0.5">Accessed {{ (token.accessedBy || []).length }} time(s)</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button @click="showQr(token)" class="btn-ghost text-xs py-1.5 px-3">⊞ QR</button>
              <button @click="revokeToken(token.tokenId)" class="btn-danger text-xs py-1.5 px-3">⊗ Revoke</button>
            </div>
          </div>

          <!-- QR Code display -->
          <div v-if="activeQr && activeQr.tokenId === token.tokenId" class="mt-4 pt-4 border-t border-ink-800">
            <div class="flex flex-col md:flex-row gap-4 items-start">
              <div :id="'qr-canvas-' + token.tokenId" class="bg-ink-800 rounded p-3 flex-shrink-0"></div>
              <div class="flex-1 min-w-0">
                <p class="mono text-xs text-ink-600 mb-2">Share this link or scan the QR code:</p>
                <div class="bg-ink-900 rounded p-2 font-mono text-xs text-sage-400 break-all select-all">{{ accessUrl(token.tokenId) }}</div>

                <!-- Access log -->
                <div v-if="(token.accessedBy || []).length > 0" class="mt-3">
                  <p class="mono text-[10px] text-ink-700 mb-1.5">ACCESS LOG</p>
                  <div v-for="(access, i) in (token.accessedBy || []).slice().reverse().slice(0, 5)" :key="i"
                    class="flex items-center gap-2 text-xs text-ink-600 mb-1">
                    <span class="text-ink-700">◌</span>
                    <span>{{ access.ip || 'unknown' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Generate Modal -->
      <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
        <div class="modal">
          <div class="flex justify-between items-start mb-5">
            <div>
              <h2 class="serif text-xl text-ink-100">Generate Emergency Token</h2>
              <p class="text-xs text-ink-500 mt-1">Creates a shareable QR code for emergency responders</p>
            </div>
            <button @click="showModal = false" class="text-ink-600 hover:text-ink-300 text-xl">⊗</button>
          </div>

          <div class="space-y-4">
            <div>
              <label>Label (optional)</label>
              <input v-model="form.label" type="text" class="input-field" placeholder="e.g. Wallet card, Hospital bag" />
            </div>
            <div>
              <label>Expiry</label>
              <select v-model="form.expiryHours" class="input-field">
                <option :value="1">1 hour</option>
                <option :value="6">6 hours</option>
                <option :value="24">24 hours (default)</option>
                <option :value="48">48 hours</option>
                <option :value="72">72 hours</option>
              </select>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button @click="generateToken" :disabled="generating" class="btn-primary flex-1">
              {{ generating ? 'Generating…' : '⊕ Generate Token' }}
            </button>
            <button @click="showModal = false" class="btn-ghost">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `,
});
