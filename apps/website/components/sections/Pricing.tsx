import { AnimateIn, StaggerContainer, StaggerItem } from '../AnimateIn';
import { dashboardUrl } from '../../lib/config';

const plans = [
  {
    name: 'Starter',
    price: '$25',
    period: '/month',
    description: 'Perfect for small businesses getting started.',
    features: ['200 calls/month', 'FAQ & knowledge base', 'Appointment booking', 'Basic analytics', 'Email support'],
    cta: 'Start free trial',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$45',
    period: '/month',
    description: 'For growing businesses that need more reach.',
    features: ['500 calls/month', 'Full analytics & transcripts', 'WhatsApp notifications', 'Bulk WhatsApp broadcasts', 'Team members', 'Priority support'],
    cta: 'Start free trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For businesses that need the full CRM suite.',
    features: ['Unlimited calls', 'CRM & contacts pipeline', 'Sales follow-ups', 'Multiple businesses', 'Custom voice & branding', 'Dedicated support'],
    cta: 'Contact us',
    highlighted: false,
  },
];

export function Pricing() {
  return (
    <section className="py-28 px-6 md:px-10 bg-cream">
      <div className="max-w-5xl mx-auto">
        <AnimateIn className="text-center mb-20">
          <p className="text-sm font-medium text-primary-warm uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-primary-dark">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-primary-warm">10-day free trial on all plans. No credit card required.</p>
        </AnimateIn>

        <StaggerContainer className="grid md:grid-cols-3 gap-6 items-start" staggerDelay={0.12}>
          {plans.map((plan) => (
            <StaggerItem key={plan.name}>
              <div
                className={`relative rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 ${
                  plan.highlighted
                    ? 'bg-primary text-cream-light shadow-2xl shadow-primary/30 scale-105'
                    : 'bg-cream-light border border-cream-dark hover:shadow-lg hover:shadow-primary/8'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-warning text-primary-dark text-xs font-semibold px-3 py-1 rounded-full shadow-sm">
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
                  {plan.period && (
                    <span className={`text-sm mb-0.5 ${plan.highlighted ? 'text-cream/60' : 'text-primary-warm'}`}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className={`text-sm mb-6 ${plan.highlighted ? 'text-cream/70' : 'text-primary-warm'}`}>
                  {plan.description}
                </p>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className={`text-sm flex items-center gap-2.5 ${plan.highlighted ? 'text-cream/85' : 'text-primary-warm'}`}>
                      <svg className={`w-4 h-4 flex-shrink-0 ${plan.highlighted ? 'text-cream/60' : 'text-success'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href={plan.name === 'Enterprise' ? '/contact' : `${dashboardUrl}/register`}
                  className={`block text-center py-3.5 rounded-full text-sm font-medium transition-all duration-200 ${
                    plan.highlighted
                      ? 'bg-cream-light text-primary hover:bg-cream shadow-sm'
                      : 'bg-primary text-cream-light hover:bg-primary-dark hover:shadow-md'
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
