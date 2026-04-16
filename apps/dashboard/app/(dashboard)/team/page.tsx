'use client';

import { useState } from 'react';

type Member = {
  id: number;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Agent';
  status: 'active' | 'invited';
  avatar: string;
};

const initial: Member[] = [
  { id: 1, name: 'Amaka Obi', email: 'amaka@yourbusiness.ng', role: 'Owner', status: 'active', avatar: 'A' },
  { id: 2, name: 'Chidi Nwosu', email: 'chidi@yourbusiness.ng', role: 'Admin', status: 'active', avatar: 'C' },
  { id: 3, name: 'Ngozi Adeyemi', email: 'ngozi@yourbusiness.ng', role: 'Agent', status: 'active', avatar: 'N' },
  { id: 4, name: 'Tunde Balogun', email: 'tunde@yourbusiness.ng', role: 'Agent', status: 'invited', avatar: 'T' },
];

const roleColors: Record<string, string> = {
  Owner: 'bg-primary/10 text-primary',
  Admin: 'bg-warning/10 text-warning',
  Agent: 'bg-success/10 text-success',
};

const avatarColors = ['bg-primary', 'bg-primary-warm', 'bg-success', 'bg-warning'];

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>(initial);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'Agent' as Member['role'] });

  function sendInvite() {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) return;
    setMembers((prev) => [
      ...prev,
      {
        id: Date.now(),
        name: inviteForm.name,
        email: inviteForm.email,
        role: inviteForm.role,
        status: 'invited',
        avatar: inviteForm.name[0].toUpperCase(),
      },
    ]);
    setInviteForm({ name: '', email: '', role: 'Agent' });
    setShowInvite(false);
  }

  function removeMember(id: number) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function changeRole(id: number, role: Member['role']) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role } : m)));
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl text-primary-dark">Team</h1>
          <p className="text-sm text-primary-warm mt-0.5">Manage who has access to your Milu dashboard.</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="bg-primary text-cream-light px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Invite member
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white rounded-2xl border-2 border-primary/25 p-6 space-y-4">
          <h2 className="font-semibold text-primary-dark">Invite a team member</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Full name</label>
              <input
                className="w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
                placeholder="Emeka Okonkwo"
                value={inviteForm.name}
                onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-primary-dark mb-1.5">Email</label>
              <input
                type="email"
                className="w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50"
                placeholder="emeka@yourbusiness.ng"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-dark mb-1.5">Role</label>
            <div className="flex gap-2">
              {(['Admin', 'Agent'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setInviteForm((f) => ({ ...f, role: r }))}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    inviteForm.role === r
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
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowInvite(false)} className="text-sm text-primary-warm hover:text-primary-dark px-4 py-2">
              Cancel
            </button>
            <button
              onClick={sendInvite}
              className="bg-primary text-cream-light px-5 py-2 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Send invite
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
                {m.status === 'invited' && (
                  <span className="text-xs text-primary-warm bg-cream px-2 py-0.5 rounded-full border border-cream-dark">
                    Pending invite
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
                <button
                  onClick={() => removeMember(m.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-primary-warm hover:bg-danger/8 hover:text-danger transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                  </svg>
                </button>
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
    </div>
  );
}
