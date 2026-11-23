import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
// Self-hosted (no runtime font CDN): Persian text (Vazirmatn), Latin logotype, micro UI.
import '@fontsource-variable/vazirmatn';
import '@fontsource/markazi-text/arabic-400.css';
import '@fontsource/markazi-text/arabic-500.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/jost/latin-300.css';
import '@fontsource/jost/latin-400.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nafis — قالیچه نفیس',
  description: 'Fine Persian rugs, shown one at a time.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#080808',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
