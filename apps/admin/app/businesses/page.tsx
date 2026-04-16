export default function BusinessesPage() {
  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-primary-dark">Businesses</h1>
        <a
          href="/businesses/new"
          className="bg-primary text-cream-light px-4 py-2 rounded-lg text-sm"
        >
          + New Business
        </a>
      </div>
      <p className="text-primary-warm">No businesses yet.</p>
    </main>
  );
}
