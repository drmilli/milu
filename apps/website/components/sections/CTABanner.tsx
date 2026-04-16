import { AnimateIn } from '../AnimateIn';
import { dashboardUrl } from '../../lib/config';

export function CTABanner() {
  return (
    <section className="py-28 px-6 md:px-10 bg-primary-dark relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 -z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary-warm/20 blur-3xl" />
      </div>

      <AnimateIn className="relative z-10 max-w-3xl mx-auto text-center">
        <p className="text-sm font-medium text-cream/50 uppercase tracking-widest mb-5">
          Get started today
        </p>
        <h2 className="font-heading font-bold text-4xl md:text-6xl text-cream-light mb-6 leading-tight">
          Start answering<br />every call today
        </h2>
        <p className="text-cream/60 text-lg mb-10">
          14-day free trial. No credit card required.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={`${dashboardUrl}/register`}
            className="bg-cream-light text-primary px-10 py-4 rounded-full font-medium text-lg hover:bg-cream transition-colors duration-200 shadow-lg shadow-black/20"
          >
            Get started for free
          </a>
          <a
            href="/contact"
            className="border border-cream/20 text-cream/80 px-10 py-4 rounded-full font-medium text-lg hover:border-cream/40 hover:text-cream transition-colors duration-200"
          >
            Talk to us
          </a>
        </div>
      </AnimateIn>
    </section>
  );
}
