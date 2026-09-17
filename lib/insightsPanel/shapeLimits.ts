// v7.499 — the Insights blob's length limits, read from the schema itself.
//
// Why this exists: on 2026-09-16 an Aflac generation was discarded because
// playbook[4].keyStat ran past its 160-character cap. The prompt never told the
// model any cap ("keyStat":"one stat"), and the repair message only covered
// ungrounded numbers and standing claims — so all three repair rounds ran
// without the one instruction that would have fixed it. The limits the model
// is told are now DERIVED from the zod schema the draft is validated against,
// so the two can never drift apart, and a shape failure gets its own repair
// instruction naming each field, its limit and its actual length.
//
// Lives in lib/ because an App Router route file may export only handlers
// (the v7.401 trap).

import { z } from 'zod';

type Limit = { path: string; max: number };

function unwrap(s: z.ZodTypeAny): z.ZodTypeAny {
  let cur: any = s;
  for (let i = 0; i < 10; i++) {
    const t = cur?._def?.typeName;
    if (t === 'ZodNullable' || t === 'ZodOptional' || t === 'ZodDefault') cur = cur._def.innerType;
    else if (t === 'ZodEffects') cur = cur._def.schema;
    else break;
  }
  return cur;
}

/** Every string field with a max length, as a dotted path (arrays as `[]`). */
export function stringLimits(schema: z.ZodTypeAny, prefix = ''): Limit[] {
  const s: any = unwrap(schema);
  const t = s?._def?.typeName;
  if (t === 'ZodString') {
    const max = (s._def.checks ?? []).find((c: any) => c.kind === 'max');
    return max ? [{ path: prefix, max: max.value }] : [];
  }
  if (t === 'ZodArray') return stringLimits(s._def.type, prefix + '[]');
  if (t === 'ZodObject') {
    const shape = s.shape;
    const out: Limit[] = [];
    for (const k of Object.keys(shape)) out.push(...stringLimits(shape[k], prefix ? `${prefix}.${k}` : k));
    return out;
  }
  return [];
}

/** One prompt line: `path ≤ N` for every capped string field. */
export function limitsPromptLine(schema: z.ZodTypeAny): string {
  return stringLimits(schema).map(l => `${l.path} ≤ ${l.max}`).join('; ');
}

function valueAt(obj: any, path: (string | number)[]): unknown {
  let cur = obj;
  for (const p of path) { if (cur == null) return undefined; cur = cur[p as any]; }
  return cur;
}

/**
 * Human- and model-readable shape issues. For a too-long string it names the
 * field, its limit and the draft's actual length, so a repair can target it.
 */
export function describeShapeIssues(issues: z.ZodIssue[], obj: unknown, cap = 8): string {
  const parts = issues.slice(0, cap).map(i => {
    const path = i.path.join('.');
    if (i.code === 'too_big' && i.type === 'string') {
      const v = valueAt(obj, i.path);
      const len = typeof v === 'string' ? v.length : null;
      return `${path}: ${len != null ? `${len} characters, ` : ''}limit ${i.maximum}`;
    }
    return `${path}: ${i.message}`;
  });
  const more = issues.length > cap ? ` · +${issues.length - cap} more` : '';
  return parts.join(' · ') + more;
}

export const SHAPE_ERROR_PREFIX = 'JSON shape invalid: ';

/** True when a verification problem is a format failure, not a grounding one. */
export function isShapeProblem(problem: string | null | undefined): boolean {
  if (!problem) return false;
  return problem.startsWith(SHAPE_ERROR_PREFIX) || problem.startsWith('JSON parse failed') || problem.startsWith('No JSON object found');
}

/** The repair instruction for a format failure. */
export function shapeRepairMessage(problem: string, schema: z.ZodTypeAny): string {
  return 'FORMAT CHECK FAILED: ' + problem
    + '\nFix ONLY the fields named above. A field over its limit: shorten that text to fit — cut words, never alter a number it quotes. Keep every other field exactly as it was.'
    + '\nHard character limits for every field: ' + limitsPromptLine(schema)
    + '\nReply with the corrected single JSON object only.';
}
