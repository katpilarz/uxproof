// app/layout.tsx
// AppShell wraps every page — TopBar, Sidebar, SettingsDialog persist
// across /, /chat/[sessionId], /presentations.
//
// Typography mirrors paisak4u.com: Schibsted Grotesk for display and
// body, IBM Plex Mono for labels and numbers.

import type { Metadata } from 'next';
import { Schibsted_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ClientInit }    from '@/components/client-init';
import { AppShell }      from '@/components/app-shell';

const schibsted = Schibsted_Grotesk({
  subsets:  ['latin'],
  variable: '--font-schibsted',
});

const plexMono = IBM_Plex_Mono({
  weight:   ['300', '400', '500'],
  subsets:  ['latin'],
  variable: '--font-plex-mono',
});

export const metadata: Metadata = {
  title:       'uxproof — UX Research Reporting',
  description: 'Turn UX research data into client-ready presentations — validation made visible.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`
          ${schibsted.variable}
          ${plexMono.variable}
        `}
      >
        <ThemeProvider defaultTheme="light" storageKey="uxproof-theme">
          {/* Initialises the session store exactly once on first client render */}
          <ClientInit />
          {/* AppShell renders TopBar + Sidebar + SettingsDialog around every route */}
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
