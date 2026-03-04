// ─── Analytics View ───────────────────────────────────────────────────────────
import api from '../services/api.js';
import { appState, showToast } from '../services/state.js';

const { ref, computed, onMounted, defineComponent } = Vue;

export const AnalyticsView = defineComponent({
  name: 'AnalyticsView',
  setup() {
    const data      = ref(null);
    const loading   = ref(true);
    const isPatient = appState.user?.role === 'patient';

    onMounted(async () => {
      try {
        const endpoint = isPatient ? '/analytics/patient' : '/analytics/doctor';
        data.value = await api.get(endpoint);
      } catch (e) {
        showToast(e.message, 'error');
      } finally {
        loading.value = false;
      }
    });

    // CSS bar chart helper — returns percentage width
    function barPct(value, max) {
      if (!max) return '0%';
      return Math.round((value / max) * 100) + '%';
    }

    const recordTypeMax = computed(() => {
      if (!data.value?.recordsByType) return 1;
      return Math.max(...Object.values(data.value.recordsByType), 1);
    });

    const skillMax = computed(() => {
      if (!data.value?.endorsementsBySkill) return 1;
      return Math.max(...Object.values(data.value.endorsementsBySkill), 1);
    });

    const statusMax = computed(() => {
      if (!data.value?.patientsByStatus) return 1;
      return Math.max(...Object.values(data.value.patientsByStatus), 1);
    });

    // Upload frequency bar data — last 14 days
    const uploadDays = computed(() => {
      if (!data.value?.uploadsByDay) return [];
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        days.push({ key, label: d.getDate(), count: data.value.uploadsByDay[key] || 0 });
      }
      return days;
    });

    const uploadMax = computed(() => Math.max(...(uploadDays.value.map((d) => d.count)), 1));

    // Commit frequency (doctor)
    const commitDays = computed(() => {
      if (!data.value?.commitsByDay) return [];
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        days.push({ key, label: d.getDate(), count: data.value.commitsByDay[key] || 0 });
      }
      return days;
    });
    const commitMax = computed(() => Math.max(...(commitDays.value.map((d) => d.count)), 1));

    function fmtBytes(bytes) {
      if (!bytes) return '0 B';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    const RECORD_LABEL = {
      prescription: 'Prescriptions', lab_report: 'Lab Reports', xray: 'X-Rays',
      discharge_summary: 'Discharge', vaccination: 'Vaccinations', imaging: 'Imaging', other: 'Other',
    };

    return { data, loading, isPatient, barPct, recordTypeMax, skillMax, statusMax, uploadDays, uploadMax, commitDays, commitMax, fmtBytes, RECORD_LABEL };
  },

  template: `
    <div class="p-6 max-w-5xl mx-auto animate-fade-in">
      <div class="mb-6">
        <p class="mono text-ink-500 text-xs mb-1">— Insights</p>
        <h1 class="serif text-3xl text-ink-100">Analytics</h1>
      </div>

      <div v-if="loading" class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="i in 4" :key="i" class="stat-card animate-pulse h-20"></div>
      </div>

      <!-- Patient Analytics -->
      <template v-else-if="isPatient && data">
        <!-- Stat cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="stat-card">
            <div class="mono text-2xl text-ink-100 font-medium">{{ data.totalRecords }}</div>
            <div class="mono text-[10px] text-ink-600 mt-1">Total Records</div>
          </div>
          <div class="stat-card">
            <div class="mono text-2xl text-sage-400 font-medium">{{ data.totalCommits }}</div>
            <div class="mono text-[10px] text-ink-600 mt-1">Commits (30d)</div>
          </div>
          <div class="stat-card">
            <div class="mono text-2xl text-ink-100 font-medium">{{ data.activeCollaborators }}</div>
            <div class="mono text-[10px] text-ink-600 mt-1">Collaborators</div>
          </div>
          <div class="stat-card">
            <div class="mono text-sm text-ink-100 font-medium">{{ data.storageMB }} MB</div>
            <div class="mono text-[10px] text-ink-600 mt-1">Storage Used</div>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <!-- Records by type -->
          <div class="card p-5">
            <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-4">Records by Type</p>
            <div v-if="Object.keys(data.recordsByType || {}).length === 0" class="text-ink-600 text-sm text-center py-4">No records yet</div>
            <div v-else class="space-y-3">
              <div v-for="[type, count] in Object.entries(data.recordsByType)" :key="type">
                <div class="flex justify-between items-center mb-1">
                  <span class="mono text-xs text-ink-400">{{ RECORD_LABEL[type] || type }}</span>
                  <span class="mono text-xs text-ink-500">{{ count }}</span>
                </div>
                <div class="h-1.5 rounded-full bg-ink-800">
                  <div class="h-1.5 rounded-full bg-sage-600 transition-all" :style="{ width: barPct(count, recordTypeMax) }"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Upload activity -->
          <div class="card p-5">
            <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-4">Upload Activity (14 days)</p>
            <div class="flex items-end gap-1 h-24">
              <div v-for="day in uploadDays" :key="day.key" class="flex-1 flex flex-col items-center gap-1">
                <div class="w-full rounded-sm bg-sage-800/40 transition-all"
                  :style="{ height: barPct(day.count, uploadMax) }"
                  :title="day.key + ': ' + day.count">
                </div>
                <span class="mono text-[8px] text-ink-700">{{ day.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Doctor Analytics -->
      <template v-else-if="!isPatient && data">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="stat-card">
            <div class="mono text-2xl text-ink-100 font-medium">{{ data.totalPatients }}</div>
            <div class="mono text-[10px] text-ink-600 mt-1">Unique Patients</div>
          </div>
          <div class="stat-card">
            <div class="mono text-2xl text-sage-400 font-medium">{{ data.totalEndorsements }}</div>
            <div class="mono text-[10px] text-ink-600 mt-1">Endorsements</div>
          </div>
          <div class="stat-card">
            <div class="mono text-2xl text-ink-100 font-medium">{{ data.totalCommitsLast30Days }}</div>
            <div class="mono text-[10px] text-ink-600 mt-1">Commits (30d)</div>
          </div>
          <div class="stat-card">
            <div class="mono text-2xl text-ink-100 font-medium">{{ (data.patientsByStatus || {}).approved || 0 }}</div>
            <div class="mono text-[10px] text-ink-600 mt-1">Active Cases</div>
          </div>
        </div>

        <div class="grid md:grid-cols-2 gap-4">
          <!-- Endorsements by skill -->
          <div class="card p-5">
            <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-4">Endorsements by Skill</p>
            <div v-if="Object.keys(data.endorsementsBySkill || {}).length === 0" class="text-ink-600 text-sm text-center py-4">No endorsements yet</div>
            <div v-else class="space-y-3">
              <div v-for="[skill, count] in Object.entries(data.endorsementsBySkill).sort((a,b)=>b[1]-a[1]).slice(0,8)" :key="skill">
                <div class="flex justify-between items-center mb-1">
                  <span class="mono text-xs text-ink-400 truncate max-w-[70%]">{{ skill }}</span>
                  <span class="mono text-xs text-ink-500">{{ count }}</span>
                </div>
                <div class="h-1.5 rounded-full bg-ink-800">
                  <div class="h-1.5 rounded-full bg-sage-600 transition-all" :style="{ width: barPct(count, skillMax) }"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Commit activity -->
          <div class="card p-5">
            <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-4">Commit Activity (14 days)</p>
            <div class="flex items-end gap-1 h-24">
              <div v-for="day in commitDays" :key="day.key" class="flex-1 flex flex-col items-center gap-1">
                <div class="w-full rounded-sm bg-sage-800/40 transition-all"
                  :style="{ height: barPct(day.count, commitMax) }"
                  :title="day.key + ': ' + day.count">
                </div>
                <span class="mono text-[8px] text-ink-700">{{ day.label }}</span>
              </div>
            </div>
          </div>

          <!-- Patients by status -->
          <div class="card p-5">
            <p class="mono text-xs text-ink-600 uppercase tracking-wider mb-4">Patient Requests by Status</p>
            <div v-if="Object.keys(data.patientsByStatus || {}).length === 0" class="text-ink-600 text-sm text-center py-4">No requests yet</div>
            <div v-else class="space-y-3">
              <div v-for="[status, count] in Object.entries(data.patientsByStatus)" :key="status">
                <div class="flex justify-between items-center mb-1">
                  <span class="mono text-xs text-ink-400">{{ status }}</span>
                  <span class="mono text-xs text-ink-500">{{ count }}</span>
                </div>
                <div class="h-1.5 rounded-full bg-ink-800">
                  <div class="h-1.5 rounded-full bg-sage-600 transition-all" :style="{ width: barPct(count, statusMax) }"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  `,
});
