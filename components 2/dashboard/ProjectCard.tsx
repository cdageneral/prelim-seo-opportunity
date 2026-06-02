'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface Project {
  id:         string;
  clientName: string;
  websiteUrl: string;
  industry:   string | null;
  status:     string;
  updatedAt:  string;
}

interface Props {
  project:   Project;
  onDelete:  (id: string) => void;
  onRename:  (id: string, newName: string) => void;
}

export default function ProjectCard({ project, onDelete, onRename }: Props) {
  const [menuOpen, setMenuOpen]     = useState(false);
  const [renaming, setRenaming]     = useState(false);
  const [newName, setNewName]       = useState(project.clientName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef  = useRef<HTMLDivElement>(null);

  const domain   = project.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const initials = project.clientName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  // Focus input when rename starts
  useEffect(() => { if (renaming) inputRef.current?.focus(); }, [renaming]);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function submitRename() {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== project.clientName) onRename(project.id, trimmed);
    setRenaming(false);
  }

  return (
    <div className="orbit-card p-5 flex flex-col gap-4 hover:shadow-orbit transition-all duration-200 group relative">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-orbit-accent/20 border border-orbit-accent/30 flex items-center justify-center text-orbit-accent font-semibold text-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                ref={inputRef}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onBlur={submitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter')  submitRename();
                  if (e.key === 'Escape') { setNewName(project.clientName); setRenaming(false); }
                }}
                className="w-full bg-orbit-muted border border-orbit-accent rounded px-2 py-0.5 text-orbit-primary text-sm font-medium focus:outline-none"
              />
            ) : (
              <Link href={`/projects/${project.id}`}>
                <h3 className="text-orbit-primary font-medium text-sm leading-tight hover:text-orbit-accent-light transition-colors truncate">
                  {project.clientName}
                </h3>
              </Link>
            )}
            <p className="text-orbit-tertiary text-xs mt-0.5 truncate">{domain}</p>
          </div>
        </div>

        {/* ⋯ Menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={e => { e.preventDefault(); setMenuOpen(o => !o); }}
            className="w-7 h-7 flex items-center justify-center text-orbit-tertiary hover:text-orbit-primary hover:bg-orbit-muted rounded transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5"  cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 w-36 bg-orbit-card border border-orbit-border rounded-lg shadow-orbit-lg overflow-hidden animate-fade-in">
              <button
                onClick={() => { setMenuOpen(false); setRenaming(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-orbit-secondary hover:text-orbit-primary hover:bg-orbit-muted text-xs transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Rename
              </button>
              <Link
                href={`/projects/${project.id}`}
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
                onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 text-xs transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Industry */}
      {project.industry && (
        <span className="text-xs text-orbit-secondary bg-orbit-muted px-2 py-0.5 rounded-full w-fit">
          {project.industry}
        </span>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-orbit-border mt-auto">
        <span className="text-xs font-medium text-green-400">{project.status}</span>
        <span className="text-orbit-tertiary text-xs">
          {new Date(project.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-orbit-bg/95 rounded-xl flex flex-col items-center justify-center gap-3 p-4 z-10 animate-fade-in">
          <p className="text-orbit-primary text-sm font-medium text-center">Delete &ldquo;{project.clientName}&rdquo;?</p>
          <p className="text-orbit-secondary text-xs text-center">This removes all analyses and data. Cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-1.5 text-xs border border-orbit-border text-orbit-secondary hover:text-orbit-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onDelete(project.id)}
              className="px-4 py-1.5 text-xs bg-red-500 hover:bg-red-400 text-white rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
