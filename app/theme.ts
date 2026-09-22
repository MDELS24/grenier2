export type Theme = 'light' | 'dark';

const storageKey = 'grenier2-theme';

/** Détermine le thème initial : choix enregistré, puis préférence du système. */
export function getPreferredTheme(): Theme {
  try {
    const savedTheme = localStorage.getItem(storageKey);
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  } catch {
    /* Le thème du système reste disponible si le stockage local est bloqué. */
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applique le thème au document et mémorise un choix explicite. */
export function applyTheme(theme: Theme, remember = true) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;

  if (!remember) return;
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    /* Le thème reste actif pour la session si le stockage local est bloqué. */
  }
}

/** Applique le thème avant le premier rendu pour limiter le changement visuel. */
export function initializeTheme(): Theme {
  const theme = getPreferredTheme();
  applyTheme(theme, false);
  return theme;
}
