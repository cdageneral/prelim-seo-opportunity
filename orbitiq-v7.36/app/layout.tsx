import type { Metadata } from 'next';
import './globals.css';

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
      </head>
      <body className="min-h-screen bg-orbit-bg text-orbit-primary antialiased">
        {children}
      </body>
    </html>
  );
}
