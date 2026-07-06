'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { dashboardUrl } from '../../lib/config';

const trust = [
  {
    label: 'Works on your number',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    ),
  },
  {
    label: 'Live in minutes',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
  {
    label: '24/7 multilingual',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    ),
  },
];

const floatingTags = ['Answers FAQs', 'Books appointments', 'WhatsApp summary'];

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center pt-16 overflow-hidden">
      {/* Ambient warm background */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-cream via-cream-light to-cream-light" />
        <div className="absolute -top-[15%] -right-[10%] w-[70vw] h-[70vw] rounded-full warm-glow-a blur-3xl animate-pulse-slow" />
        <div className="absolute top-[35%] -left-[10%] w-[50vw] h-[50vw] rounded-full warm-glow-b blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-10 w-full py-20 md:py-24">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Left — copy */}
          <div className="lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 glass-chip text-primary text-xs font-medium tracking-widest uppercase px-3 py-1.5 rounded-full mb-7 shadow-sm"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              Try for free now
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="font-heading font-bold text-4xl sm:text-5xl lg:text-[64px] leading-[1.05] text-primary-dark tracking-tight"
            >
              Every call answered.
              <br />
              <span className="gradient-text italic">Every customer kept.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="text-base sm:text-lg text-primary-warm max-w-xl mt-6 leading-relaxed"
            >
              Milu is an AI voice agent that answers your business calls 24/7 — handling FAQs,
              booking appointments, and escalating to you when it matters.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mt-8 flex flex-col sm:flex-row gap-4"
            >
              <a
                href={`${dashboardUrl}/register`}
                className="inline-flex items-center justify-center bg-primary text-cream-light px-7 py-3.5 rounded-2xl font-medium text-sm shadow-[0_8px_20px_rgba(92,61,46,0.28)] hover:bg-primary-dark hover:-translate-y-0.5 transition-all duration-300"
              >
                Start free trial
              </a>
              <Link
                href="/features"
                className="group inline-flex items-center justify-center gap-2 glass-chip text-primary px-7 py-3.5 rounded-2xl font-medium text-sm shadow-sm hover:bg-white/80 transition-all duration-300"
              >
                See how it works
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </motion.div>

            {/* Trust row */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-primary-warm"
            >
              {trust.map((t) => (
                <div key={t.label} className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full glass-chip flex items-center justify-center text-warning shadow-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>{t.icon}</svg>
                  </span>
                  <span>{t.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — live-call glass card + floating tags */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 lg:pl-8"
          >
            <div className="relative max-w-sm ml-auto">
              <div className="absolute -top-10 -right-8 w-40 h-40 warm-glow-a blur-3xl rounded-full -z-10" />

              <div className="glass-panel rounded-3xl p-6 relative z-10 hover:-translate-y-1.5 transition-transform duration-500">
                {/* Card header — live call */}
                <div className="flex items-center justify-between mb-5 border-b border-cream-dark/40 pb-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-primary-warm mb-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Live call · 00:42
                    </p>
                    <p className="text-lg font-heading font-bold text-primary-dark">Incoming — +234 · Lagos</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-warm to-primary flex items-center justify-center text-cream-light shadow-md">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                  </div>
                </div>

                {/* Transcript bubbles */}
                <div className="space-y-3">
                  <div className="max-w-[85%] bg-white/70 border border-white/60 text-primary text-sm px-3.5 py-2.5 rounded-r-2xl rounded-tl-2xl shadow-sm">
                    Hi, do you deliver to Lekki today?
                  </div>
                  <div className="max-w-[88%] ml-auto bg-gradient-to-r from-primary-warm to-primary text-cream-light text-sm px-3.5 py-2.5 rounded-l-2xl rounded-tr-2xl shadow-md">
                    Yes! We deliver to Lekki within 2 hours. Would you like to place an order or book a slot?
                  </div>
                  <div className="max-w-[70%] bg-white/70 border border-white/60 text-primary text-sm px-3.5 py-2.5 rounded-r-2xl rounded-tl-2xl shadow-sm">
                    Book me for 3pm please.
                  </div>
                </div>

                {/* Status pill */}
                <div className="mt-5 flex items-center gap-2 glass-chip w-max px-3 py-1.5 rounded-full text-xs font-medium text-primary shadow-sm">
                  <svg className="w-4 h-4 text-success" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 14.414l-4.707-4.707 1.414-1.414L11 13.586l6.293-6.293 1.414 1.414L11 16.414z" /></svg>
                  Appointment booked · summary sent to WhatsApp
                </div>
              </div>

              {/* Floating feature tags */}
              <div className="mt-5 flex flex-wrap justify-end gap-2 relative z-20">
                {floatingTags.map((tag, i) => (
                  <motion.span
                    key={tag}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.9 + i * 0.12 }}
                    className={`text-xs px-3.5 py-2 rounded-xl font-medium flex items-center gap-1.5 shadow-sm ${
                      i === floatingTags.length - 1
                        ? 'bg-gradient-to-r from-primary-warm to-primary text-cream-light'
                        : 'glass-chip text-primary-warm'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                    {tag}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-cream-light to-transparent pointer-events-none" />
    </section>
  );
}
