export type AppThemeId = 'official' | 'blue-orange' | 'dark' | 'athletico';

export interface AppThemeOption {
  id: AppThemeId;
  label: string;
}

export const APP_THEMES: AppThemeOption[] = [
  { id: 'official', label: 'Oficial' },
  { id: 'blue-orange', label: 'Azul, Branco e Laranja' },
  { id: 'dark', label: 'Dark' },
  { id: 'athletico', label: 'Vermelho e Preto (Athletico)' },
];

export const DEFAULT_APP_THEME: AppThemeId = 'official';
