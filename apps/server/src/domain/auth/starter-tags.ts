import type { OperationResponse } from '@pulse/contract';

type WireTag = OperationResponse<'auth.completeFirstSignIn'>['tags'][number];

export interface StarterTag {
  readonly name: string;
  readonly category: WireTag['category'];
  readonly distractionClass: WireTag['distractionClass'];
}

/**
 * TAG-07, US-6.1: the tags every account gets at first sign-in, in this order. Gaming and Social
 * Media are Leisure tags linked to their distraction classes (TAG-08, R-43); the others are
 * ordinary tags.
 */
export const STARTER_TAGS: readonly StarterTag[] = [
  { name: 'Deep Work', category: 'productive', distractionClass: null },
  { name: 'Learning', category: 'productive', distractionClass: null },
  { name: 'Meeting', category: 'neutral', distractionClass: null },
  { name: 'Admin', category: 'neutral', distractionClass: null },
  { name: 'Break', category: 'neutral', distractionClass: null },
  { name: 'Gaming', category: 'leisure', distractionClass: 'gaming' },
  { name: 'Social Media', category: 'leisure', distractionClass: 'social' },
];
