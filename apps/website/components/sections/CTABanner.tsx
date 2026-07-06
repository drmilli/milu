import { AnimateIn } from '../AnimateIn';
import { dashboardUrl } from '../../lib/config';

export function CTABanner() {
  return (
    <section className="px-6 md:px-10 mt-16 mb-24 max-w-5xl mx-auto">
      <AnimateIn>
        <div className="relative overflow-hidden rounded-[40px] bg-primary/90 backdrop-blur-2xl border border-white/15 p-10 sm:p-16 text-center shadow-[0_40px_80px_-20px_rgba(59,35,20,0.5)] group">
          {/* Ambient glow */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[420px] rounded-full warm-glow-a blur-3xl group-hover:scale-110 transition-transform duration-1000" />
          </div>

          <div className="relative z-10">
            <p className="text-sm font-medium text-cream/60 uppercase tracking-widest mb-5">
              Get started today
            </p>
            <h2 className="font-heading font-bold text-4xl md:text-6xl text-cream-light mb-6 leading-tight max-w-2xl mx-auto tracking-tight">
              Start answering every call today
            </h2>
            <p className="text-cream/70 text-base sm:text-lg mb-10 max-w-xl mx-auto">
              10-day free trial. No credit card required. Live on your number in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`${dashboardUrl}/register`}
                className="inline-flex items-center justify-center bg-cream-light text-primary px-10 py-4 rounded-2xl font-medium text-base hover:scale-105 transition-transform duration-300 shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
              >
                Get started for free
              </a>
              <a
                href="/contact"
                className="inline-flex items-center justify-center border border-cream/25 text-cream/85 px-10 py-4 rounded-2xl font-medium text-base hover:border-cream/50 hover:text-cream transition-colors duration-200"
              >
                Talk to us
              </a>
            </div>
          </div>
        </div>
      </AnimateIn>
    </section>
  );
}
