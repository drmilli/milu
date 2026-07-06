import { AnimateIn } from '../AnimateIn';
import { dashboardUrl } from '../../lib/config';

const turns = [
  { who: 'caller', text: 'Hello, are you open on Sunday?' },
  { who: 'agent', text: 'Good afternoon! Yes, we’re open Sundays from 10am to 4pm. Would you like to book a slot while I have you?' },
  { who: 'caller', text: 'Yes, 11am works.' },
  { who: 'agent', text: 'Done — you’re booked for Sunday at 11am. I’ve sent a confirmation to your WhatsApp. Anything else?' },
];

export function Showcase() {
  return (
    <section id="showcase" className="relative w-full mx-auto max-w-7xl px-6 md:px-10 mt-20">
      <AnimateIn>
        <div className="glass-panel rounded-[32px] p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[36rem] h-[36rem] warm-glow-a blur-3xl rounded-full -z-10" />

          <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-12 lg:gap-16">
            {/* Phone / call mockup */}
            <div className="lg:col-span-6 order-2 lg:order-1">
              <div className="relative mx-auto w-full max-w-[360px] hover:-translate-y-1.5 transition-transform duration-500">
                <div className="rounded-[32px] bg-white/30 border border-white/60 p-2.5 shadow-2xl backdrop-blur-2xl">
                  <div className="relative overflow-hidden rounded-[24px] bg-cream-light/80 border border-white/50">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-white/60 bg-white/60 backdrop-blur-md">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-primary-warm flex items-center justify-center shadow-md text-cream-light">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary-dark leading-none">Milu Voice Agent</p>
                        <p className="text-xs text-primary-warm mt-1.5 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> On a call now</p>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-5 space-y-3.5 min-h-[420px] relative">
                      <div className="absolute inset-0 warm-glow-b opacity-40 -z-10" />
                      {turns.map((t, i) => (
                        <div
                          key={i}
                          className={
                            t.who === 'caller'
                              ? 'bg-white/80 border border-white/60 text-primary text-sm px-3.5 py-2.5 rounded-r-[18px] rounded-tl-[18px] max-w-[85%] shadow-sm'
                              : 'bg-gradient-to-r from-primary-warm to-primary text-cream-light text-sm px-3.5 py-2.5 rounded-l-[18px] rounded-tr-[18px] max-w-[88%] ml-auto shadow-md'
                          }
                        >
                          {t.text}
                        </div>
                      ))}
                      <div className="mx-auto glass-chip w-max px-4 py-2 rounded-full text-xs font-medium text-primary shadow-sm flex items-center gap-2 mt-2">
                        <svg className="w-4 h-4 text-success" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 14.414l-4.707-4.707 1.414-1.414L11 13.586l6.293-6.293 1.414 1.414L11 16.414z" /></svg>
                        Appointment booked
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Copy + before/after */}
            <div className="lg:col-span-6 order-1 lg:order-2">
              <span className="inline-flex items-center gap-2 glass-chip text-primary text-xs font-medium tracking-widest uppercase px-3 py-1.5 rounded-full shadow-sm mb-4">
                Meet Milu
              </span>
              <h2 className="font-heading font-bold text-3xl md:text-4xl lg:text-[44px] leading-[1.15] text-primary-dark tracking-tight">
                A voice agent that sounds like your best receptionist
              </h2>
              <p className="text-primary-warm text-base mt-5 leading-relaxed">
                Milu picks up on the first ring, answers in your customer&rsquo;s language, and handles the whole
                conversation — from questions to bookings — then hands you a clean summary.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/30 border border-white/40">
                  <div className="w-10 h-10 rounded-2xl glass-chip text-primary-warm flex items-center justify-center shrink-0 shadow-sm">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary-dark">Without Milu</p>
                    <p className="text-sm text-primary-warm mt-1 leading-relaxed">The phone rings out, the caller hangs up, and you never even know they tried to reach you.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-2xl glass-card shadow-[0_8px_20px_rgba(92,61,46,0.06)] hover:-translate-y-0.5 transition-all duration-300">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary-warm to-primary text-cream-light flex items-center justify-center shrink-0 shadow-md">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-primary-dark">With Milu</p>
                    <p className="text-sm text-primary-warm mt-1 leading-relaxed">Every call answered instantly, the customer booked, and the details already in your dashboard.</p>
                  </div>
                </div>
              </div>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                <a href={`${dashboardUrl}/register`} className="inline-flex items-center justify-center h-12 px-6 rounded-2xl text-sm font-medium text-cream-light bg-primary hover:bg-primary-dark transition shadow-[0_8px_20px_rgba(92,61,46,0.28)] hover:-translate-y-0.5">
                  Put Milu on my line
                </a>
                <a href="/features" className="inline-flex items-center justify-center h-12 px-6 rounded-2xl text-sm font-medium text-primary glass-chip hover:bg-white/80 transition shadow-sm hover:-translate-y-0.5">
                  Explore features
                </a>
              </div>
            </div>
          </div>
        </div>
      </AnimateIn>
    </section>
  );
}
