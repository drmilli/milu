import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import '../styles/globals.css';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://miluai.app';

export const viewport: Viewport = {
  themeColor: '#5C3D2E',
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Milu — AI Voice Customer Service for Businesses',
    template: '%s — Milu',
  },
  description:
    'Milu is an AI voice agent that answers your business calls 24/7 — handling FAQs, booking appointments, and escalating to you when it matters. Built for Africa and the UAE.',
  keywords: [
    'AI voice agent Africa',
    'AI customer service Nigeria',
    'automated phone answering Nigeria',
    'AI receptionist Africa',
    'voice AI small business',
    'business phone automation Nigeria',
    'AI call answering Lagos',
    'AI voice agent UAE',
    'AI customer service Dubai',
    'AI receptionist Dubai',
    'business phone automation UAE',
    'AI call center Dubai',
    'automated answering service Abu Dhabi',
    'AI voice assistant UAE',
    'AI phone agent Middle East',
    'small business AI UAE',
  ],
  authors: [{ name: 'Milu Technologies', url: siteUrl }],
  creator: 'Milu Technologies',
  publisher: 'Milu Technologies',
  category: 'Technology',
  applicationName: 'Milu',

  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['en_NG', 'en_AE'],
    url: siteUrl,
    siteName: 'Milu',
    title: 'Milu — AI Voice Customer Service for Businesses',
    description:
      'Every call answered, every customer kept. Milu is an AI voice agent built for businesses in Africa and the UAE — 24/7, multilingual, on your existing number.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Milu — AI Voice Customer Service for Businesses',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',
    title: 'Milu — AI Voice Customer Service for Businesses',
    description:
      'Every call answered, every customer kept. AI voice agent built for businesses.',
    images: ['/og-image.png'],
    creator: '@miluai',
    site: '@miluai',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/brand/icon-mark.svg',
  },

  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
