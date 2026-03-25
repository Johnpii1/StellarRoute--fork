export type ThemeSetting = 'light' | 'dark' | 'system';

export interface Settings {
  slippageTolerance: number;
  theme: ThemeSetting;
}

export const DEFAULT_SETTINGS: Settings = {
  slippageTolerance: 0.5,
  theme: 'system',
};
