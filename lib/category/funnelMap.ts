/**
 * lib/category/funnelMap.ts — v7.346 (Intent-First taxonomy, Const III.11)
 *
 * DETERMINISTIC intent-family → funnel-stage map. The discovery LLM classifies each
 * keyword's INTENT FAMILY (from the fixed vocabulary below); the funnel STAGE is then
 * assigned here in TypeScript — never an LLM per-keyword guess (Const III.11). This is
 * how the intent axis maps onto the existing Awareness → Consideration → Decision →
 * Retention funnel (Const III.2a), so the Journey / Exec panels keep reading a stage.
 *
 * Labels/structure only — no volume math here (Const I.1).
 */

export type FunnelStage = 'awareness' | 'consideration' | 'decision' | 'retention';

// The fixed intent-family vocabulary (Const v0.20 — "Approved intent families").
// These are user TASKS, not modifiers: each represents a distinct page architecture.
export type IntentFamily =
  | 'learn' | 'definition' | 'education' | 'how-it-works' | 'benefits' | 'faqs'
  | 'comparison' | 'selection' | 'reviews' | 'alternatives' | 'use-cases'
  | 'qualification' | 'application' | 'purchase' | 'requirements' | 'eligibility' | 'rates' | 'calculator'
  | 'management' | 'optimization' | 'support' | 'troubleshooting' | 'maintenance' | 'redemption' | 'merchant-acceptance';

export const INTENT_FAMILIES: IntentFamily[] = [
  'learn', 'definition', 'education', 'how-it-works', 'benefits', 'faqs',
  'comparison', 'selection', 'reviews', 'alternatives', 'use-cases',
  'qualification', 'application', 'purchase', 'requirements', 'eligibility', 'rates', 'calculator',
  'management', 'optimization', 'support', 'troubleshooting', 'maintenance', 'redemption', 'merchant-acceptance',
];

const STAGE_BY_FAMILY: Record<IntentFamily, FunnelStage> = {
  // Awareness — the user is learning / problem-aware
  learn: 'awareness', definition: 'awareness', education: 'awareness',
  'how-it-works': 'awareness', benefits: 'awareness', faqs: 'awareness',
  // Consideration — the user is comparing / choosing
  comparison: 'consideration', selection: 'consideration', reviews: 'consideration',
  alternatives: 'consideration', 'use-cases': 'consideration',
  // Decision — the user is qualifying / applying / pricing
  qualification: 'decision', application: 'decision', purchase: 'decision',
  requirements: 'decision', eligibility: 'decision', rates: 'decision', calculator: 'decision',
  // Retention — the user already has the product and is using / managing it
  management: 'retention', optimization: 'retention', support: 'retention',
  troubleshooting: 'retention', maintenance: 'retention', redemption: 'retention',
  'merchant-acceptance': 'retention',
};

/** Normalize a raw model value to a known IntentFamily, or null if unrecognized. */
export function normalizeIntentFamily(s: unknown): IntentFamily | null {
  const v = String(s ?? '').toLowerCase().trim().replace(/[_\s]+/g, '-');
  return (INTENT_FAMILIES as string[]).includes(v) ? (v as IntentFamily) : null;
}

/** Deterministic funnel stage for an intent family. Unknown → 'awareness' (honest default). */
export function funnelStageForFamily(family: unknown): FunnelStage {
  const f = normalizeIntentFamily(family);
  return f ? STAGE_BY_FAMILY[f] : 'awareness';
}
