import type { Metadata } from 'next';
import { AnimateIn, StaggerContainer, StaggerItem } from '../../components/AnimateIn';
import { dashboardUrl } from '../../lib/config';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing for African businesses. Start from ₦15,000/month. 14-day free trial, no credit card required.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Milu Pricing — Plans Starting at ₦15,000/month',
    description: 'Simple pricing for African businesses of all sizes. 10-day free trial, no credit card required.',
  },
};

const plans = [
  {
    name: 'Starter',
    price: '$25',
    originalPrice: '$65',
    period: '/month',
    description: 'Perfect for small businesses getting started with AI voice.',
    features: [
      '200 calls/month',
      'FAQ handling',
      'Call transcripts',
      'Basic analytics',
      'Email support',
    ],
    notIncluded: ['Appointment booking', 'WhatsApp escalation alerts', 'CRM webhooks'],
    cta: 'Start free trial',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$45',
    originalPrice: '$110',
    period: '/month',
    description: 'For growing businesses that need the full suite.',
    features: [
      '1,000 calls/month',
      'FAQ handling',
      'Appointment booking',
      'Smart escalation',
      'WhatsApp alerts',
      'Full analytics',
      'Call transcripts',
      'Priority support',
    ],
    notIncluded: ['CRM webhooks', 'Custom voice cloning'],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Tailored for large teams and complex operations.',
    features: [
      'Unlimited calls',
      'Everything in Growth',
      'Custom voice cloning',
      'CRM webhooks',
      'Outbound campaigns',
      'SLA guarantee',
      'Dedicated support',
      'On-prem option',
    ],
    notIncluded: [],
    cta: 'Contact us',
    highlighted: false,
  },
];

const faqs = [
  {
    q: 'What counts as a call?',
    a: 'Each inbound call handled by Milu counts as one call, regardless of duration. Calls transferred to a human still count.',
  },
  {
    q: 'Can I bring my existing number?',
    a: "Yes. You can link any number registered with Africa's Talking. If you don't have one yet, we'll provision one for you.",
  },
  {
    q: 'What happens when I exceed my call limit?',
    a: 'We notify you when you reach 80% of your monthly limit. You can upgrade anytime or purchase a top-up pack.',
  },
  {
    q: 'Is there a free trial?',
    a: 'All plans include a 14-day free trial. No credit card required to start.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. No contracts, no lock-in. Cancel from your dashboard at any time — your plan stays active until the end of the billing period.',
  },
  {
    q: 'Do you offer NGO or nonprofit pricing?',
    a: 'Yes. Contact us at dev@miluai.app with details about your organization.',
  },
];

export default function PricingPage() {
  return (
    <main className="pt-24">
      {/* Hero */}
      <section className="py-24 px-6 md:px-10 bg-cream text-center">
        <AnimateIn>
          <p className="text-sm font-medium text-primary-warm uppercase tracking-widest mb-4">Pricing</p>
          <h1 className="font-heading font-bold text-5xl md:text-6xl text-primary-dark mb-6">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-primary-warm max-w-xl mx-auto">
            14-day free trial on all plans. No credit card required.
          </p>
        </AnimateIn>
      </section>

      {/* Plans */}
      <section className="py-20 px-6 md:px-10 bg-cream-light">
        <div className="max-w-5xl mx-auto">
          <StaggerContainer className="grid md:grid-cols-3 gap-6 items-start" staggerDelay={0.12}>
            {plans.map((plan) => (
              <StaggerItem key={plan.name}>
                <div
                  className={`relative rounded-3xl p-8 transition-all duration-300 ${
                    plan.highlighted
                      ? 'bg-primary text-cream-light shadow-2xl shadow-primary/30 md:scale-105'
                      : 'bg-cream border border-cream-dark'
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-warning text-primary-dark text-xs font-semibold px-3 py-1 rounded-full shadow">
                        Most popular
                      </span>
                    </div>
                  )}

                  <p className={`font-semibold text-sm mb-1 ${plan.highlighted ? 'text-cream/60' : 'text-primary-warm'}`}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1 mb-2">
                    <p className={`font-heading font-bold text-4xl leading-none ${plan.highlighted ? 'text-cream-light' : 'text-primary-dark'}`}>
                      {plan.price}
                    </p>
                    {'originalPrice' in plan && plan.originalPrice ? (
                      <span className={`text-sm mb-0.5 line-through ${plan.highlighted ? 'text-cream/40' : 'text-cream-dark'}`}>
                        {plan.originalPrice}
                      </span>
                    ) : null}
                    {plan.period && (
                      <span className={`text-sm mb-0.5 ${plan.highlighted ? 'text-cream/60' : 'text-primary-warm'}`}>
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mb-6 ${plan.highlighted ? 'text-cream/70' : 'text-primary-warm'}`}>
                    {plan.description}
                  </p>

                  <ul className="space-y-2.5 mb-3">
                    {plan.features.map((f) => (
                      <li key={f} className={`text-sm flex items-center gap-2.5 ${plan.highlighted ? 'text-cream/85' : 'text-primary-warm'}`}>
                        <svg className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? 'text-cream/50' : 'text-success'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {plan.notIncluded.length > 0 && (
                    <ul className="space-y-2.5 mb-8 mt-2.5">
                      {plan.notIncluded.map((f) => (
                        <li key={f} className={`text-sm flex items-center gap-2.5 ${plan.highlighted ? 'text-cream/30' : 'text-cream-dark'}`}>
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-8">
                    <a
                      href={plan.name === 'Enterprise' ? '/contact' : `${dashboardUrl}/register`}
                      className={`block text-center py-3.5 rounded-full text-sm font-medium transition-all duration-200 ${
                        plan.highlighted
                          ? 'bg-cream-light text-primary hover:bg-cream'
                          : 'bg-primary text-cream-light hover:bg-primary-dark'
                      }`}
                    >
                      {plan.cta}
                    </a>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6 md:px-10 bg-cream">
        <div className="max-w-2xl mx-auto">
          <AnimateIn className="text-center mb-16">
            <h2 className="font-heading font-bold text-4xl text-primary-dark">
              Frequently asked questions
            </h2>
          </AnimateIn>
          <StaggerContainer className="space-y-5" staggerDelay={0.08}>
            {faqs.map((faq) => (
              <StaggerItem key={faq.q}>
                <div className="bg-cream-light border border-cream-dark rounded-2xl p-6">
                  <h3 className="font-semibold text-primary-dark mb-2">{faq.q}</h3>
                  <p className="text-sm text-primary-warm leading-relaxed">{faq.a}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>
    </main>
  );
}
