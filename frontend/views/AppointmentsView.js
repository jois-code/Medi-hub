// ─── Appointments View ────────────────────────────────────────────────────────
import api from '../services/api.js';
import { appState, showToast } from '../services/state.js';
import { relativeTime } from '../utils/time.js';

const { ref, reactive, computed, onMounted, defineComponent } = Vue;

const TYPE_ICON  = { 'in-person': '🏥', video: '📹', phone: '📞' };
const STATUS_CSS = {
  scheduled:  'status-pending',
  confirmed:  'status-approved',
  cancelled:  'status-denied',
  completed:  'status-approved',
  no_show:    'status-expired',
};

export const AppointmentsView = defineComponent({
  name: 'AppointmentsView',
  setup() {
    const appointments  = ref([]);
    const loading       = ref(true);
    const showModal     = ref(false);
    const submitting    = ref(false);
    const isPatient     = appState.user?.role === 'patient';

    const patientQuery   = ref('');
    const patientResults = ref([]);
    const searching      = ref(false);
    const selectedPatient = ref(null);

    const form = reactive({
      patientId: '',
      dateTime: '',
      duration: 30,
      type: 'in-person',
      notes: '',
    });

    onMounted(loadAppointments);

    async function loadAppointments() {
      loading.value = true;
      try {
        const { appointments: data } = await api.get('/appointments');
        appointments.value = data || [];
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        loading.value = false;
      }
    }

    async function searchPatients() {
      const q = patientQuery.value.trim();
      if (selectedPatient.value && q !== (selectedPatient.value.displayName || '')) {
        selectedPatient.value = null;
        form.patientId = '';
      }
      if (q.length < 2) { patientResults.value = []; return; }
      searching.value = true;
      try {
        const { users } = await api.get(`/auth/patients/search?q=${encodeURIComponent(q)}`);
        patientResults.value = users || [];
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        searching.value = false;
      }
    }

    function selectPatient(p) {
      selectedPatient.value = p;
      form.patientId = p.uid;
      patientQuery.value = p.displayName || p.email;
      patientResults.value = [];
    }

    async function createAppointment() {
      if (!form.patientId || !form.dateTime || !form.type) {
        showToast('Please fill in all required fields', 'error');
        return;
      }
      submitting.value = true;
      try {
        const { appointment } = await api.post('/appointments', {
          patientId: form.patientId,
          dateTime: new Date(form.dateTime).toISOString(),
          duration: Number(form.duration),
          type: form.type,
          notes: form.notes,
        });
        appointments.value.unshift(appointment);
        showToast('Appointment scheduled');
        showModal.value = false;
        Object.assign(form, { patientId: '', dateTime: '', duration: 30, type: 'in-person', notes: '' });
        selectedPatient.value = null;
        patientQuery.value = '';
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        submitting.value = false;
      }
    }

    async function updateStatus(appt, status) {
      const label = { confirmed: 'confirm', cancelled: 'cancel', completed: 'complete', no_show: 'mark as no-show' }[status] || status;
      if (!confirm(`Are you sure you want to ${label} this appointment?`)) return;
      try {
        await api.patch(`/appointments/${appt.id}/status`, { status });
        appt.status = status;
        showToast(`Appointment ${status}`);
      } catch (e) {
        showToast(e.message, 'error');
      }
    }

    function formatDateTime(ts) {
      if (!ts) return 'N/A';
      const ms = ts.seconds ? ts.seconds * 1000 : ts._seconds ? ts._seconds * 1000 : new Date(ts).getTime();
      return new Date(ms).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function isPast(ts) {
      if (!ts) return false;
      const ms = ts.seconds ? ts.seconds * 1000 : ts._seconds ? ts._seconds * 1000 : new Date(ts).getTime();
      return ms < Date.now();
    }

    const upcoming = computed(() => appointments.value.filter((a) => !isPast(a.dateTime) && ['scheduled', 'confirmed'].includes(a.status)));
    const past     = computed(() => appointments.value.filter((a) => isPast(a.dateTime) || ['completed', 'cancelled', 'no_show'].includes(a.status)));

    return {
      appointments, loading, showModal, submitting, isPatient,
      patientQuery, patientResults, searching, selectedPatient,
      form, upcoming, past,
      searchPatients, selectPatient, createAppointment, updateStatus,
      formatDateTime, TYPE_ICON, STATUS_CSS, relativeTime,
    };
  },

  template: `
    <div class="p-6 max-w-4xl mx-auto animate-fade-in">
      <div class="flex items-start justify-between mb-6">
        <div>
          <p class="mono text-ink-500 text-xs mb-1">— Scheduling</p>
          <h1 class="serif text-3xl text-ink-100">Appointments</h1>
        </div>
        <button v-if="!isPatient" @click="showModal = true" class="btn-primary text-sm">⊕ Schedule</button>
      </div>

      <div v-if="loading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="card p-4 animate-pulse h-20"></div>
      </div>

      <template v-else>
        <!-- Upcoming -->
        <div class="mb-6">
          <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-3">Upcoming ({{ upcoming.length }})</p>
          <div v-if="upcoming.length === 0" class="card p-6 text-center">
            <p class="text-ink-600 text-sm">No upcoming appointments</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="appt in upcoming" :key="appt.id" class="card p-4">
              <div class="flex items-start justify-between gap-3">
                <div class="flex gap-3 items-start">
                  <div class="w-9 h-9 rounded-lg bg-ink-800 border border-ink-700 flex items-center justify-center text-lg flex-shrink-0">
                    {{ TYPE_ICON[appt.type] || '📅' }}
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-ink-200 text-sm font-medium">{{ formatDateTime(appt.dateTime) }}</span>
                      <span :class="['status-badge', STATUS_CSS[appt.status] || 'status-pending']">{{ appt.status }}</span>
                    </div>
                    <p class="mono text-xs text-ink-600 mt-0.5">{{ appt.type }} · {{ appt.duration }} min</p>
                    <p v-if="appt.notes" class="text-xs text-ink-500 mt-1">{{ appt.notes }}</p>
                  </div>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                  <button v-if="appt.status === 'scheduled' && !isPatient"
                    @click="updateStatus(appt, 'confirmed')" class="btn-ghost text-xs py-1 px-2">✓ Confirm</button>
                  <button v-if="['scheduled','confirmed'].includes(appt.status)"
                    @click="updateStatus(appt, 'cancelled')" class="btn-danger text-xs py-1 px-2">⊗ Cancel</button>
                  <button v-if="!isPatient && appt.status === 'confirmed'"
                    @click="updateStatus(appt, 'completed')" class="btn-ghost text-xs py-1 px-2">✓ Done</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Past -->
        <div>
          <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-3">Past ({{ past.length }})</p>
          <div v-if="past.length === 0" class="card p-6 text-center">
            <p class="text-ink-600 text-sm">No past appointments</p>
          </div>
          <div v-else class="space-y-2">
            <div v-for="appt in past" :key="appt.id" class="card p-3 opacity-70">
              <div class="flex items-center gap-3">
                <span class="text-lg">{{ TYPE_ICON[appt.type] || '📅' }}</span>
                <div class="flex-1 min-w-0">
                  <span class="text-ink-300 text-sm">{{ formatDateTime(appt.dateTime) }}</span>
                  <span class="ml-2 mono text-xs text-ink-600">{{ appt.type }} · {{ appt.duration }}min</span>
                </div>
                <span :class="['status-badge', STATUS_CSS[appt.status] || 'status-expired']">{{ appt.status }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Schedule Modal (Doctor only) -->
      <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
        <div class="modal">
          <div class="flex justify-between items-start mb-5">
            <h2 class="serif text-xl text-ink-100">Schedule Appointment</h2>
            <button @click="showModal = false" class="text-ink-600 hover:text-ink-300 text-xl">⊗</button>
          </div>

          <div class="space-y-4">
            <div class="relative">
              <label>Patient</label>
              <input v-model="patientQuery" @input="searchPatients" type="text"
                class="input-field" placeholder="Search patient by name…" />
              <div v-if="patientResults.length > 0"
                class="absolute z-10 mt-1 w-full bg-ink-800 border border-ink-700 rounded-lg overflow-hidden shadow-xl">
                <button v-for="p in patientResults" :key="p.uid"
                  @click="selectPatient(p)"
                  class="w-full text-left px-4 py-2.5 text-sm text-ink-200 hover:bg-ink-700 transition-colors">
                  {{ p.displayName }} <span class="text-ink-500 text-xs">{{ p.email }}</span>
                </button>
              </div>
              <p v-if="selectedPatient" class="mono text-[10px] text-sage-500 mt-1">✓ {{ selectedPatient.displayName }}</p>
            </div>

            <div>
              <label>Date & Time</label>
              <input v-model="form.dateTime" type="datetime-local" class="input-field" />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label>Type</label>
                <select v-model="form.type" class="input-field">
                  <option value="in-person">🏥 In-person</option>
                  <option value="video">📹 Video</option>
                  <option value="phone">📞 Phone</option>
                </select>
              </div>
              <div>
                <label>Duration (min)</label>
                <select v-model="form.duration" class="input-field">
                  <option :value="15">15 min</option>
                  <option :value="30">30 min</option>
                  <option :value="45">45 min</option>
                  <option :value="60">1 hour</option>
                  <option :value="90">1.5 hours</option>
                </select>
              </div>
            </div>

            <div>
              <label>Notes (optional)</label>
              <textarea v-model="form.notes" class="input-field" rows="3" placeholder="Appointment purpose, instructions…"></textarea>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button @click="createAppointment" :disabled="submitting" class="btn-primary flex-1">
              {{ submitting ? 'Scheduling…' : '⊕ Schedule Appointment' }}
            </button>
            <button @click="showModal = false" class="btn-ghost">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `,
});
