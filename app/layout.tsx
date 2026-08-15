import type { Metadata } from 'next';
import './globals.css';
import NoticeGate from '@/components/NoticeGate';

export const metadata: Metadata = {
  title:       'OrbitIQ — Organic Growth Intelligence',
  description: 'Uncover true organic opportunities. CMO-level intelligence for any website.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
        />
        {/* v7.185: set theme before first paint to avoid a flash.
            v7.427: LIGHT (Warm Paper) is the default — a stored choice still wins. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('orbitiq-theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();",
          }}
        />
      </head>
      <body className="min-h-screen bg-orbit-bg text-orbit-primary antialiased">
        {children}
        {/* v7.461: admin notices. Mounted once here so a broadcast reaches the
            user on whatever page they land on after signing in. Renders nothing
            when there is no signed-in user or no undismissed notice. */}
        <NoticeGate />
      </body>
    </html>
  );
}
