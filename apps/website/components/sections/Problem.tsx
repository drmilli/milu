import { AnimateIn } from '../AnimateIn';

const pains = [
  {
    title: 'Calls go unanswered',
    body: 'Peak hours, after close, public holidays — every missed call is a customer lost to the next business that picks up.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    ),
  },
  {
    title: 'Your team is stretched thin',
    body: 'Staff juggle walk-ins and a ringing phone at the same time. Callers wait on hold, get frustrated, and hang up.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0z" />
    ),
  },
  {
    title: 'No record of what was said',
    body: 'Promises made on the phone vanish into thin air. No transcript, no follow-up, no accountability, no way to improve.',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    ),
  },
];

export function Problem() {
  return (
    <section className="relative w-full mx-auto max-w-7xl px-6 md:px-10 mt-8">
      <AnimateIn>
        <div className="glass-panel rounded-[32px] p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 w-72 h-72 warm-glow-a blur-3xl rounded-full -z-10" />
          <div className="grid grid-cols-1 lg:grid-cols-12 items-center gap-12 lg:gap-16">
            <div className="lg:col-span-6">
              <span className="inline-flex items-center gap-2 glass-chip text-primary text-xs font-medium tracking-widest uppercase px-3 py-1.5 rounded-full shadow-sm">
                Sound familiar?
              </span>
              <h2 className="mt-6 font-heading font-bold text-3xl md:text-4xl lg:text-[44px] leading-[1.15] text-primary-dark tracking-tight">
                Missed calls cost more than you think
              </h2>
              <p className="text-primary-warm text-base mt-5 leading-relaxed max-w-lg">
                While your line rings out, customers simply move on to a competitor who answers.
              </p>

              <div className="h-px bg-gradient-to-r from-primary/20 to-transparent mt-8 mb-8 w-full max-w-md" />

              <div className="space-y-7">
                {pains.map((p) => (
                  <div key={p.title} className="flex gap-4 group">
                    <div className="w-12 h-12 rounded-2xl glass-chip flex items-center justify-center shrink-0 text-primary shadow-sm group-hover:scale-105 transition-transform duration-300">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>{p.icon}</svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-primary-dark">{p.title}</h3>
                      <p className="text-primary-warm text-sm mt-1.5 leading-relaxed">{p.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — stat tiles */}
            <div className="lg:col-span-6">
              <div className="grid grid-cols-2 gap-4 sm:gap-5">
                <div className="glass-card rounded-3xl p-6 flex flex-col justify-between h-44 hover:-translate-y-1 transition-transform duration-500">
                  <span className="w-10 h-10 rounded-2xl bg-primary/8 flex items-center justify-center text-warning">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
                  </span>
                  <div>
                    <p className="font-heading font-bold text-3xl text-primary-dark">40%</p>
                    <p className="text-xs text-primary-warm mt-1 leading-snug">of calls missed at peak hours</p>
                  </div>
                </div>
                <div className="glass-card rounded-3xl p-6 flex flex-col justify-between h-44 mt-6 hover:-translate-y-1 transition-transform duration-500">
                  <span className="w-10 h-10 rounded-2xl bg-primary/8 flex items-center justify-center text-warning">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m3-3.75V18m-6-6v6m-3-3v3M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" /></svg>
                  </span>
                  <div>
                    <p className="font-heading font-bold text-3xl text-primary-dark">85%</p>
                    <p className="text-xs text-primary-warm mt-1 leading-snug">of callers won&rsquo;t leave a voicemail</p>
                  </div>
                </div>
                <div className="glass-card rounded-3xl p-6 flex flex-col justify-between h-44 -mt-2 hover:-translate-y-1 transition-transform duration-500">
                  <span className="w-10 h-10 rounded-2xl bg-primary/8 flex items-center justify-center text-warning">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64M18 21V9.349M3.75 21V9.349m0 0a3.001 3.001 0 003.75-.615 3 3 0 004.5 0 3 3 0 004.5 0 3.001 3.001 0 003.75.615m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72" /></svg>
                  </span>
                  <div>
                    <p className="font-heading font-bold text-3xl text-primary-dark">62%</p>
                    <p className="text-xs text-primary-warm mt-1 leading-snug">try a competitor instead</p>
                  </div>
                </div>
                <div className="glass-card rounded-3xl p-6 flex flex-col justify-between h-44 mt-4 bg-gradient-to-br from-primary-warm/90 to-primary/90 hover:-translate-y-1 transition-transform duration-500">
                  <span className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-cream-light">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </span>
                  <div>
                    <p className="font-heading font-bold text-3xl text-cream-light">0</p>
                    <p className="text-xs text-cream/80 mt-1 leading-snug">missed with Milu answering</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimateIn>
    </section>
  );
}
