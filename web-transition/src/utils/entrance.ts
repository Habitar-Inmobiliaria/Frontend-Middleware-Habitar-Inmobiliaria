// Persistencia de la animación de entrada (skeleton + stagger).
// Misma idea que tutorial_seen_${token}: una vez vista, no se repite al recargar.

function storageKey(token: string): string {
  return `vitrina_entrance_seen_${token}`;
}

export function hasSeenEntrance(token: string): boolean {
  if (!token || typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(storageKey(token)) === 'true';
  } catch {
    return true;
  }
}

export function markEntranceSeen(token: string): void {
  if (!token || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(token), 'true');
  } catch {
    // Ignorar cuotas / modo privado
  }
}
