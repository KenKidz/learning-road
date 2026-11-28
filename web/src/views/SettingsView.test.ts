// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { AiSettings, AuthStatus, UserSettings } from '@shared/types';
import SettingsView from './SettingsView.vue';
import { i18n } from '../i18n';

const { settingsMock, authStatusMock, aiSettingsMock, updateAiSettingsMock, testAiConnectionMock } =
  vi.hoisted(() => ({
    settingsMock: vi.fn(),
    authStatusMock: vi.fn(),
    aiSettingsMock: vi.fn(),
    updateAiSettingsMock: vi.fn(),
    testAiConnectionMock: vi.fn(),
  }));

vi.mock('vue-router', () => ({
  useRoute: () => ({ hash: '' }),
}));

vi.mock('../lib/api', () => ({
  ApiError: class extends Error {},
  downloadExport: vi.fn(),
  api: {
    settings: (...args: unknown[]) => settingsMock(...args),
    authStatus: (...args: unknown[]) => authStatusMock(...args),
    aiSettings: (...args: unknown[]) => aiSettingsMock(...args),
    updateAiSettings: (...args: unknown[]) => updateAiSettingsMock(...args),
    testAiConnection: (...args: unknown[]) => testAiConnectionMock(...args),
    resetAiSettings: vi.fn(),
    updateSettings: vi.fn(),
    previewImport: vi.fn(),
    importData: vi.fn(),
  },
}));

const sampleUserSettings: UserSettings = {
  id: 1,
  timezone: 'Asia/Ho_Chi_Minh',
  roadmapStartDate: '2026-11-06',
  dailyGoalMinutes: 60,
  weeklyGoalMinutes: 420,
  preferredStudyDays: [1, 2, 3, 4, 5, 6],
  studyWindow: '19:00-21:00',
  experienceYears: 2,
  level: 'Middle',
  targetRole: 'Full-stack Developer (React/Node.js)',
  backendLevel: 'intermediate',
  typescriptLevel: 'good',
  sqlLevel: 'intermediate',
  gitLevel: 'good',
  updatedAt: '2026-11-28T00:00:00.000Z',
};

const sampleAuthStatus: AuthStatus = {
  required: false,
  authenticated: true,
};

function makeAiSettings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    enabled: true,
    hasCustomConfig: true,
    apiKeySource: 'ui',
    hasApiKey: true,
    maskedApiKey: 'sk-t••••9999',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5-mini',
    temperature: null,
    reasoningEffort: '',
    customHeaders: [],
    timeoutMs: 30000,
    envDefaults: {
      hasApiKey: false,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-6-luna',
      temperature: null,
      reasoningEffort: '',
      customHeaders: [],
      timeoutMs: 30000,
    },
    updatedAt: '2026-11-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('SettingsView AI temperature configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsMock.mockResolvedValue(sampleUserSettings);
    authStatusMock.mockResolvedValue(sampleAuthStatus);
    aiSettingsMock.mockResolvedValue(makeAiSettings());
    updateAiSettingsMock.mockImplementation(async (body: Record<string, unknown>) =>
      makeAiSettings({
        temperature:
          body.temperature === undefined ? null : (body.temperature as number | null),
      }),
    );
    testAiConnectionMock.mockResolvedValue({
      ok: true,
      latencyMs: 120,
      model: 'gpt-5-mini',
      baseUrl: 'https://api.openai.com/v1',
      reply: 'OK',
    });
  });

  it('loads temperature, saves numeric values (including 0), validates bounds, and supports clearing to model default', async () => {
    aiSettingsMock.mockResolvedValue(makeAiSettings({ temperature: 0.7 }));

    const wrapper = mount(SettingsView, {
      global: { plugins: [i18n] },
    });
    await flushPromises();

    const tempInput = wrapper.find('#ai-temperature');
    expect(tempInput.exists()).toBe(true);
    expect((tempInput.element as HTMLInputElement).value).toBe('0.7');

    // Out-of-range temperature is rejected client-side
    await tempInput.setValue('2.5');
    await wrapper.find('#ai-settings').trigger('submit');
    await flushPromises();
    expect(updateAiSettingsMock).not.toHaveBeenCalled();
    expect(wrapper.find('#ai-settings .form-error').exists()).toBe(true);

    // Valid temperature = 0 is saved as 0 (not null)
    await tempInput.setValue('0');
    await wrapper.find('#ai-settings').trigger('submit');
    await flushPromises();
    expect(updateAiSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0 }),
    );
    expect((tempInput.element as HTMLInputElement).value).toBe('0');

    // Draft temperature is passed when testing connection
    await tempInput.setValue('1');
    const testBtn = wrapper
      .findAll('#ai-settings button')
      .find((b) => /Kiểm tra kết nối|Test connection/i.test(b.text()));
    expect(testBtn).toBeTruthy();
    await testBtn!.trigger('click');
    await flushPromises();
    expect(testAiConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 1 }),
    );

    // Clicking "Use model default" clears the input and saves temperature: null
    const defaultBtn = wrapper
      .findAll('#ai-settings button')
      .find((b) => /Dùng mặc định|Use model default/i.test(b.text()));
    expect(defaultBtn).toBeTruthy();
    await defaultBtn!.trigger('click');
    await flushPromises();
    expect((tempInput.element as HTMLInputElement).value).toBe('');

    await wrapper.find('#ai-settings').trigger('submit');
    await flushPromises();
    expect(updateAiSettingsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ temperature: null }),
    );
  });
});
