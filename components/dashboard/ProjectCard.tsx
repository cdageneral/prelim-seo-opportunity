'use client';

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
  project:   Project;
  onDelete:  (id: string) => void;
  onRename:  (id: string, newName: string) => void;
}

export default function ProjectCard({ project, onDelete, onRename }: Props) {
  const [renaming, setRenaming]     = useState(false);
  const [newName, setNewName]       = useState(project.clientName);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const domain   = project.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  const initials = project.clientName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  // Focus input when rename starts
  useEffect(() => { if (renaming) inputRef.current?.focus(); }, [renaming]);

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

        {/* ⋯ Menu — shared with the list view (v7.401) */}
        <ProjectMenu
          projectId={project.id}
          onRenameStart={() => setRenaming(true)}
          onDeleteStart={() => setConfirmDelete(true)}
        />
      </div>

      {/* Industry */}
      {project.industry && (
        <span className="text-xs text-orbit-secondary bg-orbit-muted/50 px-2 py-0.5 rounded-full w-fit">
          {project.industry}
        </span>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-orbit-border mt-auto">
        <span className="text-xs font-medium text-orbit-green">{project.status}</span>
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
              className="px-4 py-1.5 text-xs bg-orbit-red hover:opacity-90 text-white rounded-lg transition-opacity"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
