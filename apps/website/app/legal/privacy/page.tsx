import type { Metadata } from 'next';
import Link from 'next/link';
import { AnimateIn } from '../../../components/AnimateIn';

export const metadata: Metadata = {
  title: 'Privacy Policy — Milu',
  description: 'How Milu collects, uses, and protects your data.',
};

const sections = [
  {
    title: '1. Who we are',
    content: `Milu Technologies ("Milu", "we", "us", "our") operates the Milu platform — an AI voice customer service product for businesses. Our registered address is Lagos, Nigeria. For privacy-related inquiries, contact us at privacy@miluai.app.`,
  },
  {
    title: '2. Information we collect',
    content: `We collect information in two ways:

**Information you provide directly**
- Account registration details: name, email address, business name, phone number.
- Knowledge base content: FAQs, operating hours, and business information you upload.
- Payment information (processed by our payment provider — we do not store card details).
- Communications you send us via email, WhatsApp, or contact forms.

**Information collected automatically**
- Call data: recordings, transcripts, caller phone numbers, call duration, and timestamps.
- Usage data: dashboard interactions, feature usage, login events.
- Device and browser information: IP address, browser type, operating system.
- Cookies and similar tracking technologies (see Section 7).`,
  },
  {
    title: '3. How we use your information',
    content: `We use the information we collect to:

- Provide, operate, and improve the Milu platform.
- Process and route inbound calls through our AI voice pipeline.
- Generate transcripts, analytics, and escalation summaries.
- Send WhatsApp and email notifications related to your account and calls.
- Respond to support requests and communications.
- Detect, investigate, and prevent fraud and abuse.
- Comply with legal obligations.

We do not use your data to train third-party AI models. Call transcripts and knowledge base content are used solely to operate your agent.`,
  },
  {
    title: '4. How we share your information',
    content: `We do not sell your personal data. We share it only with:

**Service providers** — third parties that help us deliver our service, including:
- Anthropic (Claude LLM for AI responses)
- Deepgram (speech-to-text transcription)
- ElevenLabs (text-to-speech synthesis)
- Africa's Talking (telephony infrastructure)
- Railway (cloud hosting)
- SendGrid (email delivery)

All service providers are contractually required to protect your data and use it only as instructed.

**Legal requirements** — we may disclose information when required by law, court order, or to protect the rights and safety of Milu, our users, or the public.

**Business transfers** — in the event of a merger, acquisition, or asset sale, your data may be transferred as a business asset. We will notify you before this occurs.`,
  },
  {
    title: '5. Data retention',
    content: `We retain your data for as long as your account is active or as needed to provide our services.

- Call recordings: retained for 90 days by default. Configurable per account on Growth and Enterprise plans.
- Transcripts and escalation logs: retained for 12 months, then archived.
- Account data: retained until account deletion plus 30 days.

You may request deletion of your data at any time by emailing privacy@miluai.app.`,
  },
  {
    title: '6. Your rights',
    content: `Depending on your location, you may have the right to:

- **Access** — request a copy of the personal data we hold about you.
- **Correction** — request correction of inaccurate data.
- **Deletion** — request deletion of your personal data.
- **Portability** — request your data in a machine-readable format.
- **Objection** — object to certain types of processing.
- **Restriction** — request that we restrict processing of your data.

To exercise any of these rights, email privacy@miluai.app. We will respond within 30 days.`,
  },
  {
    title: '7. Cookies',
    content: `We use essential cookies to operate the dashboard (authentication, session management) and analytics cookies to understand how users interact with our platform.

You can control cookies through your browser settings. Disabling cookies may affect dashboard functionality.`,
  },
  {
    title: '8. Data security',
    content: `We implement industry-standard security measures including:
- TLS encryption for all data in transit.
- AES-256 encryption for data at rest.
- Access controls and audit logs for internal data access.
- Regular security reviews and penetration testing.

No method of transmission over the internet is 100% secure. We cannot guarantee absolute security, but we take our obligations seriously.`,
  },
  {
    title: '9. International transfers',
    content: `Milu operates primarily in Africa. Some of our service providers are located outside Africa and may process data in the United States or Europe. We ensure appropriate safeguards are in place for these transfers in compliance with applicable law.`,
  },
  {
    title: '10. Children',
    content: `Milu is a business-to-business service. We do not knowingly collect personal data from individuals under the age of 18. If you believe a minor has provided us with personal data, please contact privacy@miluai.app.`,
  },
  {
    title: '11. Changes to this policy',
    content: `We may update this Privacy Policy from time to time. We will notify you of material changes by email or via an in-dashboard notice at least 14 days before the change takes effect. Continued use of Milu after the effective date constitutes acceptance of the updated policy.`,
  },
  {
    title: '12. Contact',
    content: `For privacy-related questions or to exercise your rights:

Email: privacy@miluai.app
Address: Milu Technologies, Lagos, Nigeria`,
  },
];

export default function PrivacyPage() {
  return (
    <main className="pt-24">
      <section className="py-20 px-6 md:px-10 bg-cream">
        <AnimateIn className="max-w-3xl mx-auto">
          <Link href="/legal/terms" className="text-sm text-primary-warm hover:text-primary transition-colors mb-8 inline-flex items-center gap-1.5">
            Also read: <span className="underline">Terms of Service</span>
          </Link>
          <p className="text-sm font-medium text-primary-warm uppercase tracking-widest mb-4">Legal</p>
          <h1 className="font-heading font-bold text-5xl text-primary-dark mb-4">Privacy Policy</h1>
          <p className="text-primary-warm">Last updated: 1 April 2026</p>
        </AnimateIn>
      </section>

      <section className="py-16 px-6 md:px-10 bg-cream-light">
        <div className="max-w-3xl mx-auto space-y-10">
          {sections.map((s, i) => (
            <AnimateIn key={s.title} delay={i * 0.03}>
              <div className="bg-cream border border-cream-dark rounded-2xl p-7">
                <h2 className="font-heading font-semibold text-xl text-primary-dark mb-4">{s.title}</h2>
                <div className="text-sm text-primary-warm leading-relaxed whitespace-pre-line">
                  {s.content.split('\n').map((line, j) => {
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <p key={j} className="font-semibold text-primary-dark mt-4 mb-1">{line.replace(/\*\*/g, '')}</p>;
                    }
                    if (line.startsWith('- ')) {
                      return <p key={j} className="flex gap-2 mt-1"><span className="text-cream-dark">—</span>{line.slice(2)}</p>;
                    }
                    if (line === '') return <div key={j} className="h-2" />;
                    return <p key={j}>{line}</p>;
                  })}
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>
      </section>
    </main>
  );
}
