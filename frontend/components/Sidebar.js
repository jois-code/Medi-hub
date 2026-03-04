// ─── Sidebar Component ────────────────────────────────────────────────────────
import { appState, clearAuth } from '../services/state.js';

const { computed, defineComponent } = Vue;
const { useRouter, useRoute, RouterLink } = VueRouter;

export const Sidebar = defineComponent({
  name: 'Sidebar',
  components: { RouterLink },
  setup() {
    const router = useRouter();
    const route  = useRoute();

    function logout() {
      if (window._firebaseAuth?.currentUser) {
        window._firebaseAuth.signOut().catch(() => {});
      }
      clearAuth();
      router.push('/login');
    }

    const navItems = computed(() => {
      const role = appState.user?.role;
      if (role === 'patient') {
        return [
          { label: 'Dashboard',       icon: '◈', path: '/dashboard' },
          { label: 'My Records',      icon: '⊕', path: '/records' },
          { label: 'Access Requests', icon: '⊘', path: '/access-requests' },
          { label: 'Collaborators',   icon: '◎', path: '/collaborators' },
          { label: 'Notifications',   icon: '◉', path: '/notifications' },
          { label: 'Find Doctors',    icon: '⊙', path: '/doctors' },
          { label: 'Emergency QR',    icon: '⚕', path: '/emergency' },
          { label: 'Appointments',    icon: '📅', path: '/appointments' },
          { label: 'Timeline',        icon: '◫', path: '/timeline' },
          { label: 'Analytics',       icon: '⊞', path: '/analytics' },
          { label: 'Settings',        icon: '⚙', path: '/settings' },
        ];
      }
      return [
        { label: 'Dashboard',       icon: '◈', path: '/dashboard' },
        { label: 'My Requests',     icon: '⊘', path: '/access-requests' },
        { label: 'Notifications',   icon: '◉', path: '/notifications' },
        { label: 'Find Doctors',    icon: '⊙', path: '/doctors' },
        { label: 'Appointments',    icon: '📅', path: '/appointments' },
        { label: 'Analytics',       icon: '⊞', path: '/analytics' },
        { label: 'My Profile',      icon: '◎', path: '/doctor-profile' },
        { label: 'Settings',        icon: '⚙', path: '/settings' },
      ];
    });

    return { appState, navItems, route, logout };
  },
  template: `
    <aside class="sidebar flex flex-col gap-1 py-4 px-3 h-full">
      <div class="mb-6 px-2">
        <div class="serif text-sage-400 text-xl mb-0.5">MediHub</div>
        <div class="mono text-xs text-ink-500">v1.0 · {{ appState.user?.role || 'user' }}</div>
      </div>

      <nav class="flex flex-col gap-0.5 flex-1">
        <router-link
          v-for="item in navItems" :key="item.path"
          :to="item.path"
          class="nav-link group"
          :class="{ 'text-sage-400 bg-sage-900/10': route.path === item.path }">
          <span class="text-base leading-none">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
          <span
            v-if="item.label === 'Notifications' && appState.unreadCount > 0"
            class="ml-auto bg-sage-700 text-sage-200 text-[9px] font-mono rounded-full w-4 h-4 flex items-center justify-center">
            {{ appState.unreadCount > 9 ? '9+' : appState.unreadCount }}
          </span>
        </router-link>
      </nav>

      <div class="mt-auto pt-4 border-t border-ink-800">
        <div class="flex items-center gap-2 px-2 mb-3">
          <div class="w-7 h-7 rounded-full bg-sage-900 border border-sage-700/50 flex items-center justify-center text-sage-400 text-xs font-mono flex-shrink-0">
            {{ ((appState.user?.displayName || '?')[0] || '?').toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-xs text-ink-200 truncate font-medium">{{ appState.user?.displayName }}</div>
            <div class="text-[10px] text-ink-500 mono truncate">{{ appState.user?.email }}</div>
          </div>
        </div>
        <button @click="logout" class="nav-link w-full text-left text-rust-400 hover:text-rust-400 hover:bg-red-950/20">
          <span>⊗</span> Sign Out
        </button>
      </div>
    </aside>
  `,
});
