'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { dashboardUrl } from '../../lib/config';

const stats = [
  { value: '< 1.5s', label: 'response time' },
  { value: '24/7', label: 'availability' },
  { value: '40%+', label: 'fewer missed calls' },
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center pt-16 overflow-hidden">
      {/* Background gradient blobs */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-0 left-0 right-0 h-full bg-gradient-to-b from-cream via-cream-light to-cream-light" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-warning/8 blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-6 md:px-10 py-24 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="inline-flex items-center gap-2 bg-primary/8 border border-primary/15 text-primary text-sm px-4 py-1.5 rounded-full mb-10"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          Now live — Africa's Talking integration
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="font-heading font-bold text-5xl sm:text-6xl md:text-[82px] leading-[1.05] text-primary-dark mb-6 tracking-tight"
        >
          Every call answered.
          <br />
          <span className="gradient-text italic">Every customer kept.</span>
        </motion.h1>

        {/* Subheading */}
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="text-lg md:text-xl text-primary-warm max-w-2xl mx-auto mb-12 leading-relaxed"
        >
          Milu is an AI voice agent that answers your business calls 24/7 — handling FAQs,
          booking appointments, and escalating to you when it matters.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mb-20"
        >
          <a
            href={`${dashboardUrl}/register`}
            className="group relative bg-primary text-cream-light px-8 py-4 rounded-full font-medium text-lg overflow-hidden transition-all duration-300 hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5"
          >
            Start free trial
          </a>
          <Link
            href="/features"
            className="group flex items-center justify-center gap-2 border border-primary/30 text-primary px-8 py-4 rounded-full font-medium text-lg hover:bg-cream-dark/60 hover:border-primary/50 transition-all duration-200"
          >
            See how it works
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="flex flex-wrap justify-center gap-8 md:gap-16"
        >
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.75 + i * 0.1 }}
              className="text-center"
            >
              <p className="font-heading font-bold text-3xl text-primary-dark">{s.value}</p>
              <p className="text-sm text-primary-warm mt-0.5">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-cream-light to-transparent pointer-events-none" />
    </section>
  );
}
