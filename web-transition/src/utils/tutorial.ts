// ============================================================
// Persistencia del tutorial de bienvenida
// ------------------------------------------------------------
// Portado de localStorage `tutorial_seen_${token}` en vitrina.js.
// ============================================================

function storageKey(token: string): string {
  return `tutorial_seen_${token}`;
}

export function hasSeenTutorial(token: string): boolean {
  if (!token || typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(storageKey(token)) === 'true';
  } catch {
    return true;
  }
}

export function markTutorialSeen(token: string): void {
  if (!token || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(token), 'true');
  } catch {
    // Ignorar cuotas / modo privado
  }
}
