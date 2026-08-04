'use client';

/**
 * ProjectRow — the list-view counterpart to ProjectCard (v7.401).
 *
 * Same data, same actions (rename inline, open, delete with confirm), laid out
 * as a dense row so a long client list reads top-to-bottom instead of wrapping
 * across a grid. Sorting and filtering live in the dashboard page; this
 * component renders exactly one project.
 *
 * Theme (Const. IV.6 / V.5): every colour is a theme-aware `orbit-*` token —
 * including the status ink, which uses `text-orbit-green`. The raw Tailwind
 * palette greens do not follow [data-theme] and render near-invisible (~1.8:1)
 * on the light surface, so none is used here.
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import ProjectMenu from './ProjectMenu';

interface Project {
  id:         string;
  clientName: string;
  websiteUrl: string;
  industry:   string | null;
  status:     string;
  updatedAt:  string;
}

interface Props {
  project:  Project;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export default function ProjectRow({ project, onDelete, onRename }: Props) {
  const [renaming, setRenaming]           = useState(false);
  const [newName, setNewName]             = useState(project.clientName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const domain   = project.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const initials = project.clientName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  useEffect(() => { if (renaming) inputRef.current?.focus(); }, [renaming]);

  function submitRename() {
    const trimmed = newName.trim();
    if (trimmed && trimmed !== project.clientName) onRename(project.id, trimmed);
    setRenaming(false);
  }

  if (confirmDelete) {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-orbit-border last:border-b-0 bg-orbit-muted/40 animate-fade-in">
        <span className="text-orbit-primary text-sm font-medium">
          Delete &ldquo;{project.clientName}&rdquo;?
        </span>
        <span className="text-orbit-secondary text-xs">
          This removes all analyses and data. Cannot be undone.
        </span>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setConfirmDelete(false)}
            className="px-4 py-1.5 text-xs border border-orbit-border text-orbit-secondary hover:text-orbit-primary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onDelete(project.id)}
            className="px-4 py-1.5 text-xs bg-orbit-red hover:opacity-90 text-white rounded-lg transition-opacity"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_5.5rem_5rem_2rem] items-center gap-3 px-4 py-3 border-b border-orbit-border last:border-b-0 hover:bg-orbit-muted/40 transition-colors">
      {/* Client */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-orbit-accent/20 border border-orbit-accent/30 flex items-center justify-center text-orbit-accent font-semibold text-xs shrink-0">
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

      {/* Industry */}
      <div className="hidden md:block min-w-0">
        {project.industry && (
          <span className="text-xs text-orbit-secondary bg-orbit-muted/50 px-2 py-0.5 rounded-full inline-block max-w-full truncate">
            {project.industry}
          </span>
        )}
      </div>

      {/* Status */}
      <span className="hidden md:block text-xs font-medium text-orbit-green truncate">
        {project.status}
      </span>

      {/* Updated */}
      <span className="hidden md:block text-orbit-tertiary text-xs whitespace-nowrap">
        {new Date(project.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>

      {/* ⋯ */}
      <ProjectMenu
        projectId={project.id}
        onRenameStart={() => setRenaming(true)}
        onDeleteStart={() => setConfirmDelete(true)}
        triggerClass="w-8 h-8"
        align="below-right"
      />
    </div>
  );
}
