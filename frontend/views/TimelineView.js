// ─── Timeline View ────────────────────────────────────────────────────────────
import api from '../services/api.js';
import { appState, showToast } from '../services/state.js';
import { relativeTime } from '../utils/time.js';

const { ref, computed, onMounted, defineComponent } = Vue;

const EVENT_ICON = {
  record_upload:  '⊕',
  access_granted: '✓',
  access_revoked: '⊗',
  appointment:    '📅',
  prescription:   '℞',
  notification:   '◉',
};

const EVENT_COLOR = {
  record_upload:  'text-sage-400',
  access_granted: 'text-sage-500',
  access_revoked: 'text-rust-400',
  appointment:    'text-ink-400',
  prescription:   'text-amber-400',
  notification:   'text-ink-500',
};

export const TimelineView = defineComponent({
  name: 'TimelineView',
  setup() {
    const events      = ref([]);
    const loading     = ref(true);
    const filter      = ref('all');
    const page        = ref(0);
    const pageSize    = 20;
    const hasMore     = ref(false);

    function toMs(ts) {
      if (!ts) return 0;
      if (ts.seconds !== undefined) return ts.seconds * 1000;
      if (ts._seconds !== undefined) return ts._seconds * 1000;
      const p = new Date(ts).getTime();
      return Number.isFinite(p) ? p : 0;
    }

    async function loadEvents() {
      loading.value = true;
      try {
        const uid = appState.user?.uid;
        const [commitsRes, requestsRes, appointmentsRes] = await Promise.allSettled([
          api.get(`/patients/${uid}/commits`),
          api.get('/access-requests/incoming'),
          api.get('/appointments'),
        ]);

        // Log any failures for diagnostics
        [commitsRes, requestsRes, appointmentsRes].forEach((r, i) => {
          if (r.status === 'rejected') {
            console.warn(`[Timeline] source ${i} failed:`, r.reason?.message || r.reason);
          }
        });

        const all = [];

        // Record commits
        const commits = commitsRes.status === 'fulfilled' ? (commitsRes.value.commits || []) : [];
        commits.forEach((c) => {
          all.push({
            id: c.id,
            type: c.committedByRole === 'doctor' ? 'prescription' : 'record_upload',
            title: c.committedByRole === 'doctor' ? `Dr. added: ${c.commitMessage}` : `Uploaded: ${c.commitMessage}`,
            detail: c.recordType || '',
            ts: toMs(c.createdAt),
          });
        });

        // Access requests
        const requests = requestsRes.status === 'fulfilled' ? (requestsRes.value.requests || []) : [];
        requests.forEach((r) => {
          if (r.status === 'approved') {
            all.push({
              id: r.id + '_granted',
              type: 'access_granted',
              title: `Access granted to a doctor`,
              detail: r.accessLevel,
              ts: toMs(r.updatedAt || r.createdAt),
            });
          } else if (r.status === 'revoked') {
            all.push({
              id: r.id + '_revoked',
              type: 'access_revoked',
              title: `Access revoked`,
              detail: '',
              ts: toMs(r.updatedAt || r.createdAt),
            });
          }
        });

        // Appointments
        const apts = appointmentsRes.status === 'fulfilled' ? (appointmentsRes.value.appointments || []) : [];
        apts.forEach((a) => {
          const ms = a.dateTime?.seconds ? a.dateTime.seconds * 1000 : a.dateTime?._seconds ? a.dateTime._seconds * 1000 : new Date(a.dateTime || 0).getTime();
          all.push({
            id: a.id,
            type: 'appointment',
            title: `${a.type} appointment — ${a.status}`,
            detail: `${a.duration} min`,
            ts: ms,
          });
        });

        // Sort descending
        all.sort((a, b) => b.ts - a.ts);
        events.value = all;
        hasMore.value = all.length > (page.value + 1) * pageSize;
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        loading.value = false;
      }
    }

    onMounted(loadEvents);

    function loadMore() {
      page.value++;
      hasMore.value = events.value.length > (page.value + 1) * pageSize;
    }

    const filteredEvents = computed(() => {
      const base = filter.value === 'all' ? events.value : events.value.filter((e) => e.type === filter.value);
      return base.slice(0, (page.value + 1) * pageSize);
    });

    const icon  = (t) => EVENT_ICON[t]  || '◌';
    const color = (t) => EVENT_COLOR[t] || 'text-ink-500';

    function formatDate(ms) {
      if (!ms) return '';
      return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    return { events, loading, filter, filteredEvents, hasMore, loadMore, icon, color, formatDate, relativeTime };
  },

  template: `
    <div class="p-6 max-w-3xl mx-auto animate-fade-in">
      <div class="mb-6">
        <p class="mono text-ink-500 text-xs mb-1">— History</p>
        <h1 class="serif text-3xl text-ink-100">Medical Timeline</h1>
        <p class="text-sm text-ink-500 mt-1">A complete chronological history of your medical events.</p>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap gap-2 mb-6">
        <button v-for="f in ['all','record_upload','prescription','access_granted','appointment']" :key="f"
          @click="filter = f"
          :class="['tag-badge cursor-pointer transition-all', filter === f ? 'bg-sage-800/30 border-sage-600' : '']">
          {{ { all:'All', record_upload:'Records', prescription:'Prescriptions', access_granted:'Access', appointment:'Appointments' }[f] }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="space-y-4">
        <div v-for="i in 5" :key="i" class="flex gap-4 animate-pulse">
          <div class="w-7 h-7 rounded-full bg-ink-800 flex-shrink-0 mt-1"></div>
          <div class="flex-1">
            <div class="h-3 bg-ink-800 rounded w-3/4 mb-2"></div>
            <div class="h-2 bg-ink-800 rounded w-1/4"></div>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredEvents.length === 0" class="card p-8 text-center">
        <div class="text-3xl text-ink-800 mb-2">◌</div>
        <p class="text-ink-600 text-sm">No events to show</p>
      </div>

      <!-- Timeline -->
      <div v-else class="relative">
        <div class="absolute left-3.5 top-0 bottom-0 w-px bg-ink-800"></div>
        <div class="space-y-5">
          <div v-for="event in filteredEvents" :key="event.id" class="flex gap-4 relative">
            <div class="w-7 h-7 rounded-full bg-ink-900 border border-ink-700 flex items-center justify-center flex-shrink-0 z-10"
              :class="color(event.type)">
              <span class="text-xs">{{ icon(event.type) }}</span>
            </div>
            <div class="flex-1 min-w-0 pb-1">
              <p class="text-sm text-ink-200">{{ event.title }}</p>
              <div class="flex items-center gap-2 mt-0.5">
                <span v-if="event.detail" class="tag-badge">{{ event.detail }}</span>
                <span class="mono text-xs text-ink-700">{{ formatDate(event.ts) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Load more -->
      <div v-if="hasMore && !loading" class="text-center mt-6">
        <button @click="loadMore" class="btn-ghost text-sm">Load more</button>
      </div>
    </div>
  `,
});
