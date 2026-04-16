import { Hero } from '../components/sections/Hero';
import { HowItWorks } from '../components/sections/HowItWorks';
import { Features } from '../components/sections/Features';
import { Pricing } from '../components/sections/Pricing';
import { Testimonials } from '../components/sections/Testimonials';
import { CTABanner } from '../components/sections/CTABanner';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://miluai.app';

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'Milu Technologies',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/brand/logo.svg`,
        width: 680,
        height: 320,
      },
      description:
        'AI voice customer service platform for African businesses. Answers calls 24/7, handles FAQs, books appointments, and escalates to humans when needed.',
      foundingLocation: { '@type': 'Place', name: 'Nigeria' },
      areaServed: 'Africa',
      sameAs: ['https://twitter.com/miluai'],
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'hello@miluai.app',
        contactType: 'customer support',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'Milu',
      publisher: { '@id': `${siteUrl}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${siteUrl}/?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteUrl}/#product`,
      name: 'Milu',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: siteUrl,
      offers: [
        { '@type': 'Offer', name: 'Starter', price: '15000', priceCurrency: 'NGN', billingIncrement: 'P1M' },
        { '@type': 'Offer', name: 'Growth', price: '45000', priceCurrency: 'NGN', billingIncrement: 'P1M' },
      ],
      description:
        'AI voice agent that answers your business phone calls 24/7 — built for African businesses on Africa\'s Talking infrastructure.',
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <HowItWorks />
      <Features />
      <Testimonials />
      <Pricing />
      <CTABanner />
    </>
  );
}
