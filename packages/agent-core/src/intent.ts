import type { Intent } from './types';

const PATTERNS: Array<{ intent: Intent; patterns: RegExp[] }> = [
  {
    intent: 'escalate',
    patterns: [
      /speak (to|with) (a |the )?(human|person|agent|manager|representative)/i,
      /transfer me/i,
      /talk to someone/i,
    ],
  },
  {
    intent: 'booking',
    patterns: [
      /book(ing)?/i,
      /appointment/i,
      /schedul(e|ing)/i,
      /reserv(e|ation)/i,
      /order/i,
    ],
  },
  {
    intent: 'order_status',
    patterns: [
      /order status/i,
      /where is my (order|delivery|package)/i,
      /track(ing)?/i,
      /when (will|does) (it|my order)/i,
    ],
  },
  {
    intent: 'complaint',
    patterns: [
      /compla(in|int)/i,
      /unhappy/i,
      /not (happy|satisfied|working)/i,
      /problem with/i,
      /issue with/i,
      /broken/i,
    ],
  },
  {
    intent: 'faq',
    patterns: [
      /how (much|many|do|does|can)/i,
      /what (is|are|time|hour)/i,
      /when (are|do|does)/i,
      /do you (offer|have|accept)/i,
    ],
  },
];

export function classifyIntent(text: string): Intent {
  for (const { intent, patterns } of PATTERNS) {
    if (patterns.some((p) => p.test(text))) return intent;
  }
  return 'unknown';
}
