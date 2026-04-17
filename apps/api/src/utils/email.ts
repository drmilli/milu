import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

// ─── Transport ────────────────────────────────────────────────────────────────

function createTransport() {
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
    });
  }
  return null;
}

const transport = createTransport();

async function send(to: string, subject: string, html: string) {
  if (!transport) {
    logger.info({ to, subject }, '[DEV] Email (no SMTP configured)');
    return;
  }
  await transport.sendMail({ from: env.EMAIL_FROM, to, subject, html });
}

// ─── Base layout ──────────────────────────────────────────────────────────────

function layout(body: string, previewText = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Milu</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background-color: #F5ECD7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: #5C3D2E; }
    .btn { display: inline-block; background-color: #5C3D2E; color: #FAF6EE !important; text-decoration: none; padding: 14px 32px; border-radius: 100px; font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
    .btn:hover { background-color: #3B2314; }
  </style>
</head>
<body style="background:#F5ECD7; margin:0; padding:0;">
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5ECD7; padding: 40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">

        <!-- Header / Logo -->
        <tr>
          <td align="center" style="background:#3B2314; border-radius:20px 20px 0 0; padding:32px 40px 28px;">
            <div style="font-family:Georgia,'Times New Roman',serif; font-size:28px; font-weight:700; letter-spacing:-0.5px; color:#FAF6EE;">
              milu<span style="color:#C97D2E;">.</span>
            </div>
            <div style="font-size:10px; font-weight:700; letter-spacing:0.2em; text-transform:uppercase; color:rgba(250,246,238,0.35); margin-top:6px;">AI voice assistant</div>
          </td>
        </tr>

        <!-- Body card -->
        <tr>
          <td style="background:#ffffff; padding:40px 48px; border-left:1px solid #EAD9BA; border-right:1px solid #EAD9BA;">
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#FAF6EE; border-radius:0 0 20px 20px; border:1px solid #EAD9BA; border-top:none; padding:24px 48px; text-align:center;">
            <p style="font-size:12px; color:#7A5230; line-height:1.6;">
              You received this email because you have an account on <strong>Milu</strong>.<br/>
              Questions? Reply to this email or visit <a href="${env.APP_URL}" style="color:#5C3D2E;">${env.APP_URL}</a>
            </p>
            <p style="font-size:11px; color:#C4A882; margin-top:12px;">© ${new Date().getFullYear()} Milu AI · Lagos, Nigeria</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Shared components ────────────────────────────────────────────────────────

function heading(text: string) {
  return `<h1 style="font-family:Georgia,'Times New Roman',serif; font-size:24px; font-weight:700; color:#3B2314; margin-bottom:12px; line-height:1.3;">${text}</h1>`;
}

function para(text: string) {
  return `<p style="font-size:15px; color:#5C3D2E; line-height:1.7; margin-bottom:16px;">${text}</p>`;
}

function ctaButton(url: string, label: string) {
  return `<div style="text-align:center; margin:32px 0;">
    <a href="${url}" class="btn" style="display:inline-block; background:#5C3D2E; color:#FAF6EE !important; text-decoration:none; padding:14px 36px; border-radius:100px; font-size:15px; font-weight:600; letter-spacing:0.01em;">${label}</a>
  </div>
  <p style="font-size:12px; color:#C4A882; text-align:center; margin-top:8px;">
    Or copy this link: <a href="${url}" style="color:#5C3D2E; word-break:break-all;">${url}</a>
  </p>`;
}

function divider() {
  return `<hr style="border:none; border-top:1px solid #EAD9BA; margin:28px 0;" />`;
}

function infoBox(content: string) {
  return `<div style="background:#FAF6EE; border:1px solid #EAD9BA; border-left:4px solid #5C3D2E; border-radius:10px; padding:16px 20px; margin:20px 0;">
    ${content}
  </div>`;
}

function successBadge(label: string) {
  return `<div style="display:inline-block; background:#4A7C59; color:#fff; font-size:12px; font-weight:700; padding:4px 14px; border-radius:100px; margin-bottom:16px; letter-spacing:0.05em; text-transform:uppercase;">${label}</div>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function sendVerificationEmail(to: string, code: string) {
  const digits = code.split('');
  const digitBoxes = digits.map((d) =>
    `<td style="width:52px; height:64px; background:#FAF6EE; border:2px solid #EAD9BA; border-radius:12px; text-align:center; vertical-align:middle; font-family:Georgia,'Times New Roman',serif; font-size:32px; font-weight:700; color:#3B2314; padding:0;">${d}</td>`,
  ).join('<td style="width:8px;"></td>');

  await send(to, 'Your Milu verification code', layout(`
    ${heading('Verify your email address')}
    ${para('Welcome to Milu! Enter the 6-digit code below to verify your email and activate your account.')}
    <div style="text-align:center; margin:32px 0;">
      <table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">
        <tr>${digitBoxes}</tr>
      </table>
      <p style="font-size:13px; color:#7A5230; margin-top:16px;">This code expires in <strong>24 hours</strong></p>
    </div>
    ${divider()}
    <p style="font-size:13px; color:#7A5230;">Enter this code in the app when prompted. If you didn't create a Milu account, you can safely ignore this email.</p>
  `, `Your Milu verification code is ${code}`));
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = `${env.APP_URL}/reset-password?token=${token}`;
  await send(to, 'Reset your Milu password', layout(`
    ${heading('Reset your password')}
    ${para('We received a request to reset the password for your Milu account. Click the button below to choose a new password.')}
    ${ctaButton(url, 'Reset password')}
    ${divider()}
    ${infoBox(`<p style="font-size:13px; color:#5C3D2E; margin:0;">⏱ This link expires in <strong>1 hour</strong>.<br/>If you didn't request a password reset, please ignore this email — your account is safe.</p>`)}
  `, 'Reset your Milu password — link expires in 1 hour'));
}

export async function sendTeamInviteEmail(to: string, businessName: string, tempPassword: string) {
  const url = `${env.APP_URL}/login`;
  await send(to, `You've been added to ${businessName} on Milu`, layout(`
    ${heading(`You've been invited to join ${businessName}`)}
    ${para(`A team member has added you to <strong>${businessName}</strong>'s workspace on Milu — the AI-powered voice assistant for businesses.`)}
    ${divider()}
    ${infoBox(`
      <p style="font-size:13px; font-weight:600; color:#3B2314; margin-bottom:10px;">Your login details</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="font-size:13px; color:#7A5230; padding:3px 0; width:120px;">Email</td><td style="font-size:13px; color:#3B2314; font-weight:600;">${to}</td></tr>
        <tr><td style="font-size:13px; color:#7A5230; padding:3px 0;">Temp password</td><td style="font-size:13px; color:#3B2314; font-weight:600; font-family:monospace;">${tempPassword}</td></tr>
      </table>
    `)}
    ${ctaButton(url, 'Sign in to Milu')}
    ${divider()}
    <p style="font-size:13px; color:#7A5230;">Please change your password immediately after your first login.</p>
  `, `You've been invited to ${businessName} on Milu`));
}

export async function sendSubscriptionConfirmEmail(to: string, plan: string, businessName: string) {
  const planFeatures: Record<string, string[]> = {
    STARTER: ['Up to 500 calls/month', 'AI voice agent', 'Email support'],
    GROWTH: ['Up to 2,000 calls/month', 'AI voice agent', 'WhatsApp & SMS alerts', 'Priority support'],
    ENTERPRISE: ['Unlimited calls', 'AI voice agent', 'All channels', 'Dedicated support', 'Custom integrations'],
  };
  const features = planFeatures[plan.toUpperCase()] ?? [];
  const featureRows = features.map((f) => `
    <tr><td style="padding:5px 0; font-size:14px; color:#5C3D2E;">
      <span style="color:#4A7C59; margin-right:8px;">✓</span>${f}
    </td></tr>`).join('');

  await send(to, `Your Milu ${plan} plan is now active`, layout(`
    ${successBadge('Subscription active')}
    ${heading(`Welcome to ${plan}!`)}
    ${para(`Your <strong>${plan}</strong> plan for <strong>${businessName}</strong> is now active. Here's what's included:`)}
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0 24px;">
      ${featureRows}
    </table>
    ${ctaButton(`${env.APP_URL}/dashboard`, 'Go to your dashboard')}
    ${divider()}
    <p style="font-size:13px; color:#7A5230;">Manage your subscription anytime from <a href="${env.APP_URL}/dashboard/billing" style="color:#5C3D2E;">Billing settings</a>.</p>
  `, `Your Milu ${plan} plan is now active`));
}

export async function sendSubscriptionCancelledEmail(to: string, businessName: string) {
  await send(to, 'Your Milu subscription has been cancelled', layout(`
    ${heading('Subscription cancelled')}
    ${para(`We've cancelled the Milu subscription for <strong>${businessName}</strong> as requested.`)}
    ${infoBox(`<p style="font-size:14px; color:#5C3D2E; margin:0;">Your account will remain active until the <strong>end of the current billing period</strong>. After that, your account will switch to a free plan.</p>`)}
    ${para('We\'re sorry to see you go. If there was something we could have done better, please reply to this email — we read every response.')}
    ${ctaButton(`${env.APP_URL}/pricing`, 'Reactivate subscription')}
    ${divider()}
    <p style="font-size:13px; color:#7A5230;">Need help? Contact us at <a href="mailto:${env.GMAIL_USER ?? 'info.miluai@gmail.com'}" style="color:#5C3D2E;">${env.GMAIL_USER ?? 'info.miluai@gmail.com'}</a></p>
  `, 'Your Milu subscription has been cancelled'));
}

// ─── Test email ───────────────────────────────────────────────────────────────

export async function sendTestEmail(to: string) {
  await send(to, 'Milu email test — all templates', layout(`
    ${successBadge('Email system online')}
    ${heading('Your email templates are working!')}
    ${para('This is a test email from the Milu platform. If you\'re reading this, SMTP is configured correctly and all email templates are ready to send.')}
    ${divider()}
    <p style="font-size:14px; font-weight:600; color:#3B2314; margin-bottom:12px;">Templates available</p>
    ${['Email verification', 'Password reset', 'Team invite', 'Subscription confirmed', 'Subscription cancelled'].map((t) =>
      `<p style="font-size:14px; color:#5C3D2E; padding:5px 0; border-bottom:1px solid #EAD9BA;">
        <span style="color:#4A7C59; margin-right:8px;">✓</span>${t}
      </p>`
    ).join('')}
    ${divider()}
    ${ctaButton(`${env.APP_URL}/dashboard`, 'Open dashboard')}
  `, 'Milu email test — all templates working'));
}
