'use client';

import { useState } from 'react';

interface Props {
  analysisId: string;
  projectId:  string;
  clientName: string;
}

export default function ReportsPanel({ analysisId, projectId, clientName }: Props) {
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const [pptLoading,  setPptLoading]  = useState(false);
  const [pptPrompt,   setPptPrompt]   = useState<string | null>(null);
  const [copied,      setCopied]      = useState(false);

  async function generatePDF() {
    setPdfLoading(true);
    try {
      const res  = await fetch('/api/reports/pdf', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ analysisId }),
      });
      const data = await res.json();
      if (res.ok && data.fileUrl) {
        window.open(data.fileUrl, '_blank');
      }
    } finally {
      setPdfLoading(false);
    }
  }

  async function generatePPTPrompt() {
    setPptLoading(true);
    try {
      const res  = await fetch('/api/reports/ppt-prompt', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ analysisId }),
      });
      const data = await res.json();
      if (res.ok && data.promptText) {
        setPptPrompt(data.promptText);
      }
    } finally {
      setPptLoading(false);
    }
  }

  function copyPrompt() {
    if (!pptPrompt) return;
    navigator.clipboard.writeText(pptPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="orbit-card p-6 flex flex-col gap-5">
      <div>
        <p className="text-orbit-secondary text-xs font-medium uppercase tracking-widest">Export</p>
        <h3 className="text-orbit-primary text-lg font-semibold mt-1">Generate Reports</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PDF Export */}
        <div className="bg-orbit-surface border border-orbit-border rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-orbit-primary font-medium text-sm">PDF Brief</p>
              <p className="text-orbit-tertiary text-xs">Styled, shareable PDF</p>
            </div>
          </div>
          <p className="text-orbit-secondary text-xs leading-relaxed">
            Export the full OrbitIQ brief as a styled PDF. Print-ready, share-ready, CMO-ready.
          </p>
          <button
            onClick={generatePDF}
            disabled={pdfLoading}
            className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-40"
          >
            {pdfLoading ? 'Generating PDF...' : 'Generate PDF'}
          </button>
        </div>

        {/* PPT Prompt */}
        <div className="bg-orbit-surface border border-orbit-border rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orbit-accent/10 border border-orbit-accent/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-orbit-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-orbit-primary font-medium text-sm">PowerPoint Prompt</p>
              <p className="text-orbit-tertiary text-xs">For the Claude PPTX skill</p>
            </div>
          </div>
          <p className="text-orbit-secondary text-xs leading-relaxed">
            Generate a pre-loaded Claude prompt with all client data. Paste into the PPTX skill to create a polished 10-slide deck in seconds.
          </p>
          <button
            onClick={generatePPTPrompt}
            disabled={pptLoading}
            className="w-full bg-orbit-accent/10 hover:bg-orbit-accent/20 border border-orbit-accent/30 text-orbit-accent text-sm font-medium py-2 rounded-lg transition-colors disabled:opacity-40"
          >
            {pptLoading ? 'Generating...' : 'Generate PPT Prompt'}
          </button>
        </div>
      </div>

      {/* PPT Prompt Display */}
      {pptPrompt && (
        <div className="bg-orbit-surface border border-orbit-border rounded-xl p-5 flex flex-col gap-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-orbit-accent text-sm font-medium">Claude PPTX Skill Prompt — Ready to Paste</p>
            <button
              onClick={copyPrompt}
              className="flex items-center gap-1.5 text-xs text-orbit-secondary hover:text-orbit-primary border border-orbit-border px-3 py-1.5 rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Prompt
                </>
              )}
            </button>
          </div>
          <pre className="text-orbit-secondary text-xs leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto font-mono bg-orbit-bg rounded-lg p-4 border border-orbit-border">
            {pptPrompt}
          </pre>
          <p className="text-orbit-tertiary text-xs">
            Paste this prompt into the Claude PPTX skill (type <code className="bg-orbit-muted px-1 py-0.5 rounded text-orbit-accent">/pptx</code> in Claude) to auto-generate the presentation.
          </p>
        </div>
      )}
    </div>
  );
}
