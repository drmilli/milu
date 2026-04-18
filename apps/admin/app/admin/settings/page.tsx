'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../../../hooks/useAdminAuth';
import { adminGet, adminPatch } from '../../../lib/api';

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-cream-dark bg-cream-light text-sm text-primary-dark placeholder:text-cream-dark focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all';

interface SystemConfig {
  atApiKey: string;
  atUsername: string;
  defaultVoice: string;
  maxCallsPerBiz: number;
  trialDays: number;
  webhookSecret: string;
  maintenanceMode: boolean;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-dark p-6 space-y-5">
      <h2 className="text-sm font-semibold text-primary-dark">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-primary-dark mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-primary-warm">{hint}</p>}
    </div>
  );
}

export default function SettingsPage() {
  const { token, user, ready } = useAdminAuth();

  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Profile fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [newPw, setNewPw] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    adminGet<SystemConfig>('/admin/settings', token)
      .then(cfg => setConfig(cfg))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setAdminEmail(user.email);
    }
  }, [user]);

  function updateConfig<K extends keyof SystemConfig>(k: K, v: SystemConfig[K]) {
    setConfig(prev => prev ? { ...prev, [k]: v } : prev);
  }

  async function saveConfig() {
    if (!token || !config) return;
    setError('');
    setSaving(true);
    try {
      await adminPatch('/admin/settings', config, token);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!token || !user) return;
    setProfileSaving(true);
    try {
      const body: Record<string, string> = { firstName, lastName, email: adminEmail };
      if (newPw.length >= 8) body.password = newPw;
      await adminPatch(`/admin/users/${user.id}`, body, token);
      setNewPw('');
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch {
      // silently ignore profile save errors
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading font-bold text-2xl text-primary-dark">Settings</h1>
        <p className="text-sm text-primary-warm mt-0.5">System-level configuration for the Milu platform.</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-cream-dark p-6">
              <div className="h-4 bg-cream rounded animate-pulse w-32 mb-5" />
              <div className="space-y-4">
                <div className="h-10 bg-cream rounded-xl animate-pulse" />
                <div className="h-10 bg-cream rounded-xl animate-pulse w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : config ? (
        <>
          {/* Africa's Talking */}
          <Section title="Africa's Talking">
            <Field label="API Key" hint="Used for all inbound call routing and provisioning.">
              <input type="password" className={inputCls} value={config.atApiKey}
                onChange={e => updateConfig('atApiKey', e.target.value)} />
            </Field>
            <Field label="Username">
              <input className={inputCls} value={config.atUsername}
                onChange={e => updateConfig('atUsername', e.target.value)} />
            </Field>
          </Section>

          {/* Voice defaults */}
          <Section title="Voice defaults">
            <Field label="Default voice style" hint="Applied to new businesses that haven't configured their agent.">
              <select className={inputCls} value={config.defaultVoice}
                onChange={e => updateConfig('defaultVoice', e.target.value)}>
                <option value="professional">Professional</option>
                <option value="warm">Warm</option>
                <option value="energetic">Energetic</option>
              </select>
            </Field>
          </Section>

          {/* Platform limits */}
          <Section title="Platform limits">
            <Field label="Max calls per business / month" hint="Soft ceiling before we notify the business. Enterprise plans are unlimited.">
              <input type="number" className={inputCls} value={config.maxCallsPerBiz}
                onChange={e => updateConfig('maxCallsPerBiz', Number(e.target.value))} />
            </Field>
            <Field label="Trial period (days)">
              <input type="number" className={inputCls} value={config.trialDays}
                onChange={e => updateConfig('trialDays', Number(e.target.value))} />
            </Field>
          </Section>

          {/* Webhooks */}
          <Section title="Webhooks">
            <Field label="Webhook signing secret" hint="Used to verify incoming webhook payloads from Africa's Talking.">
              <input type="password" className={inputCls} value={config.webhookSecret}
                onChange={e => updateConfig('webhookSecret', e.target.value)} />
            </Field>
          </Section>

          {/* Maintenance mode */}
          <Section title="Maintenance">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-primary-dark">Maintenance mode</p>
                <p className="text-xs text-primary-warm mt-0.5">When enabled, all inbound calls receive a maintenance message and new logins are blocked.</p>
              </div>
              <button
                onClick={() => updateConfig('maintenanceMode', !config.maintenanceMode)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${config.maintenanceMode ? 'bg-danger' : 'bg-cream-dark'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${config.maintenanceMode ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </Section>

          {/* Save system config */}
          <div className="flex items-center gap-3">
            <button onClick={saveConfig} disabled={saving}
              className="bg-primary text-cream-light px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && (
              <span className="text-sm text-success flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Saved
              </span>
            )}
            {error && <span className="text-sm text-danger">{error}</span>}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-cream-dark p-8 text-center text-sm text-primary-warm">
          Could not load settings.
        </div>
      )}

      {/* Admin profile — always shown */}
      <Section title="Admin profile">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name">
            <input className={inputCls} value={firstName} onChange={e => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name">
            <input className={inputCls} value={lastName} onChange={e => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field label="Email">
          <input type="email" className={inputCls} value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
        </Field>
        <Field label="New password" hint="Leave blank to keep your current password.">
          <div className="relative">
            <input
              type={showNewPw ? 'text' : 'password'}
              className={`${inputCls} pr-11`}
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="At least 8 characters"
            />
            <button type="button" onClick={() => setShowNewPw(v => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-primary-warm hover:text-primary-dark transition-colors">
              {showNewPw ? (
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
        </Field>
        <div className="flex items-center gap-3 pt-1">
          <button onClick={saveProfile} disabled={profileSaving}
            className="bg-primary text-cream-light px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
            {profileSaving ? 'Saving…' : 'Update profile'}
          </button>
          {profileSaved && (
            <span className="text-sm text-success flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Updated
            </span>
          )}
        </div>
      </Section>
    </div>
  );
}
