import { z } from 'zod';
const PlaybookRow = z.object({
  brand: z.string().min(1).max(120),
  doingWell: z.string().min(1).max(900),
  vulnerable: z.string().min(1).max(900),
  keyStat: z.string().min(1).max(160),
}).strict();
export const GeneratedSchema = z.object({
  situation: z.object({
    headline: z.string().min(1).max(320),
    body: z.string().min(1).max(2000),
  }).strict(),
  // what is holding the brand back — the binding constraints, with the mechanism
  holdingBack: z.array(z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(1200),
    lines: z.array(z.string().max(120)).max(8),
    evidence: z.string().min(1).max(400),
  }).strict()).min(1).max(6),
  opportunities: z.array(z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(1200),
    sizing: z.string().min(1).max(300),
    impact: z.enum(['HIGH', 'MEDIUM']),
  }).strict()).min(1).max(6),
  invest: z.object({
    order: z.array(z.object({
      move: z.string().min(1).max(200),
      why: z.string().min(1).max(900),
      modeledGain: z.string().min(1).max(300),
    }).strict()).min(1).max(6),
    caveat: z.string().max(500).nullable(),
  }).strict(),
  leaderPath: z.object({
    whatLeaderLooksLike: z.string().min(1).max(900),
    gap: z.string().min(1).max(900),
    incrementalGain: z.string().min(1).max(600),
    constraints: z.array(z.string().max(300)).max(6),
  }).strict(),
  playbook: z.array(PlaybookRow).max(15),
  localMarkets: z.object({
    summary: z.string().min(1).max(1200),
    markets: z.array(z.object({ city: z.string().min(1).max(80), finding: z.string().min(1).max(400) }).strict()).max(12),
  }).strict().nullable(),
  shifts: z.array(z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(900) }).strict()).max(4),
  sources: z.array(z.string().max(160)).max(20),
}).strict();
