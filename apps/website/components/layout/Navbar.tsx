'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const links = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3000';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? 'glass-header shadow-sm shadow-primary/5' : 'bg-transparent'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" aria-label="Milu home">
            <img src="/brand/wordmark-dark.svg" alt="milu." className="h-7 w-auto" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-primary-warm hover:text-primary-dark transition-colors duration-200"
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href={`${dashboardUrl}/login`}
              className="text-sm text-primary hover:text-primary-dark transition-colors"
            >
              Log in
            </a>
            <a
              href={`${dashboardUrl}/register`}
              className="bg-primary text-cream-light text-sm px-5 py-2.5 rounded-2xl hover:bg-primary-dark hover:-translate-y-0.5 transition-all duration-300 shadow-[0_8px_20px_rgba(92,61,46,0.25)]"
            >
              Get Started
            </a>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden flex flex-col gap-1.5 p-1"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <motion.span
              animate={mobileOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
              className="block w-5 h-0.5 bg-primary-dark origin-center transition-all"
            />
            <motion.span
              animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
              className="block w-5 h-0.5 bg-primary-dark"
            />
            <motion.span
              animate={mobileOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
              className="block w-5 h-0.5 bg-primary-dark origin-center transition-all"
            />
          </button>
        </div>
      </motion.nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="fixed top-16 left-0 right-0 z-40 bg-cream-light border-b border-cream-dark shadow-lg px-6 py-6 flex flex-col gap-4"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="text-primary text-base py-1"
              >
                {l.label}
              </Link>
            ))}
            <a
              href={`${dashboardUrl}/register`}
              onClick={() => setMobileOpen(false)}
              className="mt-2 bg-primary text-cream-light text-sm px-5 py-3 rounded-full text-center"
            >
              Get Started
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
