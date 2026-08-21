/** Locally persisted analysis preferences. */
export interface Preferences {
  defaultLanguage: string;
  analysisDepth: 'quick' | 'standard' | 'deep';
  ignoredDirs: string;
}

export const defaultPreferences: Preferences = {
  defaultLanguage: 'python',
  analysisDepth: 'standard',
  ignoredDirs: 'node_modules, .git, dist, build, venv, .next, target',
};

const KEY = 'codeauth-preferences';

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaultPreferences, ...JSON.parse(raw) } : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — preferences stay session-only */
  }
}
