'use client';

import { useState, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPost, apiPatch } from '../../../lib/api';

type Status = 'new' | 'confirmed' | 'processing' | 'ready' | 'delivered' | 'cancelled';

type OrderItem = { name: string; qty: number; price: number };

type Order = {
  id: string;
  customer: string;
  phone: string;
  items: OrderItem[];
  total: number;
  status: Status;
  channel: 'AI call' | 'Manual' | 'WhatsApp';
  date: string;
  delivery: 'pickup' | 'delivery';
  address?: string;
  notes?: string;
};

interface ApiOrder {
  id: string;
  orderNumber: string;
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
  items: OrderItem[];
  totalAmount?: number | null;
  currency: string;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryAddress?: string | null;
  notes?: string | null;
  callId?: string | null;
  createdAt: string;
}

const STATUS_FROM_API: Record<ApiOrder['status'], Status> = {
  PENDING: 'new',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  COMPLETED: 'delivered',
  CANCELLED: 'cancelled',
};

const STATUS_TO_API: Record<Status, ApiOrder['status']> = {
  new: 'PENDING',
  confirmed: 'CONFIRMED',
  processing: 'PROCESSING',
  ready: 'PROCESSING',
  delivered: 'COMPLETED',
  cancelled: 'CANCELLED',
};

function fromApiOrder(o: ApiOrder): Order {
  return {
    id: o.id,
    customer: o.customerName ?? o.customerPhone ?? 'Unknown',
    phone: o.customerPhone ?? '',
    items: o.items ?? [],
    total: o.totalAmount ?? 0,
    status: STATUS_FROM_API[o.status] ?? 'new',
    channel: o.callId ? 'AI call' : 'Manual',
    date: o.createdAt,
    delivery: o.deliveryAddress ? 'delivery' : 'pickup',
    address: o.deliveryAddress ?? undefined,
    notes: o.notes ?? undefined,
  };
}

const statusConfig: Record<Status, { label: string; cls: string; dot: string }> = {
  new:        { label: 'New',        cls: 'bg-primary/10 text-primary',     dot: 'bg-primary' },
  confirmed:  { label: 'Confirmed',  cls: 'bg-success/10 text-success',     dot: 'bg-success' },
  processing: { label: 'Processing', cls: 'bg-warning/10 text-warning',     dot: 'bg-warning' },
  ready:      { label: 'Ready',      cls: 'bg-success/15 text-success',     dot: 'bg-success' },
  delivered:  { label: 'Delivered',  cls: 'bg-cream-dark text-primary-warm', dot: 'bg-primary-warm' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-danger/10 text-danger',       dot: 'bg-danger' },
};

const pipeline: Status[] = ['new', 'confirmed', 'processing', 'ready', 'delivered'];

function fmt(n: number) {
  return '₦' + n.toLocaleString('en-NG');
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function AddOrderModal({ onClose, onSave }: { onClose: () => void; onSave: (o: Omit<Order, 'id' | 'date'>) => Promise<void> }) {
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ name: '', qty: 1, price: 0 }]);
  const [saving, setSaving] = useState(false);

  function addItem() { setItems(p => [...p, { name: '', qty: 1, price: 0 }]); }
  function removeItem(i: number) { setItems(p => p.filter((_, idx) => idx !== i)); }
  function updateItem(i: number, field: keyof OrderItem, val: string | number) {
    setItems(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  const total = items.reduce((s, i) => s + i.qty * i.price, 0);

  async function handleSave() {
    if (!customer || !items[0].name) return;
    setSaving(true);
    try {
      await onSave({
        customer, phone,
        items: items.filter(i => i.name),
        total,
        status: 'new',
        channel: 'Manual',
        delivery,
        address: delivery === 'delivery' ? address : undefined,
        notes: notes || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary-dark/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark flex-shrink-0">
          <h2 className="font-semibold text-primary-dark">New order</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Customer name</label>
              <input className={inputCls} placeholder="Chidinma Eze" value={customer} onChange={e => setCustomer(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Phone</label>
              <input className={inputCls} placeholder="+234 800 000 0000" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-primary-dark mb-2">Order items</label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className={clsx(inputCls, 'flex-1')} placeholder="Item name" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} />
                  <input type="number" min={1} className="w-14 px-2 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-center text-primary-dark focus:outline-none focus:border-primary/50" value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} />
                  <input type="number" min={0} className="w-28 px-3 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark focus:outline-none focus:border-primary/50" placeholder="Price (₦)" value={item.price || ''} onChange={e => updateItem(i, 'price', Number(e.target.value))} />
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:text-danger hover:bg-danger/8 transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-2 text-xs text-primary hover:underline flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Add item
            </button>
            {total > 0 && <p className="mt-2 text-sm font-semibold text-primary-dark">Total: {fmt(total)}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-primary-dark mb-2">Fulfilment</label>
            <div className="flex gap-2">
              {(['pickup', 'delivery'] as const).map(d => (
                <button key={d} onClick={() => setDelivery(d)}
                  className={clsx('flex-1 py-2.5 rounded-xl text-sm font-medium border capitalize transition-colors',
                    delivery === d ? 'bg-primary text-cream-light border-primary' : 'bg-cream text-primary-warm border-cream-dark hover:border-primary/30'
                  )}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          {delivery === 'delivery' && (
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Delivery address</label>
              <input className={inputCls} placeholder="Street, area, city" value={address} onChange={e => setAddress(e.target.value)} />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Notes (optional)</label>
            <textarea rows={2} className={clsx(inputCls, 'resize-none')} placeholder="e.g. Call before delivery" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-cream-dark flex-shrink-0">
          <button onClick={onClose} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="bg-primary text-cream-light px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save order'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { token, ready } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiGet<{ orders: ApiOrder[] }>('/orders', token)
      .then(res => setOrders((res.orders ?? []).map(fromApiOrder)))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const filtered = orders.filter(o => {
    if (filter !== 'all' && o.status !== filter) return false;
    if (search && !o.customer.toLowerCase().includes(search.toLowerCase()) && !o.id.toLowerCase().includes(search.toLowerCase()) && !o.phone.includes(search)) return false;
    return true;
  });

  async function updateStatus(id: string, status: Status) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    setSelected(prev => prev?.id === id ? { ...prev, status } : prev);
    try {
      await apiPatch(`/orders/${id}`, { status: STATUS_TO_API[status] }, token);
    } catch {
      load();
    }
  }

  async function addOrder(data: Omit<Order, 'id' | 'date'>) {
    const created = await apiPost<ApiOrder>('/orders', {
      customerName: data.customer || undefined,
      customerPhone: data.phone || undefined,
      items: data.items,
      totalAmount: data.total || undefined,
      deliveryAddress: data.delivery === 'delivery' ? data.address : undefined,
      notes: data.notes || undefined,
    }, token);
    const mapped = fromApiOrder(created);
    setOrders(prev => [mapped, ...prev]);
    setSelected(mapped);
  }

  const revenue = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);

  return (
    <div className="flex h-full">
      {/* Left: list */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-cream-dark">
        {/* Header */}
        <div className="px-6 py-5 border-b border-cream-dark bg-white flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-heading font-bold text-2xl text-primary-dark">Orders</h1>
              <p className="text-sm text-primary-warm mt-0.5">Track and manage customer orders.</p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New order
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Total orders', value: orders.filter(o => o.status !== 'cancelled').length },
              { label: 'New', value: orders.filter(o => o.status === 'new').length },
              { label: 'Processing', value: orders.filter(o => o.status === 'processing').length },
              { label: 'Revenue', value: fmt(revenue) },
            ].map(s => (
              <div key={s.label} className="bg-cream-light rounded-xl border border-cream-dark px-4 py-3">
                <p className="text-lg font-semibold text-primary-dark">{s.value}</p>
                <p className="text-xs text-primary-warm">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Search + filters */}
          <div className="space-y-2.5">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                className="w-full pl-9 pr-4 py-2 text-sm bg-cream-light border border-cream-dark rounded-xl placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
                placeholder="Search by name, order ID, phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'new', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={clsx('text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors',
                    filter === f ? 'bg-primary text-cream-light' : 'bg-cream text-primary-warm hover:bg-cream-dark border border-cream-dark'
                  )}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto divide-y divide-cream-dark bg-cream-light/30">
          {loading && (
            <div className="space-y-0">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse border-b border-cream-dark">
                  <div className="w-2 h-2 rounded-full bg-cream flex-shrink-0" />
                  <div className="flex-1 space-y-1.5"><div className="h-4 bg-cream rounded w-36" /><div className="h-3 bg-cream rounded w-52" /></div>
                  <div className="text-right space-y-1.5"><div className="h-4 bg-cream rounded w-20" /><div className="h-3 bg-cream rounded w-16" /></div>
                  <div className="h-6 bg-cream rounded-full w-24" />
                </div>
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-primary-warm text-center py-16">No orders found.</p>
          )}
          {!loading && filtered.map(order => (
            <button key={order.id} onClick={() => setSelected(order)}
              className={clsx('w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-white/70 transition-colors',
                selected?.id === order.id ? 'bg-white border-l-2 border-primary' : ''
              )}>
              <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', statusConfig[order.status].dot)} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-primary-dark">{order.customer}</span>
                  {order.channel === 'AI call' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/15 font-medium">AI</span>
                  )}
                </div>
                <p className="text-xs text-primary-warm truncate">
                  {order.items.map(i => i.name).join(', ')}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-primary-dark">{fmt(order.total)}</p>
                <p className="text-xs text-primary-warm">{order.id}</p>
              </div>

              <span className={clsx('text-xs font-medium px-2.5 py-1 rounded-full w-24 text-center flex-shrink-0', statusConfig[order.status].cls)}>
                {statusConfig[order.status].label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      {selected ? (
        <div className="w-80 flex-shrink-0 bg-white flex flex-col overflow-y-auto">
          <div className="px-5 py-4 border-b border-cream-dark flex items-center justify-between flex-shrink-0">
            <div>
              <p className="font-semibold text-primary-dark">{selected.id}</p>
              <p className="text-xs text-primary-warm">{fmtDate(selected.date)}</p>
            </div>
            <button onClick={() => setSelected(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-cream transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="p-5 space-y-5 flex-1">
            {/* Status pipeline */}
            <div>
              <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-3">Status</p>
              <div className="flex items-center gap-1">
                {pipeline.map((s, i) => {
                  const idx = pipeline.indexOf(selected.status);
                  const done = i <= idx && selected.status !== 'cancelled';
                  return (
                    <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
                      <button
                        onClick={() => updateStatus(selected.id, s)}
                        title={statusConfig[s].label}
                        className={clsx('w-6 h-6 rounded-full border-2 flex-shrink-0 transition-colors',
                          done ? 'bg-primary border-primary' : 'border-cream-dark bg-cream hover:border-primary/40'
                        )}
                      >
                        {done && (
                          <svg className="w-full h-full p-0.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        )}
                      </button>
                      {i < pipeline.length - 1 && <div className={clsx('flex-1 h-0.5', done && i < idx ? 'bg-primary' : 'bg-cream-dark')} />}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1.5">
                {pipeline.map(s => (
                  <p key={s} className="text-[9px] text-primary-warm capitalize" style={{ width: `${100 / pipeline.length}%` }}>{s}</p>
                ))}
              </div>
              {selected.status === 'cancelled' && (
                <span className="mt-2 inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-danger/10 text-danger">Cancelled</span>
              )}
            </div>

            {/* Customer */}
            <div className="bg-cream-light rounded-xl border border-cream-dark p-4 space-y-1.5">
              <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-2">Customer</p>
              <p className="text-sm font-medium text-primary-dark">{selected.customer}</p>
              <p className="text-xs text-primary-warm">{selected.phone}</p>
              <div className="flex items-center gap-1.5 pt-1">
                <svg className="w-3.5 h-3.5 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {selected.delivery === 'delivery'
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                  }
                </svg>
                <span className="text-xs text-primary-warm capitalize">{selected.delivery}</span>
              </div>
              {selected.address && <p className="text-xs text-primary-warm leading-relaxed">{selected.address}</p>}
            </div>

            {/* Items */}
            <div>
              <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-2">Items</p>
              <div className="space-y-1.5">
                {selected.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-primary-dark flex-1 min-w-0 truncate">{item.name}</span>
                    <span className="text-primary-warm mx-3 flex-shrink-0">×{item.qty}</span>
                    <span className="font-medium text-primary-dark flex-shrink-0">{fmt(item.qty * item.price)}</span>
                  </div>
                ))}
                <div className="border-t border-cream-dark pt-2 flex justify-between font-semibold text-sm mt-2">
                  <span className="text-primary-dark">Total</span>
                  <span className="text-primary-dark">{fmt(selected.total)}</span>
                </div>
              </div>
            </div>

            {selected.notes && (
              <div>
                <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-1">Notes</p>
                <p className="text-xs text-primary-dark leading-relaxed">{selected.notes}</p>
              </div>
            )}

            {/* Actions */}
            {selected.status !== 'delivered' && selected.status !== 'cancelled' && (
              <div className="space-y-2 pt-2">
                {selected.status !== 'ready' && (
                  <button
                    onClick={() => {
                      const next = pipeline[pipeline.indexOf(selected.status) + 1];
                      if (next) updateStatus(selected.id, next);
                    }}
                    className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
                  >
                    Mark as {statusConfig[pipeline[pipeline.indexOf(selected.status) + 1]]?.label}
                  </button>
                )}
                {selected.status === 'ready' && (
                  <button
                    onClick={() => updateStatus(selected.id, 'delivered')}
                    className="w-full bg-success text-white py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    Mark as Delivered
                  </button>
                )}
                <button
                  onClick={() => updateStatus(selected.id, 'cancelled')}
                  className="w-full text-danger border border-danger/30 py-2.5 rounded-xl text-sm font-medium hover:bg-danger/4 transition-colors"
                >
                  Cancel order
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5 pt-1">
              <p className="text-xs text-primary-warm">Source:</p>
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                selected.channel === 'AI call' ? 'bg-primary/8 text-primary' :
                selected.channel === 'WhatsApp' ? 'bg-success/10 text-success' :
                'bg-cream-dark text-primary-warm'
              )}>
                {selected.channel}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-80 flex-shrink-0 bg-cream-light/50 flex items-center justify-center">
          <p className="text-sm text-primary-warm">Select an order to view details</p>
        </div>
      )}

      {showAdd && <AddOrderModal onClose={() => setShowAdd(false)} onSave={addOrder} />}
    </div>
  );
}
