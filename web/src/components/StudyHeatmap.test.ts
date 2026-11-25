// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import StudyHeatmap from './StudyHeatmap.vue';
import { i18n } from '../i18n';

const pushMock = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('StudyHeatmap', () => {
  it('renders heatmap cells and navigates to planner on day click', async () => {
    const wrapper = mount(StudyHeatmap, {
      global: {
        plugins: [i18n],
      },
      props: {
        today: '2026-11-25',
        days: [
          { date: '2026-11-23', minutes: 0, sessionsCount: 0, level: 0 },
          { date: '2026-11-24', minutes: 45, sessionsCount: 1, level: 2 },
          { date: '2026-11-25', minutes: 90, sessionsCount: 2, level: 4 },
        ],
      },
    });

    const activeCells = wrapper.findAll('button.heatmap-cell:not(.is-outside)');
    expect(activeCells).toHaveLength(3);
    expect(activeCells[2]!.classes()).toContain('level-4');
    expect(activeCells[2]!.classes()).toContain('is-today');

    await activeCells[1]!.trigger('click');
    expect(pushMock).toHaveBeenCalledWith({
      path: '/planner',
      query: { date: '2026-11-24' },
    });
  });
});
