/**
 * /usage — cross-project API Usage Dashboard (v7.225)
 *
 * The global "Dashboard" button (top nav) opens this. Shows credit usage across
 * ALL projects plus a per-project breakdown, without entering any project.
 */

import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import UsageRollup from '@/components/dashboard/UsageRollup';

export const dynamic = 'force-dynamic';

export default function UsageDashboardPage() {
  return (
    <div className="min-h-screen bg-orbit-bg">
      {/* Global nav (mirrors dashboard) */}
      <nav className="border-b border-orbit-border bg-orbit-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold gradient-text">OrbitIQ</Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-orbit-border text-orbit-secondary hover:text-orbit-primary hover:border-orbit-accent/40 transition-colors"
            >
              <i className="ti ti-layout-grid" aria-hidden="true" />
              Projects
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <UsageRollup />
      </main>
    </div>
  );
}
