import { watch } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { i18n } from './i18n';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('./views/DashboardView.vue'),
      meta: { titleKey: 'nav.dashboard' },
    },
    {
      path: '/roadmap',
      name: 'roadmap',
      component: () => import('./views/RoadmapView.vue'),
      meta: { titleKey: 'nav.roadmap' },
    },
    {
      path: '/roadmap/:id(\\d+)',
      name: 'course-detail',
      component: () => import('./views/CourseDetailView.vue'),
      props: (route) => ({ id: Number(route.params.id) }),
      meta: { titleKey: 'course.detailTitle' },
    },
    {
      path: '/planner',
      name: 'planner',
      component: () => import('./views/PlannerView.vue'),
      meta: { titleKey: 'nav.planner' },
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('./views/ProjectsView.vue'),
      meta: { titleKey: 'nav.projects' },
    },
    {
      path: '/interview',
      name: 'interview',
      component: () => import('./views/InterviewView.vue'),
      meta: { titleKey: 'nav.interview' },
    },
    {
      path: '/jobs',
      name: 'jobs',
      component: () => import('./views/JobsView.vue'),
      meta: { titleKey: 'nav.jobs' },
    },
    {
      path: '/notes',
      name: 'notes',
      component: () => import('./views/NotesView.vue'),
      meta: { titleKey: 'nav.notes' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
      meta: { titleKey: 'nav.settings' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('./views/NotFoundView.vue'),
      meta: { titleKey: 'notFound.title' },
    },
  ],
  scrollBehavior: (to) => {
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
});

function updateDocumentTitle(to = router.currentRoute.value): void {
  const key = typeof to.meta.titleKey === 'string' ? to.meta.titleKey : 'nav.dashboard';
  document.title = `${i18n.global.t(key)} · Learning Road`;
}

router.afterEach((to) => updateDocumentTitle(to));
watch(i18n.global.locale, () => updateDocumentTitle());

export default router;
