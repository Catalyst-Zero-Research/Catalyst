const ELEMENT_COLORS: Record<string, string> = {
  H: '#e6edf6',
  C: '#8a9cab',
  N: '#5ea1ff',
  O: '#ff6b6b',
  F: '#7bd88f',
  Na: '#87c3ff',
  Mg: '#8ec7ff',
  Al: '#c2ccd8',
  Si: '#f0c36a',
  P: '#f7ac63',
  S: '#f6d365',
  Cl: '#9ae66e',
  K: '#b09cff',
  Ca: '#9ec4ff',
  Ti: '#b7c4d4',
  V: '#a7b8c9',
  Cr: '#98aabf',
  Mn: '#f0a36f',
  Fe: '#f59e7a',
  Co: '#b88af0',
  Ni: '#7ab6f0',
  Cu: '#ec8f5c',
  Zn: '#9fb7d2',
  Ga: '#adc1d7',
  Ge: '#9caebb',
  As: '#8b9daa',
  Se: '#f7d389',
  Zr: '#a6c6de',
  Nb: '#90b1d0',
  Mo: '#8ba7c4',
  W: '#7f9abb',
};

export function elementColor(symbol?: string): string {
  if (!symbol) return '#8fbcff';
  return ELEMENT_COLORS[symbol] || '#8fbcff';
}
