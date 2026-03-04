// ─── App Layout ───────────────────────────────────────────────────────────────
import { Sidebar } from './Sidebar.js';
import { Toast }   from './Toast.js';
import { appState } from '../services/state.js';

const { computed, defineComponent } = Vue;
const { useRoute, RouterLink } = VueRouter;

export const AppLayout = defineComponent({
  name: 'AppLayout',
  components: { Sidebar, Toast, RouterLink },
  setup() {
    const route = useRoute();

    const mobileNavItems = computed(() => {
      const role = appState.user?.role;
      if (role === 'patient') {
        return [
          { label: 'Home',       icon: '◈', path: '/dashboard' },
          { label: 'Records',    icon: '⊕', path: '/records' },
          { label: 'Requests',   icon: '⊘', path: '/access-requests' },
          { label: 'Inbox',      icon: '◉', path: '/notifications' },
          { label: 'Emergency',  icon: '⚕', path: '/emergency' },
        ];
      }
      return [
        { label: 'Home',       icon: '◈', path: '/dashboard' },
        { label: 'Requests',   icon: '⊘', path: '/access-requests' },
        { label: 'Inbox',      icon: '◉', path: '/notifications' },
        { label: 'Appts',      icon: '📅', path: '/appointments' },
        { label: 'Profile',    icon: '◎', path: '/doctor-profile' },
      ];
    });

    return { appState, mobileNavItems, route };
  },
  template: `
    <div class="flex min-h-screen">
      <!-- Desktop sidebar -->
      <div class="hidden md:flex flex-col border-r border-ink-800 sticky top-0 h-screen">
        <Sidebar />
      </div>

      <!-- Main content -->
      <main class="flex-1 overflow-auto main-content-padding">
        <router-view />
      </main>
    </div>

    <!-- Mobile bottom nav -->
    <nav class="mobile-nav">
      <router-link
        v-for="item in mobileNavItems" :key="item.path"
        :to="item.path"
        class="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors"
        :class="route.path === item.path ? 'text-sage-400' : 'text-ink-600'">
        <span class="text-lg leading-none">{{ item.icon }}</span>
        <span class="text-[9px] mono">{{ item.label }}</span>
        <span
          v-if="item.label === 'Inbox' && appState.unreadCount > 0"
          class="absolute -top-0.5 ml-4 bg-sage-600 text-[8px] text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
          {{ appState.unreadCount > 9 ? '9+' : appState.unreadCount }}
        </span>
      </router-link>
    </nav>

    <Toast />
  `,
});
