import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title:       'OrbitIQ — Organic Growth Intelligence',
  description: 'Uncover true organic opportunities. CMO-level intelligence for any website.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="min-h-screen bg-orbit-bg text-orbit-primary antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
