import type { Metadata } from 'next';
import Link from 'next/link';
import { AnimateIn, StaggerContainer, StaggerItem } from '../../components/AnimateIn';

export const metadata: Metadata = {
  title: 'About',
  description: 'Built in Nigeria, for Africa. Meet the team behind Milu — the AI voice agent built for African businesses.',
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About Milu — Built in Nigeria, for Africa',
    description: 'Meet the team building AI voice infrastructure for African businesses.',
  },
};

const values = [
  {
    title: 'Built for Africa first',
    description: "We didn't adapt a Western product for Africa. We built Milu from scratch with Africa's Talking, local phone numbers, and the realities of running a business in Lagos, Abuja, or Nairobi.",
  },
  {
    title: 'Respect for the caller',
    description: "Our AI is warm, patient, and honest. It never pretends to be human when directly asked. It escalates without friction. We believe good customer service is a form of respect.",
  },
  {
    title: 'Obsession with speed',
    description: 'A sub-1.5 second response time is a hard requirement, not a stretch goal. Dead air kills phone conversations. We optimize every layer of the pipeline to keep it tight.',
  },
  {
    title: 'Transparency',
    description: 'Business owners see every conversation, every escalation, every failure. No black boxes. If the AI got something wrong, you should know — and be able to fix it.',
  },
];

const team = [
  {
    role: 'CEO / CTO',
    description: 'Former fintech engineer. Built payment infrastructure for 3M+ users across West Africa. Leads product, engineering, and AI architecture at Milu.',
    initials: 'AO',
  },
  {
    role: 'CMO / COO',
    description: 'Brand strategist and operator. Previously scaled two Lagos-based consumer startups. Owns marketing, partnerships, and day-to-day operations.',
    initials: 'TI',
  },
  {
    role: 'Head of Sales',
    description: 'Grew two Nigerian SaaS products from 0 to 10,000 paying businesses. Deep expertise in African SME sales cycles and distribution.',
    initials: 'NK',
  },
];

export default function AboutPage() {
  return (
    <main className="pt-24">
      {/* Hero */}
      <section className="py-24 px-6 md:px-10 bg-cream">
        <div className="max-w-3xl mx-auto">
          <AnimateIn>
            <p className="text-sm font-medium text-primary-warm uppercase tracking-widest mb-4">About</p>
            <h1 className="font-heading font-bold text-5xl md:text-6xl text-primary-dark mb-8 leading-tight">
              Built in Nigeria,<br />
              <span className="gradient-text italic">for Africa.</span>
            </h1>
            <p className="text-lg text-primary-warm leading-relaxed mb-6">
              Milu started from a simple observation: African businesses — salons, pharmacies, logistics companies, restaurants — miss hundreds of calls every week. Not because they don&apos;t care. Because they&apos;re busy running their business.
            </p>
            <p className="text-lg text-primary-warm leading-relaxed">
              Every missed call is a lost customer. We built Milu so that every business, regardless of size, can answer every call — intelligently, affordably, and in a way that actually reflects their brand.
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* Values */}
      <section className="py-24 px-6 md:px-10 bg-cream-light">
        <div className="max-w-5xl mx-auto">
          <AnimateIn className="mb-16">
            <h2 className="font-heading font-bold text-4xl text-primary-dark">What we believe</h2>
          </AnimateIn>
          <StaggerContainer className="grid md:grid-cols-2 gap-8" staggerDelay={0.12}>
            {values.map((v) => (
              <StaggerItem key={v.title}>
                <div className="p-7 rounded-2xl border border-cream-dark bg-cream hover:border-primary/25 hover:shadow-md hover:shadow-primary/5 transition-all duration-300">
                  <h3 className="font-semibold text-lg text-primary-dark mb-3">{v.title}</h3>
                  <p className="text-primary-warm leading-relaxed text-sm">{v.description}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* Team */}
      <section className="py-24 px-6 md:px-10 bg-cream">
        <div className="max-w-4xl mx-auto">
          <AnimateIn className="text-center mb-16">
            <h2 className="font-heading font-bold text-4xl text-primary-dark">The team</h2>
            <p className="mt-4 text-primary-warm">Small team, deep focus.</p>
          </AnimateIn>
          <StaggerContainer className="grid md:grid-cols-3 gap-8" staggerDelay={0.12}>
            {team.map((member) => (
              <StaggerItem key={member.role}>
                <div className="text-center p-6 rounded-2xl border border-cream-dark bg-cream-light">
                  <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/15 flex items-center justify-center text-lg font-bold text-primary mx-auto mb-4">
                    {member.initials}
                  </div>
                  <p className="font-semibold text-primary-dark mb-2">{member.role}</p>
                  <p className="text-sm text-primary-warm leading-relaxed">{member.description}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 md:px-10 bg-primary-dark text-center">
        <AnimateIn>
          <h2 className="font-heading font-bold text-4xl text-cream-light mb-6">
            Want to work with us?
          </h2>
          <p className="text-cream/60 mb-10 text-lg">
            We hire builders who care about Africa.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-cream-light text-primary px-10 py-4 rounded-full font-medium text-lg hover:bg-cream transition-colors"
          >
            Get in touch
          </Link>
        </AnimateIn>
      </section>
    </main>
  );
}
