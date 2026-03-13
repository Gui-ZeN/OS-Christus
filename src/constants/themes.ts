export type AppThemeId = 'official' | 'blue-orange' | 'dark' | 'athletico';

export interface AppThemeOption {
  id: AppThemeId;
  label: string;
}

export const APP_THEMES: AppThemeOption[] = [
  { id: 'official', label: 'Oficial' },
  { id: 'blue-orange', label: 'Horizonte Solar' },
  { id: 'dark', label: 'Dark' },
  { id: 'athletico', label: 'Rubronegro' },
];

export const DEFAULT_APP_THEME: AppThemeId = 'official';
