// D-29: operations named now and shaped by the feature task in their definedBy field.
import { pending } from '../operation.js';

export const namedOnlyOperations = {
  'stats.today': pending(
    'stats',
    "Today snapshot: running session, today's totals, goals, streaks, balance.",
    'T2.4',
  ),
  'stats.period': pending(
    'stats',
    'Day, week or month stats: headlines, series, breakdowns, goal days.',
    'T4.4',
  ),
  'stats.dayTimeline': pending('stats', 'Timeline of one day.', 'T4.4'),
  'usage.reportIncrements': pending(
    'usage',
    'Report usage increments in a batch, each by its command ID.',
    'T6.1',
  ),
  'credits.getBalance': pending('credits', 'Balance snapshot (balance, rates).', 'T5.1'),
  'credits.listLedger': pending('credits', 'Ledger entries of a range, cursor-paged.', 'T5.1'),
  'credits.getBalanceSeries': pending('credits', 'Balance over a range.', 'T5.1'),
  'credits.getRates': pending('credits', 'Current credit rates.', 'T5.1'),
  'credits.setRates': pending('credits', 'Set credit rates from now on.', 'T5.1'),
  'achievements.list': pending('achievements', 'Recent and unnotified achievements.', 'T4.5'),
  'achievements.markNotified': pending(
    'achievements',
    'Mark achievements notified on this device.',
    'T4.5',
  ),
  'data.exportAll': pending('data', 'Export all data as JSON (AUTH-13).', 'T1.7'),
  'data.exportPeriod': pending(
    'data',
    'Export a period as CSV: sessions and daily summary.',
    'T4.6',
  ),
  'data.import': pending('data', 'Import legacy data (OPS-05).', 'T7.10', 'P1'),
} as const;
