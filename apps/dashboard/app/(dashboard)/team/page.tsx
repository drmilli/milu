'use client';

import { useState } from 'react';

type Member = {
  id: number;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Agent';
  status: 'active' | 'pending';
  avatar: string;
};

const initial: Member[] = [
  { id: 1, name: 'Amaka Obi', email: 'amaka@yourbusiness.ng', role: 'Owner', status: 'active', avatar: 'A' },
  { id: 2, name: 'Chidi Nwosu', email: 'chidi@yourbusiness.ng', role: 'Admin', status: 'active', avatar: 'C' },
  { id: 3, name: 'Ngozi Adeyemi', email: 'ngozi@yourbusiness.ng', role: 'Agent', status: 'active', avatar: 'N' },
  { id: 4, name: 'Tunde Balogun', email: 'tunde@yourbusiness.ng', role: 'Agent', status: 'pending', avatar: 'T' },
];

const roleColors: Record<string, string> = {
  Owner: 'bg-primary/10 text-primary',
  Admin: 'bg-warning/10 text-warning',
  Agent: 'bg-success/10 text-success',
};

const avatarColors = ['bg-primary', 'bg-primary-warm', 'bg-success', 'bg-warning'];

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', role: 'Agent' as Member['role'], password: '', confirmPassword: '' });
  const [showAddPw, setShowAddPw] = useState(false);
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [addError, setAddError] = useState('');

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState<Member | null>(null);
  const [resetForm, setResetForm] = useState({ password: '', confirmPassword: '' });
  const [showResetPw, setShowResetPw] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  function addMember() {
    if (!addForm.name.trim() || !addForm.email.trim()) return;
    if (addForm.password.length < 8) { setAddError('Password must be at least 8 characters.'); return; }
    if (addForm.password !== addForm.confirmPassword) { setAddError("Passwords don't match."); return; }
    setMembers((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: addForm.name,
        email: addForm.email,
        role: addForm.role,
        status: 'active',
        avatar: addForm.name[0].toUpperCase(),
      },
    ]);
    setAddForm({ name: '', email: '', role: 'Agent', password: '', confirmPassword: '' });
    setAddError('');
    setShowAdd(false);
  }

  function removeMember(id: number) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function changeRole(id: number, role: Member['role']) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
  }

  function openReset(m: Member) {
    setResetTarget(m);
    setResetForm({ password: '', confirmPassword: '' });
    setResetSuccess(false);
    setShowResetPw(false);
    setShowResetConfirm(false);
  }

  function confirmReset() {
    if (resetForm.password.length < 8 || resetForm.password !== resetForm.confirmPassword) return;
    // TODO: wire up to API
    setResetSuccess(true);
  }

  const addPwMismatch = addForm.confirmPassword.length > 0 && addForm.password !== addForm.confirmPassword;
  const resetPwMismatch = resetForm.confirmPassword.length > 0 && resetForm.password !== resetForm.confirmPassword;
  const resetCanConfirm = resetForm.password.length >= 8 && resetForm.password === resetForm.confirmPassword;

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Team</h1>
          <p className="text-sm text-primary-warm mt-0.5">Manage who has access to your Milu dashboard.</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setAddError(''); }}
          className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add member
        </button>
      </div>

      {/* Add member form */}
      {showAdd && (
        <div className="bg-white rounded-2xl border-2 border-primary/25 p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-primary-dark">Add a team member</h2>
            <p className="text-xs text-primary-warm mt-0.5">Create login credentials for the new member.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Full name</label>
              <input
                className={inputCls}
                placeholder="Emeka Okonkwo"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Email</label>
              <input
                type="email"
                className={inputCls}
                placeholder="emeka@yourbusiness.ng"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showAddPw ? 'text' : 'password'}
                  className={`${inputCls} pr-10`}
                  placeholder="At least 8 characters"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setShowAddPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-warm hover:text-primary-dark transition-colors"
                >
                  {showAddPw ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Confirm password</label>
              <div className="relative">
                <input
                  type={showAddConfirm ? 'text' : 'password'}
                  className={`${inputCls} pr-10 ${addPwMismatch ? 'border-danger/60' : ''}`}
                  placeholder="Repeat password"
                  value={addForm.confirmPassword}
                  onChange={(e) => setAddForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setShowAddConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-warm hover:text-primary-dark transition-colors"
                >
                  {showAddConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              {addPwMismatch && <p className="mt-1 text-xs text-danger">Passwords don&apos;t match</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-2">Role</label>
            <div className="flex gap-2">
              {(['Admin', 'Agent'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setAddForm((f) => ({ ...f, role: r }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    addForm.role === r
                      ? 'bg-primary text-cream-light border-primary'
                      : 'bg-cream text-primary-warm border-cream-dark hover:border-primary/30'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-xs text-primary-warm mt-2">
              <strong>Admin</strong> — full access except billing. <strong>Agent</strong> — view calls and knowledge base only.
            </p>
          </div>
          {addError && <p className="text-xs text-danger bg-danger/8 border border-danger/20 rounded-lg px-3 py-2">{addError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setAddError(''); }} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">
              Cancel
            </button>
            <button
              onClick={addMember}
              disabled={!addForm.name || !addForm.email || !addForm.password || addPwMismatch}
              className="bg-primary text-cream-light px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add member
            </button>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="bg-white rounded-2xl border border-cream-dark divide-y divide-cream-dark">
        {members.map((m, i) => (
          <div key={m.id} className="flex items-center gap-4 px-5 py-4">
            <div className={`w-9 h-9 rounded-full ${avatarColors[i % avatarColors.length]} flex items-center justify-center flex-shrink-0`}>
              <span className="text-sm font-semibold text-cream-light">{m.avatar}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-primary-dark">{m.name}</p>
                {m.status === 'pending' && (
                  <span className="text-xs text-primary-warm bg-cream px-2 py-0.5 rounded-full border border-cream-dark">
                    Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-primary-warm">{m.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {m.role === 'Owner' ? (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${roleColors[m.role]}`}>
                  Owner
                </span>
              ) : (
                <select
                  value={m.role}
                  onChange={(e) => changeRole(m.id, e.target.value as Member['role'])}
                  className="text-xs border border-cream-dark rounded-lg px-2.5 py-1.5 bg-cream-light text-primary-dark focus:outline-none focus:border-primary/50 cursor-pointer"
                >
                  <option value="Admin">Admin</option>
                  <option value="Agent">Agent</option>
                </select>
              )}
              {m.role !== 'Owner' && (
                <>
                  {/* Reset password */}
                  <button
                    onClick={() => openReset(m)}
                    title="Reset password"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-primary/8 hover:text-primary transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                  </button>
                  {/* Remove */}
                  <button
                    onClick={() => removeMember(m.id)}
                    title="Remove member"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-danger/8 hover:text-danger transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Role guide */}
      <div className="bg-cream rounded-2xl border border-cream-dark p-5">
        <h3 className="text-sm font-semibold text-primary-dark mb-3">Role permissions</h3>
        <div className="grid sm:grid-cols-3 gap-4 text-xs text-primary-warm">
          {[
            { role: 'Owner', perms: ['Full access', 'Billing & plan', 'Delete account'] },
            { role: 'Admin', perms: ['All pages', 'Invite members', 'No billing access'] },
            { role: 'Agent', perms: ['View calls', 'View knowledge base', 'Read-only'] },
          ].map((r) => (
            <div key={r.role}>
              <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mb-2 ${roleColors[r.role]}`}>
                {r.role}
              </span>
              <ul className="space-y-1">
                {r.perms.map((p) => (
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

      {/* Reset password modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            {resetSuccess ? (
              <div className="text-center py-2 space-y-4">
                <div className="w-14 h-14 rounded-full bg-success/10 border-2 border-success/20 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-primary-dark">Password updated</p>
                  <p className="text-xs text-primary-warm mt-1">
                    {resetTarget.name}&apos;s password has been reset. Share it with them securely.
                  </p>
                </div>
                <button
                  onClick={() => setResetTarget(null)}
                  className="w-full bg-primary text-cream-light py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="font-semibold text-primary-dark">Reset password</h2>
                  <p className="text-xs text-primary-warm mt-0.5">
                    Set a new password for <span className="font-medium text-primary-dark">{resetTarget.name}</span>.
                  </p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-primary-dark mb-1.5">New password</label>
                    <div className="relative">
                      <input
                        type={showResetPw ? 'text' : 'password'}
                        className={`${inputCls} pr-10`}
                        placeholder="At least 8 characters"
                        value={resetForm.password}
                        onChange={(e) => setResetForm((f) => ({ ...f, password: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPw(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-warm hover:text-primary-dark transition-colors"
                      >
                        {showResetPw ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-primary-dark mb-1.5">Confirm new password</label>
                    <div className="relative">
                      <input
                        type={showResetConfirm ? 'text' : 'password'}
                        className={`${inputCls} pr-10 ${resetPwMismatch ? 'border-danger/60' : ''}`}
                        placeholder="Repeat password"
                        value={resetForm.confirmPassword}
                        onChange={(e) => setResetForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetConfirm(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-warm hover:text-primary-dark transition-colors"
                      >
                        {showResetConfirm ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                    {resetPwMismatch && <p className="mt-1 text-xs text-danger">Passwords don&apos;t match</p>}
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={() => setResetTarget(null)}
                    className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmReset}
                    disabled={!resetCanConfirm}
                    className="bg-primary text-cream-light px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Update password
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
