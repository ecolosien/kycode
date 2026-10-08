/** Domaine du service de redirection (étape 4) : https://kyskan.com/<identifiant>. */
export const REDIRECT_BASE = 'https://kyskan.com/';

export const redirectUrl = (id: string) => REDIRECT_BASE + id;

/** Codes de la feuille de test : T + taille en mm sur 3 chiffres + style sur 4 lettres (ex. T025noir). */
export const TEST_STYLES = {
  noir: { label: 'noir', options: {} },
  pnts: { label: 'points 15 %', options: { inset: 0.15 } },
  bleu: { label: 'bleu', options: { foreground: '#1b4fa8' } },
  gris: { label: 'gris faible contraste', options: { foreground: '#8a8a8a' } },
} as const;

export function describeTestId(id: string): string | null {
  const m = /^T(\d{3})(noir|pnts|bleu|gris)$/.exec(id);
  if (!m) return null;
  return `Code de test : ${Number(m[1])} mm, ${TEST_STYLES[m[2] as keyof typeof TEST_STYLES].label}`;
}
