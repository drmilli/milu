import Link from 'next/link';

interface Props {
  title: string;
  description: string;
  requiredPlan: 'Growth' | 'Enterprise';
  icon?: React.ReactNode;
}

const planBadge: Record<Props['requiredPlan'], string> = {
  Growth: 'bg-primary/10 text-primary',
  Enterprise: 'bg-amber-500/10 text-amber-700',
};

export function UpgradeWall({ title, description, requiredPlan, icon }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-5">
          {icon ?? (
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
            </svg>
          )}
        </div>
        <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full mb-4 ${planBadge[requiredPlan]}`}>
          {requiredPlan} plan required
        </span>
        <h2 className="font-heading font-bold text-xl text-primary-dark mb-2">{title}</h2>
        <p className="text-sm text-primary-warm leading-relaxed mb-6">{description}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/billing"
            className="inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary-dark transition-colors"
          >
            View plans
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <a
            href="mailto:info.miluai@gmail.com?subject=Enterprise%20plan%20inquiry"
            className="inline-flex items-center justify-center gap-2 border border-cream-dark text-primary-warm text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-cream-light transition-colors"
          >
            Contact sales
          </a>
        </div>
      </div>
    </div>
  );
}
