import { ref, watch } from 'vue';

export type ThemeMode = 'light' | 'dark';

function initialTheme(): ThemeMode {
  const stored = window.localStorage.getItem('lr-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const theme = ref<ThemeMode>(initialTheme());

watch(
  theme,
  (value) => {
    document.documentElement.dataset.theme = value;
    window.localStorage.setItem('lr-theme', value);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.content = value === 'dark' ? '#121722' : '#ffffff';
    }
  },
  { immediate: true },
);

export function useTheme() {
  return {
    theme,
    toggle: () => {
      theme.value = theme.value === 'dark' ? 'light' : 'dark';
    },
  };
}
