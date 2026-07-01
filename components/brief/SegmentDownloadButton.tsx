'use client';

// v7.328: tiny presentational "download this segment as Excel" control. The cards /
// funnel bands / tabs it sits inside are already <button> elements, so this MUST be a
// <span role="button"> — never a nested <button> — and it stops event propagation so a
// click downloads without also toggling the parent card's filter. Green is a CSS var
// token (var(--c-34d399)) so it reads in BOTH light and dark themes (Const IV.6).

import React from 'react';

export default function SegmentDownloadButton({
  onDownload,
  title,
  size = 13,
  style,
}: {
  onDownload: () => void;
  title: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const fire = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDownload();
  };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={title}
      title={title}
      onClick={fire}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') fire(e);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: 'pointer',
        color: 'var(--c-34d399)',
        fontSize: size,
        lineHeight: 1,
        ...style,
      }}
    >
      <i className="ti ti-download" aria-hidden="true" style={{ fontSize: size }} />
    </span>
  );
}
