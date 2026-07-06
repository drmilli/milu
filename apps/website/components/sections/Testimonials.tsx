import { AnimateIn, StaggerContainer, StaggerItem } from '../AnimateIn';

const testimonials = [
  {
    quote: "We used to miss 40% of calls during peak hours. Milu handles everything now — our customers don't even know it's an AI.",
    name: 'Amaka O.',
    title: 'Owner, QuickDelivery NG',
    initials: 'AO',
  },
  {
    quote: "Setup took 20 minutes. I added our FAQs, connected our number, and Milu was live. The WhatsApp summaries are incredibly useful.",
    name: 'Tunde B.',
    title: 'Operations, FreshMart Lagos',
    initials: 'TB',
  },
  {
    quote: "The booking feature alone has saved us 3 hours a day. Customers book directly through the call now.",
    name: 'Ngozi K.',
    title: 'Founder, BeautyFirst Abuja',
    initials: 'NK',
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5 mb-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className="w-4 h-4 text-warning" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="relative py-28 px-6 md:px-10">
      <div className="max-w-6xl mx-auto">
        <AnimateIn className="text-center mb-16">
          <span className="inline-flex items-center gap-2 glass-chip text-primary text-xs font-medium tracking-widest uppercase px-3 py-1.5 rounded-full shadow-sm mb-6">
            Loved by operators
          </span>
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-primary-dark tracking-tight">
            Trusted by businesses across Africa &amp; the UAE
          </h2>
        </AnimateIn>

        <StaggerContainer className="grid md:grid-cols-3 gap-6" staggerDelay={0.12}>
          {testimonials.map((t) => (
            <StaggerItem key={t.name}>
              <div className="glass-card rounded-3xl p-7 h-full flex flex-col hover:-translate-y-1.5 transition-all duration-300">
                <Stars />
                <p className="text-primary leading-relaxed mb-6 flex-1 text-sm">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-primary-dark text-sm">{t.name}</p>
                    <p className="text-primary-warm text-xs">{t.title}</p>
                  </div>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
