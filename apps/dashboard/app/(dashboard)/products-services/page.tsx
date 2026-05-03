'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '../../../hooks/useAuth';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../../lib/api';

type CatalogType = 'PRODUCT' | 'SERVICE';

type CatalogItemUpsert = {
  type: CatalogType;
  name: string;
  description?: string | null;
  price?: number | null;
  currency?: string;
  isAvailable?: boolean;
  availabilityNote?: string | null;
  tags?: string[];
};

interface CatalogItem {
  id: string;
  businessId: string;
  type: CatalogType;
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  isAvailable: boolean;
  availabilityNote: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function money(currency: string, n: number | null) {
  if (typeof n !== 'number') return '—';
  if (currency === 'NGN') return `₦${n.toLocaleString('en-NG')}`;
  return `${currency} ${n.toLocaleString()}`;
}

function TagPill({ text }: { text: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full border border-cream-dark bg-cream text-xs text-primary-warm">
      {text}
    </span>
  );
}

function parseCatalogFilter(value: string): 'all' | CatalogType {
  if (value === 'PRODUCT' || value === 'SERVICE' || value === 'all') return value;
  return 'all';
}

function ItemModal({
  mode,
  initial,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  initial?: Partial<CatalogItem>;
  onClose: () => void;
  onSave: (data: CatalogItemUpsert) => Promise<void>;
}) {
  const [type, setType] = useState<CatalogType>((initial?.type as CatalogType) ?? 'PRODUCT');
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState<string>(typeof initial?.price === 'number' ? String(initial?.price) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'NGN');
  const [isAvailable, setIsAvailable] = useState(initial?.isAvailable ?? true);
  const [availabilityNote, setAvailabilityNote] = useState(initial?.availabilityNote ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50';

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const parsedPrice = price.trim() ? Number(price) : null;
      await onSave({
        type,
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        price: Number.isFinite(parsedPrice) ? Math.max(0, Math.round(parsedPrice as number)) : null,
        currency: currency.trim().toUpperCase() || 'NGN',
        isAvailable,
        availabilityNote: availabilityNote.trim() ? availabilityNote.trim() : null,
        tags: tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
          .slice(0, 20),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary-dark/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark flex-shrink-0">
          <h2 className="font-semibold text-primary-dark">
            {mode === 'create' ? 'New product/service' : 'Edit item'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Type</label>
              <select className={inputCls} value={type} onChange={e => setType(e.target.value as CatalogType)}>
                <option value="PRODUCT">Product</option>
                <option value="SERVICE">Service</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Currency</label>
              <input className={inputCls} value={currency} onChange={e => setCurrency(e.target.value)} placeholder="NGN" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Name</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Haircut" />
          </div>

          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Description (optional)</label>
            <textarea rows={3} className={clsx(inputCls, 'resize-none')} value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description customers might ask about" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Price (optional)</label>
              <input type="number" min={0} className={inputCls} value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm text-primary-dark">
                <input type="checkbox" checked={isAvailable} onChange={e => setIsAvailable(e.target.checked)} />
                Available
              </label>
            </div>
          </div>

          {!isAvailable && (
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Availability note (optional)</label>
              <input className={inputCls} value={availabilityNote} onChange={e => setAvailabilityNote(e.target.value)} placeholder="e.g. back in stock on Friday" />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Tags (comma separated)</label>
            <input className={inputCls} value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. kids, express, premium" />
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-cream-dark flex-shrink-0">
          <button onClick={onClose} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving || !name.trim()} className="bg-primary text-cream-light px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductsServicesPage() {
  const { token, ready, user } = useAuth();

  const businessId = user?.businessId ?? '';
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgradeMsg, setUpgradeMsg] = useState('');
  const [type, setType] = useState<'all' | CatalogType>('all');
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token || !businessId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (type !== 'all') params.set('type', type);
    const qs = params.toString();
    apiGet<CatalogItem[]>(`/businesses/${businessId}/catalog${qs ? `?${qs}` : ''}`, token)
      .then(setItems)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '';
        if (msg.toLowerCase().includes('upgrade')) setUpgradeMsg(msg);
      })
      .finally(() => setLoading(false));
  }, [token, businessId, q, type]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const counts = useMemo(() => {
    const product = items.filter(i => i.type === 'PRODUCT').length;
    const service = items.filter(i => i.type === 'SERVICE').length;
    return { product, service, total: items.length };
  }, [items]);

  async function createItem(data: CatalogItemUpsert) {
    if (!token || !businessId) return;
    await apiPost<CatalogItem>(`/businesses/${businessId}/catalog`, data, token);
    load();
  }

  async function updateItem(id: string, data: CatalogItemUpsert) {
    if (!token || !businessId) return;
    await apiPatch<CatalogItem>(`/businesses/${businessId}/catalog/${id}`, data, token);
    load();
  }

  async function toggleAvailability(item: CatalogItem) {
    if (!token || !businessId) return;
    setSavingId(item.id);
    try {
      await apiPatch<CatalogItem>(`/businesses/${businessId}/catalog/${item.id}`, { isAvailable: !item.isAvailable }, token);
      setItems(prev => prev.map(p => p.id === item.id ? { ...p, isAvailable: !p.isAvailable } : p));
    } finally {
      setSavingId(null);
    }
  }

  async function deleteItem(item: CatalogItem) {
    if (!token || !businessId) return;
    const ok = window.confirm(`Delete "${item.name}"?`);
    if (!ok) return;
    await apiDelete(`/businesses/${businessId}/catalog/${item.id}`, token).catch(() => null);
    setItems(prev => prev.filter(p => p.id !== item.id));
  }

  if (upgradeMsg) {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <div className="bg-warning/10 border border-warning/25 rounded-2xl p-6">
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Upgrade required</h1>
          <p className="text-sm text-primary-warm mt-2">{upgradeMsg}</p>
          <a href="/billing" className="inline-flex mt-5 bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
            Upgrade
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Products & Services</h1>
          <p className="text-sm text-primary-warm mt-1">
            Keep this up to date so the phone agent can answer what’s available and what it costs.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-primary text-cream-light px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          Add item
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: counts.total },
          { label: 'Products', value: counts.product },
          { label: 'Services', value: counts.service },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-cream-dark p-4">
            <p className="text-xs text-primary-warm">{s.label}</p>
            <p className="text-2xl font-bold text-primary-dark mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-cream-dark p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name…"
            className="flex-1 text-sm border border-cream-dark rounded-xl px-4 py-2.5 bg-cream-light text-primary-dark placeholder:text-primary-warm/50 focus:outline-none focus:border-primary/50"
          />
          <select
            value={type}
            onChange={e => setType(parseCatalogFilter(e.target.value))}
            className="text-sm border border-cream-dark rounded-xl px-4 py-2.5 bg-cream-light text-primary-dark focus:outline-none focus:border-primary/50"
          >
            <option value="all">All</option>
            <option value="PRODUCT">Products</option>
            <option value="SERVICE">Services</option>
          </select>
          <button
            onClick={load}
            className="text-sm px-4 py-2.5 rounded-xl border border-cream-dark text-primary-warm hover:text-primary hover:border-primary/30 transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-cream-dark overflow-hidden">
        <div className="px-5 py-3.5 border-b border-cream-dark bg-cream-light/60">
          <h3 className="text-xs font-semibold text-primary-warm uppercase tracking-wider">Catalog</h3>
        </div>

        {loading ? (
          <div className="py-14 text-center text-primary-warm text-sm animate-pulse">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center space-y-1">
            <p className="text-sm font-medium text-primary-dark">No items yet</p>
            <p className="text-xs text-primary-warm">Add a product or service so the agent can answer availability questions.</p>
          </div>
        ) : (
          <div className="divide-y divide-cream-dark">
            {items.map(item => (
              <div key={item.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full border border-cream-dark bg-cream text-primary-warm">
                      {item.type === 'PRODUCT' ? 'Product' : 'Service'}
                    </span>
                    <p className="font-semibold text-primary-dark truncate">{item.name}</p>
                    <span className={clsx(
                      'text-xs font-medium px-2.5 py-1 rounded-full',
                      item.isAvailable ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                    )}>
                      {item.isAvailable ? 'Available' : 'Unavailable'}
                    </span>
                  </div>
                  {item.description && <p className="text-sm text-primary-warm mt-1 line-clamp-2">{item.description}</p>}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-sm font-medium text-primary-dark">{money(item.currency, item.price)}</span>
                    {!item.isAvailable && item.availabilityNote && (
                      <span className="text-xs text-primary-warm">• {item.availabilityNote}</span>
                    )}
                    {(item.tags ?? []).slice(0, 6).map(t => <TagPill key={t} text={t} />)}
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => toggleAvailability(item)}
                    disabled={savingId === item.id}
                    className={clsx(
                      'text-xs px-3 py-2 rounded-lg border transition-colors disabled:opacity-50',
                      item.isAvailable
                        ? 'border-cream-dark text-primary-warm hover:text-danger hover:border-danger/30'
                        : 'border-cream-dark text-primary-warm hover:text-success hover:border-success/30',
                    )}
                  >
                    {savingId === item.id ? 'Saving…' : (item.isAvailable ? 'Mark unavailable' : 'Mark available')}
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    className="text-xs px-3 py-2 rounded-lg border border-cream-dark text-primary-warm hover:text-primary hover:border-primary/30 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteItem(item)}
                    className="text-xs px-3 py-2 rounded-lg border border-danger/30 text-danger hover:bg-danger/5 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <ItemModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSave={createItem}
        />
      )}
      {editing && (
        <ItemModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(data) => updateItem(editing.id, data)}
        />
      )}
    </div>
  );
}
