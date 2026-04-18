'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../../lib/api';

interface Member {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'OWNER' | 'ADMIN';
  emailVerified: boolean;
  lastActive?: string;
  createdAt: string;
}

const ROLE_META: Record<string, { label: string; badge: string }> = {
  OWNER: { label: 'Owner', badge: 'bg-primary/10 text-primary' },
  ADMIN: { label: 'Admin', badge: 'bg-warning/10 text-warning' },
};

const AVATAR_COLORS = ['bg-primary', 'bg-primary-warm', 'bg-success', 'bg-warning'];

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

function memberInitials(m: Member) {
  if (m.firstName) return (m.firstName[0] + (m.lastName?.[0] ?? '')).toUpperCase();
  return m.email[0].toUpperCase();
}

function memberDisplayName(m: Member) {
  if (m.firstName || m.lastName) return [m.firstName, m.lastName].filter(Boolean).join(' ');
  return m.email;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-cream rounded-xl ${className}`} />;
}

// ─── Remove confirmation modal ────────────────────────────────────────────────
function RemoveModal({
  member,
  onConfirm,
  onCancel,
  loading,
}: {
  member: Member;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-primary-dark">Remove team member?</h2>
            <p className="text-xs text-primary-warm mt-1 leading-relaxed">
              <span className="font-medium text-primary-dark">{memberDisplayName(member)}</span> will lose access
              to the dashboard immediately.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} disabled={loading}
            className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2 disabled:opacity-40">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="bg-danger text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-danger/90 transition-colors disabled:opacity-40 flex items-center gap-2">
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reset password modal ─────────────────────────────────────────────────────
function ResetPasswordModal({
  member,
  onClose,
}: {
  member: Member;
  onClose: () => void;
}) {
  const { token } = useAuth(false);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const mismatch = confirm.length > 0 && pw !== confirm;
  const canSubmit = pw.length >= 8 && pw === confirm;

  async function submit() {
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      await apiPost(`/users/${member.id}/reset-password`, { password: pw }, token);
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        {done ? (
          <div className="text-center py-2 space-y-4">
            <div className="w-14 h-14 rounded-full bg-success/10 border-2 border-success/20 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-primary-dark">Password updated</p>
              <p className="text-xs text-primary-warm mt-1">
                Share the new password with <span className="font-medium text-primary-dark">{memberDisplayName(member)}</span> securely.
              </p>
            </div>
            <button onClick={onClose}
              className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors">
              Done
            </button>
          </div>
        ) : (
          <>
            <div>
              <h2 className="font-semibold text-primary-dark">Reset password</h2>
              <p className="text-xs text-primary-warm mt-0.5">
                Set a new password for <span className="font-medium text-primary-dark">{memberDisplayName(member)}</span>.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-primary-dark mb-1.5">New password</label>
                <div className="relative">
                  <input type={showPw ? 'text' : 'password'} className={`${inputCls} pr-11`}
                    placeholder="At least 8 characters" value={pw} onChange={e => setPw(e.target.value)} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-primary-warm hover:text-primary-dark transition-colors">
                    {showPw ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-primary-dark mb-1.5">Confirm password</label>
                <input type="password" className={`${inputCls} ${mismatch ? 'border-danger/60' : ''}`}
                  placeholder="Repeat password" value={confirm} onChange={e => setConfirm(e.target.value)} />
                {mismatch && <p className="mt-1 text-xs text-danger">Passwords don&apos;t match</p>}
              </div>
            </div>
            {error && <p className="text-xs text-danger bg-danger/8 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">Cancel</button>
              <button onClick={submit} disabled={!canSubmit || loading}
                className="bg-primary text-cream-light px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 flex items-center gap-2">
                {loading && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                Update password
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const { token, user, ready } = useAuth();
  const businessId = user?.businessId ?? '';

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [opError, setOpError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', email: '', role: 'ADMIN' as Member['role'] });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const [resetTarget, setResetTarget] = useState<Member | null>(null);

  const [resending, setResending] = useState<string | null>(null);
  const [resentIds, setResentIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!token || !businessId) return;
    apiGet<Member[]>(`/businesses/${businessId}/team`, token)
      .then(setMembers)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token, businessId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function inviteMember() {
    if (!addForm.email.trim()) return;
    setAddError('');
    setAddLoading(true);
    try {
      const newMember = await apiPost<Member>('/users/invite', {
        email: addForm.email.trim(),
        businessId,
        role: addForm.role,
        firstName: addForm.firstName.trim() || undefined,
        lastName: addForm.lastName.trim() || undefined,
      }, token);
      setMembers(prev => [...prev, newMember]);
      setAddForm({ firstName: '', lastName: '', email: '', role: 'ADMIN' });
      setShowAdd(false);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setAddLoading(false);
    }
  }

  async function changeRole(id: string, role: Member['role']) {
    const prev = members.find(m => m.id === id)?.role;
    setMembers(ms => ms.map(m => m.id === id ? { ...m, role } : m));
    try {
      await apiPatch(`/users/${id}`, { role }, token);
    } catch {
      setMembers(ms => ms.map(m => m.id === id ? { ...m, role: prev! } : m));
      setOpError('Failed to update role');
      setTimeout(() => setOpError(''), 3000);
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    setRemoveLoading(true);
    try {
      await apiDelete(`/businesses/${businessId}/team/${removeTarget.id}`, token);
      setMembers(prev => prev.filter(m => m.id !== removeTarget.id));
      setRemoveTarget(null);
    } catch {
      setOpError('Failed to remove member');
      setTimeout(() => setOpError(''), 3000);
      setRemoveTarget(null);
    } finally {
      setRemoveLoading(false);
    }
  }

  async function resendInvite(m: Member) {
    setResending(m.id);
    try {
      await apiPost(`/businesses/${businessId}/team/${m.id}/resend-invite`, {}, token);
      setResentIds(prev => new Set(prev).add(m.id));
      setTimeout(() => setResentIds(prev => { const s = new Set(prev); s.delete(m.id); return s; }), 10000);
    } catch {
      setOpError('Failed to resend invite');
      setTimeout(() => setOpError(''), 3000);
    } finally {
      setResending(null);
    }
  }

  const activeMembers = members.filter(m => m.emailVerified);
  const pendingMembers = members.filter(m => !m.emailVerified);

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Team</h1>
          <p className="text-sm text-primary-warm mt-0.5">
            {loading ? '' : `${members.length} member${members.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddError(''); }}
          className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add member
        </button>
      </div>

      {/* Operation error banner */}
      {opError && (
        <div className="bg-danger/8 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger">
          {opError}
        </div>
      )}

      {/* Invite form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border-2 border-primary/25 p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-primary-dark">Invite a team member</h2>
            <p className="text-xs text-primary-warm mt-0.5">They&apos;ll receive an email with login instructions.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">First name</label>
              <input className={inputCls} placeholder="Emeka"
                value={addForm.firstName} onChange={e => setAddForm(f => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Last name</label>
              <input className={inputCls} placeholder="Okonkwo"
                value={addForm.lastName} onChange={e => setAddForm(f => ({ ...f, lastName: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Email <span className="text-danger">*</span></label>
            <input type="email" className={inputCls} placeholder="emeka@yourbusiness.ng"
              value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-2">Role</label>
            <div className="flex gap-2">
              {(['ADMIN', 'OWNER'] as const).map(r => (
                <button key={r} onClick={() => setAddForm(f => ({ ...f, role: r }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    addForm.role === r
                      ? 'bg-primary text-cream-light border-primary'
                      : 'bg-cream text-primary-warm border-cream-dark hover:border-primary/30'
                  }`}>
                  {ROLE_META[r].label}
                </button>
              ))}
            </div>
          </div>
          {addError && <p className="text-xs text-danger bg-danger/8 border border-danger/20 rounded-lg px-3 py-2">{addError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setAddError(''); }}
              className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">
              Cancel
            </button>
            <button onClick={inviteMember} disabled={!addForm.email.trim() || addLoading}
              className="bg-primary text-cream-light px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 flex items-center gap-2">
              {addLoading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {addLoading ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </div>
      )}

      {/* Active members */}
      <div>
        {!loading && activeMembers.length > 0 && (
          <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-2 px-1">
            Active · {activeMembers.length}
          </p>
        )}
        <div className="bg-white rounded-2xl border border-cream-dark divide-y divide-cream-dark">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="w-9 h-9 !rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-7 w-20 rounded-lg" />
              </div>
            ))
          ) : activeMembers.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-primary-warm">No active team members yet.</div>
          ) : (
            activeMembers.map((m, i) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-4">
                {/* Avatar */}
                <div className={`w-9 h-9 rounded-full ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-sm font-semibold text-cream-light">{memberInitials(m)}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-primary-dark">{memberDisplayName(m)}</p>
                    {m.id === user?.id && (
                      <span className="text-xs text-primary-warm bg-cream px-2 py-0.5 rounded-full border border-cream-dark">You</span>
                    )}
                  </div>
                  <p className="text-xs text-primary-warm">
                    {m.email}
                    {m.lastActive && (
                      <span className="ml-2 text-cream-dark">· active {timeAgo(m.lastActive)}</span>
                    )}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {m.id === user?.id ? (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_META[m.role]?.badge}`}>
                      {ROLE_META[m.role]?.label ?? m.role}
                    </span>
                  ) : (
                    <select value={m.role} onChange={e => changeRole(m.id, e.target.value as Member['role'])}
                      className="text-xs border border-cream-dark rounded-lg px-2.5 py-1.5 bg-cream-light text-primary-dark focus:outline-none focus:border-primary/50 cursor-pointer">
                      <option value="ADMIN">Admin</option>
                      <option value="OWNER">Owner</option>
                    </select>
                  )}

                  {m.id !== user?.id && (
                    <>
                      <button onClick={() => setResetTarget(m)} title="Reset password"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-primary/8 hover:text-primary transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      </button>
                      <button onClick={() => setRemoveTarget(m)} title="Remove member"
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-danger/8 hover:text-danger transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pending invites */}
      {!loading && pendingMembers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-primary-warm uppercase tracking-wider mb-2 px-1">
            Pending invites · {pendingMembers.length}
          </p>
          <div className="bg-white rounded-2xl border border-cream-dark divide-y divide-cream-dark">
            {pendingMembers.map(m => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-full bg-cream-dark flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-primary-warm" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary-dark">{m.email}</p>
                  <p className="text-xs text-primary-warm">
                    {ROLE_META[m.role]?.label ?? m.role} · invited {timeAgo(m.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {resentIds.has(m.id) ? (
                    <span className="text-xs text-success font-medium flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Sent
                    </span>
                  ) : (
                    <button
                      onClick={() => resendInvite(m)}
                      disabled={resending === m.id}
                      className="text-xs text-primary hover:underline font-medium disabled:opacity-40"
                    >
                      {resending === m.id ? 'Sending…' : 'Resend invite'}
                    </button>
                  )}
                  <button onClick={() => setRemoveTarget(m)} title="Cancel invite"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-danger/8 hover:text-danger transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role guide */}
      <div className="bg-cream rounded-2xl border border-cream-dark p-5">
        <h3 className="text-sm font-semibold text-primary-dark mb-3">Role permissions</h3>
        <div className="grid sm:grid-cols-3 gap-4 text-xs text-primary-warm">
          {[
            { role: 'OWNER', perms: ['Full access', 'Billing & plan', 'Manage team', 'All settings'] },
            { role: 'ADMIN', perms: ['All dashboard pages', 'Knowledge base', 'Agent config', 'No billing'] },
          ].map(r => (
            <div key={r.role}>
              <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mb-2 ${ROLE_META[r.role].badge}`}>
                {ROLE_META[r.role].label}
              </span>
              <ul className="space-y-1">
                {r.perms.map(p => (
                  <li key={p} className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {removeTarget && (
        <RemoveModal
          member={removeTarget}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
          loading={removeLoading}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          member={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
