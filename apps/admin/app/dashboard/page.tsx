export default function AdminDashboardPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold text-primary-dark mb-6">Admin Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Businesses', value: '—' },
          { label: 'Calls Today', value: '—' },
          { label: 'Escalations', value: '—' },
          { label: 'Active Users', value: '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-cream-light rounded-lg border border-cream-dark p-5">
            <p className="text-sm text-primary-warm">{label}</p>
            <p className="text-3xl font-semibold text-primary-dark mt-1">{value}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
