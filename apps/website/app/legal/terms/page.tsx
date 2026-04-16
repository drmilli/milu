import type { Metadata } from 'next';
import Link from 'next/link';
import { AnimateIn } from '../../../components/AnimateIn';

export const metadata: Metadata = {
  title: 'Terms of Service — Milu',
  description: 'The terms that govern your use of the Milu platform.',
};

const sections = [
  {
    title: '1. Acceptance of terms',
    content: `By creating a Milu account or using any part of our service, you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use Milu.

These Terms form a binding legal agreement between you ("you", "your", "Customer") and Milu Technologies ("Milu", "we", "us").`,
  },
  {
    title: '2. Description of service',
    content: `Milu provides an AI-powered voice agent platform that allows businesses to handle inbound phone calls using automated speech recognition, large language models, and text-to-speech synthesis. Features include FAQ handling, appointment booking, call escalation, transcription, and analytics.

Service availability is provided on a commercially reasonable basis. We target 99.5% monthly uptime but do not guarantee uninterrupted service.`,
  },
  {
    title: '3. Account registration',
    content: `To use Milu you must:
- Be at least 18 years old.
- Provide accurate and complete registration information.
- Maintain the security of your account credentials.
- Notify us immediately of any unauthorized account access.

You are responsible for all activity that occurs under your account. One account may be used per business entity. Multiple accounts for the same business require prior written approval.`,
  },
  {
    title: '4. Acceptable use',
    content: `You agree not to use Milu to:

- Conduct, facilitate, or promote illegal activity.
- Harass, threaten, or deceive callers.
- Impersonate a government agency, law enforcement, or emergency service.
- Collect sensitive caller data (financial details, health information, passwords) without explicit caller consent and appropriate legal basis.
- Transmit malware, spam, or unauthorized automated messages.
- Reverse-engineer, decompile, or attempt to extract source code from Milu.
- Resell or sublicense Milu without our written permission.
- Exceed usage limits in a manner that disrupts service for other users.

We reserve the right to suspend or terminate accounts that violate these rules without prior notice.`,
  },
  {
    title: '5. Subscription and billing',
    content: `**Plans and pricing**
Milu is offered on monthly subscription plans as described on the Pricing page. Prices are in Nigerian Naira (₦) unless otherwise stated.

**Billing cycle**
Subscriptions are billed monthly in advance on the date of first payment.

**Free trial**
New accounts receive a 14-day free trial. No credit card is required to start. At the end of the trial, you must select a paid plan to continue using Milu.

**Overages**
If you exceed your plan's monthly call limit, we will notify you. Additional calls may be purchased as top-up packs. We will not cut off your service mid-month without notice.

**Cancellation**
You may cancel at any time from your dashboard. Your plan remains active until the end of the current billing period. We do not provide refunds for unused periods.

**Changes to pricing**
We will notify you at least 30 days before any price increase. Continued use after the effective date constitutes acceptance.`,
  },
  {
    title: '6. Intellectual property',
    content: `**Our IP**
Milu, its software, design, branding, and documentation are owned by Milu Technologies and protected by copyright and trademark law. You may not copy, modify, or distribute them without written permission.

**Your IP**
You retain all rights to your business content — your knowledge base, brand, and business information. By uploading content to Milu, you grant us a limited license to process it solely for the purpose of operating your AI agent.

**Call data**
Recordings and transcripts generated from your callers belong to you. We process this data as a data processor under your instruction.`,
  },
  {
    title: '7. Privacy and data protection',
    content: `Our collection and use of personal data is described in our Privacy Policy, which is incorporated into these Terms by reference.

As a business using Milu, you are a data controller for your callers' data. You are responsible for ensuring you have a lawful basis to record and process calls under applicable law (including NDPR in Nigeria).

We act as a data processor and will process caller data only as instructed by you and as described in our Privacy Policy.`,
  },
  {
    title: '8. Disclaimers',
    content: `Milu is provided "as is" without warranty of any kind. We do not warrant that:
- The service will be uninterrupted, error-free, or completely secure.
- The AI will always provide accurate or appropriate responses.
- The service will meet your specific business requirements.

You are responsible for reviewing AI responses and ensuring your knowledge base is accurate and up to date.`,
  },
  {
    title: '9. Limitation of liability',
    content: `To the maximum extent permitted by applicable law, Milu's total liability to you for any claim arising from these Terms or your use of the service shall not exceed the amount you paid to Milu in the three months preceding the claim.

We are not liable for: indirect, incidental, or consequential damages; loss of revenue, profits, or business opportunities; or any damages arising from third-party telephony or AI service failures.`,
  },
  {
    title: '10. Indemnification',
    content: `You agree to indemnify and hold harmless Milu Technologies, its officers, employees, and partners from any claims, damages, or expenses (including legal fees) arising from:
- Your use of the service.
- Your violation of these Terms.
- Your violation of any third party's rights.
- Content you upload to Milu.`,
  },
  {
    title: '11. Termination',
    content: `Either party may terminate these Terms at any time.

You may terminate by cancelling your account in the dashboard.

We may terminate or suspend your account immediately if you breach these Terms, engage in fraudulent activity, or fail to pay fees when due. We will provide notice where reasonably practicable.

On termination, your access to the service ceases. You may request an export of your data within 30 days of termination.`,
  },
  {
    title: '12. Governing law',
    content: `These Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be resolved by the courts of Lagos State, Nigeria, unless both parties agree to alternative dispute resolution.`,
  },
  {
    title: '13. Changes to these terms',
    content: `We may update these Terms from time to time. We will notify you of material changes by email at least 14 days before they take effect. Continued use of Milu after the effective date constitutes acceptance of the updated Terms.`,
  },
  {
    title: '14. Contact',
    content: `For questions about these Terms:

Email: legal@miluai.app
Address: Milu Technologies, Lagos, Nigeria`,
  },
];

export default function TermsPage() {
  return (
    <main className="pt-24">
      <section className="py-20 px-6 md:px-10 bg-cream">
        <AnimateIn className="max-w-3xl mx-auto">
          <Link href="/legal/privacy" className="text-sm text-primary-warm hover:text-primary transition-colors mb-8 inline-flex items-center gap-1.5">
            Also read: <span className="underline">Privacy Policy</span>
          </Link>
          <p className="text-sm font-medium text-primary-warm uppercase tracking-widest mb-4">Legal</p>
          <h1 className="font-heading font-bold text-5xl text-primary-dark mb-4">Terms of Service</h1>
          <p className="text-primary-warm">Last updated: 1 April 2026</p>
        </AnimateIn>
      </section>

      <section className="py-16 px-6 md:px-10 bg-cream-light">
        <div className="max-w-3xl mx-auto space-y-10">
          {/* Table of contents */}
          <AnimateIn>
            <div className="bg-cream border border-cream-dark rounded-2xl p-7">
              <p className="font-semibold text-primary-dark mb-4 text-sm">Contents</p>
              <ol className="space-y-1.5">
                {sections.map((s) => (
                  <li key={s.title}>
                    <a
                      href={`#${s.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`}
                      className="text-sm text-primary-warm hover:text-primary transition-colors"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </AnimateIn>

          {sections.map((s, i) => (
            <AnimateIn key={s.title} delay={i * 0.03}>
              <div
                id={s.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}
                className="bg-cream border border-cream-dark rounded-2xl p-7 scroll-mt-24"
              >
                <h2 className="font-heading font-semibold text-xl text-primary-dark mb-4">{s.title}</h2>
                <div className="text-sm text-primary-warm leading-relaxed">
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
