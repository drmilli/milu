import { AnimateIn, StaggerContainer, StaggerItem } from '../AnimateIn';
import { Counter } from '../Counter';

const stats = [
  {
    value: <Counter to={1.5} decimals={1} prefix="< " suffix="s" />,
    label: 'Average response time on every call',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
  {
    value: <Counter to={24} suffix="/7" />,
    label: 'Always on — nights, weekends, holidays',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M12 7.5v4.5l3 1.5" />
    ),
  },
  {
    value: <Counter to={40} prefix="+" suffix="%" />,
    label: 'Fewer missed calls in the first month',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    ),
  },
  {
    value: <Counter to={90} suffix="%" />,
    label: 'Of routine calls resolved without you',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
];

export function Stats() {
  return (
    <section className="py-24 sm:py-28 mx-auto max-w-7xl px-6 md:px-10">
      <AnimateIn className="mb-14 text-center">
        <span className="inline-flex items-center gap-2 glass-chip text-primary text-xs font-medium tracking-widest uppercase px-3 py-1.5 rounded-full shadow-sm mb-6">
          Results that show up fast
        </span>
        <h2 className="font-heading font-bold text-3xl sm:text-4xl lg:text-5xl leading-[1.1] text-primary-dark tracking-tight max-w-3xl mx-auto">
          The difference callers feel from day one
        </h2>
        <p className="text-base sm:text-lg text-primary-warm max-w-2xl mx-auto mt-6 leading-relaxed">
          Milu carries the routine calls so your team can focus on the customers in front of them.
        </p>
      </AnimateIn>

      <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6" staggerDelay={0.1}>
        {stats.map((s, i) => (
          <StaggerItem key={i}>
            <div className="glass-panel rounded-[28px] p-6 sm:p-8 flex flex-col justify-between h-full hover:-translate-y-1.5 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-white/70 border border-white/70 flex items-center justify-center mb-8 shadow-sm group-hover:scale-110 transition-transform duration-300 text-warning">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>{s.icon}</svg>
              </div>
              <div>
                <div className="font-heading font-bold text-4xl sm:text-5xl text-primary mb-2">{s.value}</div>
                <div className="text-sm text-primary-warm leading-relaxed">{s.label}</div>
              </div>
            </div>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}
