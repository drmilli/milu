import { AnimateIn } from '../AnimateIn';
import { dashboardUrl } from '../../lib/config';

const steps = [
  {
    number: '01',
    title: 'Customer calls your number',
    description: 'Your existing business number — or a new one we provision through our telecom partners. No new hardware, no SIP.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    ),
  },
  {
    number: '02',
    title: 'Milu answers instantly',
    description: 'The AI greets callers, answers questions from your knowledge base, and books appointments — in real time, 24/7.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
    ),
  },
  {
    number: '03',
    title: 'You review and improve',
    description: 'Every call is transcribed. Review conversations, update your knowledge base, and track performance from one dashboard.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="max-w-7xl px-6 md:px-10 mt-24 mx-auto">
      <AnimateIn>
        <div className="glass-panel overflow-hidden rounded-[32px]">
          <div className="flex flex-wrap items-end justify-between gap-6 p-8 sm:p-10 border-b border-white/50 bg-white/20">
            <div>
              <p className="text-xs uppercase text-primary-warm font-medium tracking-widest mb-3">Simple as that</p>
              <h2 className="font-heading font-bold text-3xl sm:text-4xl text-primary-dark tracking-tight">Three steps to never miss a call again</h2>
            </div>
            <a href={`${dashboardUrl}/register`} className="hidden sm:inline-flex items-center justify-center h-11 px-5 rounded-2xl text-sm font-medium text-cream-light bg-primary hover:bg-primary-dark transition shadow-sm">
              Get started free
            </a>
          </div>

          {steps.map((step, i) => (
            <div
              key={step.number}
              className={`p-8 sm:p-10 hover:bg-white/30 transition-colors duration-500 relative group ${
                i < steps.length - 1 ? 'border-b border-white/50' : ''
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center relative z-10">
                <div className="md:col-span-1">
                  <div className="font-heading font-bold text-4xl sm:text-5xl text-primary/25 tabular-nums group-hover:text-primary group-hover:-translate-y-1 transition-all duration-500">
                    {step.number}
                  </div>
                </div>
                <div className="md:col-span-8">
                  <h3 className="text-lg sm:text-xl font-semibold text-primary-dark mb-2">{step.title}</h3>
                  <p className="text-sm text-primary-warm leading-relaxed max-w-xl">{step.description}</p>
                </div>
                <div className="md:col-span-3 md:text-right hidden md:block">
                  <div className="w-16 h-16 ml-auto rounded-full glass-chip flex items-center justify-center text-primary shadow-sm group-hover:scale-110 transition-transform duration-500">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>{step.icon}</svg>
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-8 sm:p-10 border-t border-white/50 bg-white/20">
            <p className="text-sm text-primary-warm font-medium">Start today and hear the difference on your very first call.</p>
            <a href={`${dashboardUrl}/register`} className="inline-flex items-center justify-center h-12 px-6 rounded-2xl text-sm font-medium text-cream-light bg-gradient-to-r from-primary-warm to-primary hover:-translate-y-0.5 transition-transform duration-300 shadow-[0_8px_20px_rgba(92,61,46,0.28)]">
              Start free trial · 10 days
            </a>
          </div>
        </div>
      </AnimateIn>
    </section>
  );
}
