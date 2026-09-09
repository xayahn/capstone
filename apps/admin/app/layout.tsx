import type { Metadata } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import '@/frontend/styles/globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  applicationName: 'ParishLink Administration',
  title: {
    default: 'ParishLink Administration',
    template: '%s · ParishLink Administration',
  },
  description:
    'Secure sacramental services coordination for the Vicariate of St. John Mary Vianney.',
  robots: { index: false, follow: false },
  openGraph: {
    type: 'website',
    title: 'ParishLink Administration',
    description: 'Secure sacramental services coordination for authorized parish personnel.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'ParishLink Administration' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ParishLink Administration',
    description: 'Secure sacramental services coordination for authorized parish personnel.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${cormorant.variable}`}>{children}</body>
    </html>
  );
}
