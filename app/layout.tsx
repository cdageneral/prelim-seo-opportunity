import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       'OrbitIQ — Organic Growth Intelligence',
  description: 'Uncover true organic opportunities. CMO-level intelligence for any website.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-orbit-bg text-orbit-primary antialiased">
        {children}
      </body>
    </html>
  );
}
