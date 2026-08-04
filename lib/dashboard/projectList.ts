/**
 * lib/dashboard/projectList.ts — pure list mechanics for the dashboard (v7.401).
 *
 * The Client Projects page can show the same projects as tiles or as an
 * alphabetical list, with a live search box over both. The filtering and
 * sorting live here rather than in `app/dashboard/page.tsx` for two reasons:
 *
 *   1. A Next.js route file may only export its default component plus the
 *      reserved route exports — named helpers exported from `page.tsx` fail the
 *      App Router's build-time page-type check.
 *   2. Pure functions can be exercised directly by the retained regression
 *      suite (Const. V.6) with no bundling of React.
 *
 * Nothing here derives, models or infers data: it filters and orders the rows
 * the API returned, unchanged.
 */

export interface DashboardProject {
  id:         string;
  clientName: string;
  websiteUrl: string;
  industry:   string | null;
  status:     string;
  updatedAt:  string;
}

export type ViewMode = 'tile' | 'list';
export type SortKey  = 'name' | 'industry' | 'status' | 'updated';
export type SortDir  = 'asc' | 'desc';

/** localStorage key for the remembered tile/list choice (per browser). */
export const VIEW_KEY = 'orbitiq:dashboard:view';

/** Strip protocol + leading www. so "usbank.com" matches "https://www.usbank.com/". */
export function displayDomain(websiteUrl: string): string {
  return websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
}

/** Read the stored view; anything unrecognised (or no storage) falls back to tiles. */
export function readStoredView(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'tile';
  } catch {
    return 'tile';
  }
}

export function writeStoredView(view: ViewMode): void {
  try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* private mode */ }
}

/**
 * Case-insensitive substring match across the fields a person would actually
 * type: client name, the URL and its bare domain, industry, and status.
 * An empty query matches everything.
 */
export function matchesQuery(p: DashboardProject, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.clientName, p.websiteUrl, displayDomain(p.websiteUrl), p.industry ?? '', p.status]
    .some(field => field.toLowerCase().includes(q));
}

export function filterProjects(list: DashboardProject[], query: string): DashboardProject[] {
  return list.filter(p => matchesQuery(p, query));
}

/**
 * Order the list. Default is alphabetical by client name (`name` / `asc`).
 * `localeCompare` with base sensitivity means casing and accents sort the way a
 * person reads them. Ties on a non-name column fall back to the client name so
 * the order is stable across re-renders. Never mutates the input.
 */
export function sortProjects(
  list: DashboardProject[],
  key: SortKey,
  dir: SortDir,
): DashboardProject[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = (a: DashboardProject, b: DashboardProject) =>
    a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' });

  return [...list].sort((a, b) => {
    let r: number;
    switch (key) {
      case 'updated':
        r = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        break;
      case 'industry':
        r = (a.industry ?? '').localeCompare(b.industry ?? '', undefined, { sensitivity: 'base' });
        break;
      case 'status':
        r = a.status.localeCompare(b.status, undefined, { sensitivity: 'base' });
        break;
      default:
        r = byName(a, b);
    }
    if (r === 0 && key !== 'name') return byName(a, b);
    return r * sign;
  });
}
