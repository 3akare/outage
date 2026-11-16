// Push text, English (alerts-and-light-alarm R6.6, R10.5, `copy.md`). The same words are in the app's strings.xml (push_*).
// No install ID and no number in any text. Area names come from the catalog later; until then "your area" (tasks.md, not in this spec).
import type { Precision } from '../area/view.ts';

export type PushKindName = 'CONFIRMED' | 'RESTORED';
export interface PushText {
  title: string;
  body: string;
}

export const AREA_WORDS = 'your area';

const TEXT: Record<PushKindName, { title: string; body: string; bodyWide: string }> = {
  CONFIRMED: {
    title: `Power is out in ${AREA_WORDS}`,
    body: 'Many phones stopped charging together.',
    bodyWide: 'Power looks out across a wide area.',
  },
  RESTORED: {
    title: `Power is back in ${AREA_WORDS}`,
    body: 'Phones are charging again.',
    bodyWide: 'Power looks back across a wide area.',
  },
};

/** "Wide area" wording when the public precision is COARSE (design 5.2 step 5). */
export function pushText(kind: PushKindName, precision: Precision): PushText {
  const t = TEXT[kind];
  return { title: t.title, body: precision === 'COARSE' ? t.bodyWide : t.body };
}

/** Every text, for the checker test. */
export const allPushTexts = (): string[] => Object.values(TEXT).flatMap((t) => [t.title, t.body, t.bodyWide]);
