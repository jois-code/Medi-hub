// ─── Emergency Access View (Public) ──────────────────────────────────────────
// No login required — accessible via /emergency-access/:token

const { ref, onMounted, defineComponent } = Vue;
const { useRoute } = VueRouter;

export const EmergencyAccessView = defineComponent({
  name: 'EmergencyAccessView',
  setup() {
    const route   = useRoute();
    const loading = ref(true);
    const error   = ref(null);
    const data    = ref(null);

    const API_BASE = (
      window.__API_BASE__ ||
      localStorage.getItem('ml_api_base') ||
      (window.location.hostname === 'localhost'
        ? 'http://localhost:3000/api'
        : `${window.location.origin}/api`)
    ).replace(/\/+$/, '');

    onMounted(async () => {
      const token = route.params.token;
      try {
        const res = await fetch(`${API_BASE}/emergency/access/${token}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load emergency info');
        data.value = json;
      } catch (e) {
        error.value = e.message;
      } finally {
        loading.value = false;
      }
    });

    function formatDate(val) {
      if (!val) return 'N/A';
      return new Date(val).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function formatTs(ts) {
      if (!ts) return '';
      const ms = ts.seconds ? ts.seconds * 1000 : ts._seconds ? ts._seconds * 1000 : new Date(ts).getTime();
      return new Date(ms).toLocaleString('en-IN');
    }

    const typeLabel = (t) => ({
      prescription: '℞ Prescription',
      vaccination: '💉 Vaccination',
    }[t] || t);

    return { loading, error, data, formatDate, formatTs, typeLabel };
  },

  template: `
    <div class="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <!-- Header -->
      <div class="text-center mb-6">
        <div class="text-4xl mb-2">⚕</div>
        <h1 class="serif text-2xl text-ink-100">Emergency Medical Info</h1>
        <p class="text-xs text-ink-500 mono mt-1">MediHub Secure Access</p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="space-y-4">
        <div class="card p-6 animate-pulse h-32"></div>
        <div class="card p-6 animate-pulse h-24"></div>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="card p-6 text-center border-rust-400/20">
        <div class="text-3xl mb-3 text-rust-400">⊗</div>
        <p class="text-ink-200 font-medium mb-1">Access Unavailable</p>
        <p class="text-ink-500 text-sm">{{ error }}</p>
      </div>

      <template v-else-if="data">
        <!-- Patient Info Card -->
        <div class="card p-5 mb-4">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-full bg-sage-900 border border-sage-700/50 flex items-center justify-center text-sage-400 text-xl font-mono flex-shrink-0">
              {{ (data.patient.displayName || '?')[0].toUpperCase() }}
            </div>
            <div class="flex-1">
              <h2 class="text-ink-100 text-lg font-medium">{{ data.patient.displayName || 'Unknown Patient' }}</h2>
              <div class="flex flex-wrap gap-2 mt-2">
                <span v-if="data.patient.bloodGroup" class="status-badge status-approved text-base font-bold px-3">
                  🩸 {{ data.patient.bloodGroup }}
                </span>
                <span v-if="data.patient.gender" class="tag-badge">{{ data.patient.gender }}</span>
                <span v-if="data.patient.dateOfBirth" class="tag-badge">
                  DOB: {{ formatDate(data.patient.dateOfBirth) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Emergency Contact -->
        <div v-if="data.patient.emergencyContact" class="card p-4 mb-4 border-l-2 border-rust-400">
          <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-2">Emergency Contact</p>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-ink-200 font-medium">{{ data.patient.emergencyContact.name }}</p>
              <p class="text-xs text-ink-500">{{ data.patient.emergencyContact.relation }}</p>
            </div>
            <a :href="'tel:' + data.patient.emergencyContact.phone"
              class="btn-primary text-sm py-2 px-4">
              📞 {{ data.patient.emergencyContact.phone }}
            </a>
          </div>
        </div>

        <!-- Allergies -->
        <div v-if="data.patient.allergies && data.patient.allergies.length > 0" class="card p-4 mb-4 border-l-2 border-rust-500">
          <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-2">⚠ Known Allergies</p>
          <div class="flex flex-wrap gap-2">
            <span v-for="a in data.patient.allergies" :key="a"
              class="px-3 py-1 rounded-full text-xs font-mono bg-rust-500/10 text-rust-400 border border-rust-500/25">
              {{ a }}
            </span>
          </div>
        </div>

        <!-- Critical Records -->
        <div class="card p-4 mb-4">
          <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-3">Critical Medical Records</p>
          <div v-if="data.criticalRecords.length === 0" class="text-ink-600 text-sm text-center py-4">No critical records on file</div>
          <div v-else class="space-y-3">
            <div v-for="r in data.criticalRecords" :key="r.id" class="flex gap-3 items-start">
              <div class="timeline-dot mt-1"></div>
              <div>
                <p class="text-ink-200 text-sm font-medium">{{ r.title }}</p>
                <p class="mono text-xs text-ink-600">{{ typeLabel(r.recordType) }}</p>
                <p v-if="r.issuedBy" class="text-xs text-ink-500 mt-0.5">By {{ r.issuedBy }}</p>
                <div class="flex flex-wrap gap-1 mt-1">
                  <span v-for="tag in (r.tags || [])" :key="tag" class="tag-badge">{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="text-center mt-6">
          <p class="mono text-xs text-ink-700">Token: {{ data.tokenLabel }}</p>
          <p class="mono text-xs text-ink-800 mt-1">Expires: {{ formatTs(data.expiresAt) }}</p>
        </div>
      </template>
    </div>
  `,
});
