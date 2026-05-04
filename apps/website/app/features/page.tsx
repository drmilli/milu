import type { Metadata } from 'next';
import { AnimateIn, StaggerContainer, StaggerItem } from '../../components/AnimateIn';
import { dashboardUrl } from '../../lib/config';

export const metadata: Metadata = {
  title: 'Features',
  description: 'Everything your business phone line needs — AI-powered, built for Africa. Voice AI, knowledge base, call logs & transcripts, team access, phone numbers, and admin tools.',
  alternates: { canonical: '/features' },
  openGraph: {
    title: 'Milu Features — AI Voice Built for African Businesses',
    description: 'Voice AI, knowledge base, call logs & transcripts, team access, phone numbers, and admin tools. Built for Africa.',
  },
};

const features = [
  {
    category: 'Voice AI',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    title: 'Real-time AI responses',
    description: 'Claude-powered LLM responds naturally to callers in under 1.5 seconds. No robotic pauses, no dead air.',
  },
  {
    category: 'Voice AI',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
    title: 'Natural-sounding voice',
    description: 'ElevenLabs TTS gives your agent a warm, professional voice. Choose from multiple voice styles or use a custom one.',
  },
  {
    category: 'Voice AI',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
      </svg>
    ),
    title: 'Multilingual support',
    description: 'Handles English today. Yoruba, Hausa, and Igbo coming soon — built for the African market.',
  },
  {
    category: 'Voice AI',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
      </svg>
    ),
    title: 'Custom greeting & tone',
    description: 'Set the greeting, tone, and fallback message so the agent sounds like your brand.',
  },
  {
    category: 'Business tools',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    title: 'Custom knowledge base',
    description: 'Add your FAQs, hours, pricing, and policies. The agent answers from your content — never makes things up.',
  },
  {
    category: 'Business tools',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-8.25 4.5-8.25-4.5m16.5 0l-8.25-4.5-8.25 4.5m16.5 0v9l-8.25 4.5-8.25-4.5v-9" />
      </svg>
    ),
    title: 'Products & services catalog',
    description: 'Add your products and services so the agent can answer “how much is it?” and “what do you offer?” accurately.',
  },
  {
    category: 'Business tools',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    title: 'Appointment booking',
    description: 'Callers book appointments directly during the call. No third-party scheduling app required.',
  },
  {
    category: 'Business tools',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h1.5m0 0H21m-16.5 0v18m16.5-18v18M9 7.5h6M9 12h6M9 16.5h6" />
      </svg>
    ),
    title: 'Orders & requests',
    description: 'Capture customer requests during calls (like orders and service requests) so your team can follow up quickly.',
  },
  {
    category: 'Business tools',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      </svg>
    ),
    title: 'Smart escalation',
    description: 'When a caller needs a human, Milu transfers the call and sends you a WhatsApp summary instantly.',
  },
  {
    category: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M3.75 19.5h16.5" />
      </svg>
    ),
    title: 'Call logs dashboard',
    description: 'See every call, status, duration, and resolution. Review conversations and track follow-ups.',
  },
  {
    category: 'Analytics',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Call analytics dashboard',
    description: 'Track call volume, top intents, AI resolution rate, and escalations. Updated in real time.',
  },
  {
    category: 'Analytics',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    title: 'Full call transcripts',
    description: 'Every call is transcribed turn-by-turn and stored. Search and review any conversation at any time.',
  },
  {
    category: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5h16.5M3.75 12h16.5M3.75 16.5h16.5" />
      </svg>
    ),
    title: 'Reports',
    description: 'Generate simple reports for your team so you can review performance and follow-ups.',
  },
  {
    category: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75a4.5 4.5 0 01-9 0 4.5 4.5 0 019 0zM3.75 20.25a8.25 8.25 0 0116.5 0" />
      </svg>
    ),
    title: 'Team access & roles',
    description: 'Invite team members and manage access so the right people can review calls and handle follow-ups.',
  },
  {
    category: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Billing & plan management',
    description: 'See usage, invoices, and manage your plan directly from your dashboard.',
  },
  {
    category: 'Dashboard',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75c-2.485 0-4.5 2.015-4.5 4.5v3a3 3 0 00-3 3v2.25A3 3 0 007.5 21h9a3 3 0 003-3v-2.25a3 3 0 00-3-3v-3c0-2.485-2.015-4.5-4.5-4.5z" />
      </svg>
    ),
    title: 'Phone number management',
    description: 'Connect your number, manage verified numbers, and request additional numbers when you need them.',
  },
  {
    category: 'Infrastructure',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
    title: "Africa's Talking integration",
    description: 'Uses local telephony infrastructure — no international SIP, no expensive VOIP setup. Works with your existing number.',
  },
  {
    category: 'Infrastructure',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 0h10.5a2.25 2.25 0 012.25 2.25v6.75A2.25 2.25 0 0117.25 21H6.75A2.25 2.25 0 014.5 19.5v-6.75A2.25 2.25 0 016.75 10.5z" />
      </svg>
    ),
    title: 'Role-based access',
    description: 'Keep business data separated by account and control what team members can access.',
  },
];

const categories = ['Voice AI', 'Business tools', 'Dashboard', 'Analytics', 'Infrastructure'];

export default function FeaturesPage() {
  return (
    <main className="pt-24">
      {/* Hero */}
      <section className="py-24 px-6 md:px-10 bg-cream text-center">
        <AnimateIn>
          <p className="text-sm font-medium text-primary-warm uppercase tracking-widest mb-4">Features</p>
          <h1 className="font-heading font-bold text-5xl md:text-6xl text-primary-dark mb-6 leading-tight">
            Built for African businesses.<br />
            <span className="gradient-text italic">Not retrofitted for them.</span>
          </h1>
          <p className="text-lg text-primary-warm max-w-2xl mx-auto">
            Every feature in Milu was designed around how African businesses actually operate local networks, WhatsApp culture, and the need to handle high call volumes with a small team.
          </p>
        </AnimateIn>
      </section>

      {/* Features by category */}
      {categories.map((cat) => (
        <section key={cat} className="py-20 px-6 md:px-10 even:bg-cream-light odd:bg-cream">
          <div className="max-w-5xl mx-auto">
            <AnimateIn>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary-warm mb-10 border-b border-cream-dark pb-4">
                {cat}
              </p>
            </AnimateIn>
            <StaggerContainer className="grid sm:grid-cols-2 md:grid-cols-3 gap-6" staggerDelay={0.1}>
              {features
                .filter((f) => f.category === cat)
                .map((f) => (
                  <StaggerItem key={f.title}>
                    <div className="group p-6 rounded-2xl border border-cream-dark bg-cream-light hover:border-primary/25 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-1 transition-all duration-300">
                      <div className="w-11 h-11 rounded-xl bg-primary/8 flex items-center justify-center text-primary mb-5 group-hover:bg-primary/14 transition-colors">
                        {f.icon}
                      </div>
                      <h3 className="font-semibold text-primary-dark mb-2">{f.title}</h3>
                      <p className="text-sm text-primary-warm leading-relaxed">{f.description}</p>
                    </div>
                  </StaggerItem>
                ))}
            </StaggerContainer>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="py-24 px-6 md:px-10 bg-primary-dark text-center">
        <AnimateIn>
          <h2 className="font-heading font-bold text-4xl text-cream-light mb-6">
            Ready to see it in action?
          </h2>
          <a
            href={`${dashboardUrl}/register`}
            className="inline-block bg-cream-light text-primary px-10 py-4 rounded-full font-medium text-lg hover:bg-cream transition-colors"
          >
            Start your free trial
          </a>
        </AnimateIn>
      </section>
    </main>
  );
}
