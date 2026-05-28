import { AnimateIn, StaggerContainer, StaggerItem } from '../AnimateIn';

const steps = [
  {
    number: '01',
    title: 'Customer calls your number',
    description: 'Your existing business number — or a new one we provision through our telecom partners.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Milu answers instantly',
    description: 'The AI greets callers, answers questions from your knowledge base, and books appointments — in real time.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'You review and improve',
    description: 'Every call is transcribed. Review conversations, update your knowledge base, track performance.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section className="py-28 px-6 md:px-10 bg-cream">
      <div className="max-w-5xl mx-auto">
        <AnimateIn className="text-center mb-20">
          <p className="text-sm font-medium text-primary-warm uppercase tracking-widest mb-3">How it works</p>
          <h2 className="font-heading font-bold text-4xl md:text-5xl text-primary-dark">
            Three steps to never<br />miss a call again
          </h2>
        </AnimateIn>

        <StaggerContainer className="relative grid md:grid-cols-3 gap-10" staggerDelay={0.15}>
          {/* Connector line — desktop only */}
          <div className="hidden md:block absolute top-10 left-[calc(16.5%+1rem)] right-[calc(16.5%+1rem)] h-px bg-gradient-to-r from-cream-dark via-primary/20 to-cream-dark" />

          {steps.map((step) => (
            <StaggerItem key={step.number}>
              <div className="relative flex flex-col items-center text-center group">
                {/* Icon circle */}
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-full bg-cream-light border-2 border-cream-dark group-hover:border-primary/40 transition-colors duration-300 flex items-center justify-center shadow-sm">
                    <span className="text-primary">{step.icon}</span>
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-cream-light text-xs font-bold flex items-center justify-center">
                    {step.number.replace('0', '')}
                  </span>
                </div>

                <h3 className="font-semibold text-lg text-primary-dark mb-3">{step.title}</h3>
                <p className="text-primary-warm leading-relaxed text-sm">{step.description}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
