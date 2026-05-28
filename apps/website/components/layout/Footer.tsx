import Link from 'next/link';
import Image from 'next/image';

const links = {
  Product: [
    { href: '/features', label: 'Features' },
    { href: '/pricing', label: 'Pricing' },
  ],
  Company: [
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ],
  Legal: [
    { href: '/legal/privacy', label: 'Privacy' },
    { href: '/legal/terms', label: 'Terms' },
  ],
};

export function Footer() {
  return (
    <footer className="bg-primary-dark text-cream-light">
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="inline-block mb-4" aria-label="Milu home">
              <Image src="/brand/wordmark.svg" alt="milu." width={80} height={28} className="h-7 w-auto" />
            </Link>
            <p className="text-cream/50 text-sm leading-relaxed max-w-xs">
              AI voice customer service for businesses. Every call answered, every customer kept.
            </p>
          </div>

          {/* Links */}
          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <p className="font-semibold text-sm text-cream/80 mb-4">{group}</p>
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-cream/40 hover:text-cream/80 transition-colors duration-200"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-8 border-t border-cream/8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-cream/30">
          <p>© 2026 Milu Technologies. Built in Nigeria, for Africa &amp; the UAE.</p>
          <p>dev@miluai.app</p>
        </div>
      </div>
    </footer>
  );
}
