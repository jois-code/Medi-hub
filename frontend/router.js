// ─── Router ───────────────────────────────────────────────────────────────────
import { AppLayout }          from './components/AppLayout.js';
import { LoginView }          from './views/LoginView.js';
import { DashboardView }      from './views/DashboardView.js';
import { RecordsView }        from './views/RecordsView.js';
import { AccessRequestsView } from './views/AccessRequestsView.js';
import { CollaboratorsView }  from './views/CollaboratorsView.js';
import { NotificationsView }  from './views/NotificationsView.js';
import { DoctorsView }        from './views/DoctorsView.js';
import { DoctorProfileView }  from './views/DoctorProfileView.js';
import { EmergencyView }      from './views/EmergencyView.js';
import { EmergencyAccessView } from './views/EmergencyAccessView.js';
import { AppointmentsView }   from './views/AppointmentsView.js';
import { TimelineView }       from './views/TimelineView.js';
import { AnalyticsView }      from './views/AnalyticsView.js';
import { SettingsView }       from './views/SettingsView.js';
import { appState }           from './services/state.js';

const { createRouter, createWebHashHistory } = VueRouter;

const NotFoundView = {
  template: `
    <div class="min-h-screen flex items-center justify-center p-6">
      <div class="text-center">
        <div class="serif text-8xl text-ink-800 mb-4">404</div>
        <h1 class="serif text-2xl text-ink-400 mb-4">Page not found</h1>
        <router-link to="/dashboard" class="btn-primary inline-block">← Back to Dashboard</router-link>
      </div>
    </div>
  `,
};

const routes = [
  { path: '/',       redirect: '/dashboard' },
  { path: '/login',  component: LoginView, meta: { public: true } },
  { path: '/emergency-access/:token', component: EmergencyAccessView, meta: { public: true } },
  {
    path: '/',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: 'dashboard',       component: DashboardView },
      { path: 'records',         component: RecordsView },
      { path: 'access-requests', component: AccessRequestsView },
      { path: 'collaborators',   component: CollaboratorsView },
      { path: 'notifications',   component: NotificationsView },
      { path: 'doctors',         component: DoctorsView },
      { path: 'doctor-profile',  component: DoctorProfileView },
      { path: 'emergency',       component: EmergencyView },
      { path: 'appointments',    component: AppointmentsView },
      { path: 'timeline',        component: TimelineView },
      { path: 'analytics',       component: AnalyticsView },
      { path: 'settings',        component: SettingsView },
    ],
  },
  { path: '/:pathMatch(.*)*', component: NotFoundView },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() { return { top: 0 }; },
});

router.beforeEach((to, _from, next) => {
  if (!to.meta.public && !appState.token) {
    next('/login');
  } else if (to.path === '/login' && appState.token && appState.user?.role) {
    next('/dashboard');
  } else {
    next();
  }
});
