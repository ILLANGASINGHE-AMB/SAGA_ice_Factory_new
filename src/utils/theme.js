import beachThemeUrl from '../assets/themes/beach-theme.svg';
import oceanThemeUrl from '../assets/themes/ocean-theme.svg';

export const THEME_STORAGE_KEY = 'saga_ice_theme';

// 'beach' reads as a bright, light-based theme; 'ocean' is a deep, dark-based
// theme, so each maps onto the app's existing light/dark class strategy
// (Tailwind's `dark` variant) while layering its own wallpaper on top.
export const THEMES = [
  { value: 'light', label: 'Light Theme', isDarkBase: false, backgroundUrl: null },
  { value: 'dark', label: 'Dark Theme', isDarkBase: true, backgroundUrl: null },
  { value: 'beach', label: 'Beach Theme', isDarkBase: false, backgroundUrl: beachThemeUrl },
  { value: 'ocean', label: 'Ocean Theme', isDarkBase: true, backgroundUrl: oceanThemeUrl }
];

const VALID_THEMES = new Set(THEMES.map(t => t.value));

export function getThemeConfig(value) {
  return THEMES.find(t => t.value === value) || THEMES[0];
}

export function getStoredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (VALID_THEMES.has(saved)) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Applies the theme's dark/light base class plus a data attribute (for the
// wallpaper layer to key off), persists it, and notifies other mounted
// components (AppShell's header toggle, Settings page) via the same
// 'theme-changed' event they already listen for.
export function applyTheme(value) {
  const theme = VALID_THEMES.has(value) ? value : 'light';
  const { isDarkBase } = getThemeConfig(theme);
  document.documentElement.classList.toggle('dark', isDarkBase);
  document.documentElement.setAttribute('data-app-theme', theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new Event('theme-changed'));
}
