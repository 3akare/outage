// The five states, each with a colour, an icon-free text label and one plain sentence (R2.1, copy.md).
// Optional Pidgin pack kept in the same file (design section 6). Pidgin is only used where a string exists; otherwise English.

export type StateKey = 'NORMAL' | 'SPOT_ONLY' | 'POSSIBLE' | 'CONFIRMED' | 'RESTORED';
/** The four states a real page may show (R2.2). */
export type PublicStateKey = Exclude<StateKey, 'SPOT_ONLY'>;
export type Lang = 'en' | 'pcm';

export const STATE_KEYS: readonly StateKey[] = ['NORMAL', 'SPOT_ONLY', 'POSSIBLE', 'CONFIRMED', 'RESTORED'];
export const PUBLIC_STATE_KEYS: readonly PublicStateKey[] = ['NORMAL', 'POSSIBLE', 'CONFIRMED', 'RESTORED'];

type StateText = { label: string; sentence: string };

export const STATE_COLOURS: Record<StateKey, { bg: string; fg: string; edge: string }> = {
  NORMAL: { bg: '#e3f4e8', fg: '#0b3d1c', edge: '#1b7f3b' },
  SPOT_ONLY: { bg: '#ece6fa', fg: '#2c1a5e', edge: '#6b46c1' },
  POSSIBLE: { bg: '#fff3d1', fg: '#4a3200', edge: '#b7791f' },
  CONFIRMED: { bg: '#fde2e2', fg: '#5c0a0a', edge: '#c53030' },
  RESTORED: { bg: '#dceefb', fg: '#08304f', edge: '#2b6cb0' },
};

const EN: Record<StateKey, StateText> = {
  NORMAL: { label: 'Power on', sentence: 'Power looks normal.' },
  SPOT_ONLY: { label: 'Your spot only', sentence: 'Only your phone lost power.' },
  POSSIBLE: { label: 'Possible power cut', sentence: 'Some phones lost power. We are checking.' },
  CONFIRMED: { label: 'Power cut', sentence: 'Power is out. Many phones lost it together.' },
  RESTORED: { label: 'Power is back', sentence: 'Power came back.' },
};

// Only the string the brief gives is written in Pidgin. A person who speaks it should review and extend this pack.
const PCM: Partial<Record<StateKey, StateText>> = {
  RESTORED: { label: 'Light don come!', sentence: 'Power came back.' },
};

export function stateText(state: StateKey, lang: Lang = 'en'): StateText {
  return (lang === 'pcm' ? PCM[state] : undefined) ?? EN[state];
}

export const PRECISION_LABEL = {
  CELL: 'This area',
  LINKED: 'Linked nearby areas',
  COARSE: 'Based on a wider area',
} as const;

export const NO_COVERAGE_TEXT = 'No phones here yet. Install Outage to be the first.';
export const UNAVAILABLE_TEXT = 'Status is not available right now.';
export const PHONES_TEXT = '3+ phones';
