'use client';

/**
 * ProjectMenu — the ⋯ overflow menu shared by the dashboard's tile card and
 * list row (v7.401).
 *
 * Extracted from ProjectCard so the two views cannot drift: one menu, one set
 * of actions (Rename / Open / Delete), rendered identically whichever view is
 * active. The parent owns the rename input and the delete confirmation; this
 * component only reports which action was picked.
 *
 * Theme: colours come from the theme-aware `orbit-*` tokens (plus the shared
 * `text-orbit-red` signal ink), so both themes stay legible — no raw Tailwind
 * palette classes that only read on one background (Const. IV.6).
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Props {
  projectId:      string;
  onRenameStart:  () => void;
  onDeleteStart:  () => void;
  /** Extra classes for the trigger button (sizing differs card vs row). */
  triggerClass?:  string;
  /** Menu opens right-aligned below the trigger; row view needs it shifted up. */
  align?:         'below' | 'below-right';
}

export default function ProjectMenu({
  projectId,
  onRenameStart,
  onDeleteStart,
  triggerClass = 'w-7 h-7',
  align = 'below',
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={e => { e.preventDefault(); setMenuOpen(o => !o); }}
        className={`${triggerClass} flex items-center justify-center text-orbit-tertiary hover:text-orbit-primary hover:bg-orbit-muted rounded transition-colors`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5"  cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className={`absolute right-0 ${align === 'below-right' ? 'top-9' : 'top-8'} z-50 w-36 bg-orbit-card border border-orbit-border rounded-lg shadow-orbit-lg overflow-hidden animate-fade-in`}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); onRenameStart(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-orbit-secondary hover:text-orbit-primary hover:bg-orbit-muted text-xs transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Rename
          </button>
          <Link
            href={`/projects/${projectId}`}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="w-full flex items-center gap-2 px-3 py-2 text-orbit-secondary hover:text-orbit-primary hover:bg-orbit-muted text-xs transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Open
          </Link>
          <div className="border-t border-orbit-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); onDeleteStart(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-orbit-red hover:bg-orbit-red/10 text-xs transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
