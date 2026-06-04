import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../config/logger';

// ─── Transport ────────────────────────────────────────────────────────────────

function parseFrom(value: string) {
  const trimmed = value.trim();
  const m = trimmed.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim() || 'Milu', email: m[2].trim() };
  return { name: 'Milu', email: trimmed };
}

function createTransport() {
  const brevoConfigured = !!(env.BREVO_SMTP_USER && env.BREVO_SMTP_PASSWORD);
  const gmailConfigured = !!(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);

  const wantBrevo = env.EMAIL_PROVIDER === 'brevo' || (env.EMAIL_PROVIDER === 'auto' && brevoConfigured);
  const wantGmail = env.EMAIL_PROVIDER === 'gmail' || (env.EMAIL_PROVIDER === 'auto' && !brevoConfigured && gmailConfigured);

  if (wantBrevo && brevoConfigured) {
    const host = env.BREVO_SMTP_HOST ?? 'smtp-relay.brevo.com';
    const port = env.BREVO_SMTP_PORT ?? 587;
    const secure = port === 465;
    return nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: { user: env.BREVO_SMTP_USER, pass: env.BREVO_SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  if (wantGmail && gmailConfigured) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return null;
}

const transport = createTransport();

function isBunceKey(value?: string) {
  return typeof value === 'string' && /^sk_(live|test)_/i.test(value);
}

let warnedInvalidBunceEmailKey = false;

async function send(to: string, subject: string, html: string) {
  const from = parseFrom(env.EMAIL_FROM);
  const brevoApiKey = env.BREVO_API_KEY;
  const sendchampSenderEmail = env.SENDCHAMP_SENDER_EMAIL ?? from.email;
  const sendchampSenderName = env.SENDCHAMP_SENDER_NAME ?? from.name;
  const brevoSenderEmail = env.BREVO_SENDER_EMAIL ?? from.email;
  const brevoSenderName = env.BREVO_SENDER_NAME ?? from.name;

  const sendBrevoApi = async () => {
    if (!brevoApiKey) throw new Error('BREVO_API_KEY not set');
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: brevoSenderName, email: brevoSenderEmail },
        to: [{ email: to, name: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo API email failed (${res.status}): ${body}`);
    }
  };

  const smtpAvailable = !!transport;
  const shouldUseSmtp = env.EMAIL_PROVIDER === 'gmail' || env.EMAIL_PROVIDER === 'brevo' || (env.EMAIL_PROVIDER === 'auto' && smtpAvailable);
  let smtpFailedWithNetworkError = false;

  if (env.EMAIL_PROVIDER === 'auto' && brevoApiKey) {
    await sendBrevoApi();
    return;
  }

  if (shouldUseSmtp) {
    if (!transport) {
      logger.info({ to, subject }, '[DEV] Email (no SMTP configured)');
      if (env.EMAIL_PROVIDER === 'brevo' && brevoApiKey) {
        await sendBrevoApi();
        return;
      }
      return;
    }
    try {
      await transport.sendMail({ from: env.EMAIL_FROM, to, subject, html });
      return;
    } catch (err) {
      const e = err as any;
      const code = typeof e?.code === 'string' ? e.code : '';
      const shouldFallback = (env.EMAIL_PROVIDER === 'auto' || env.EMAIL_PROVIDER === 'brevo') && (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH');
      if (!shouldFallback) throw err;
      smtpFailedWithNetworkError = true;
    }
  }

  if (env.EMAIL_PROVIDER === 'brevo' && brevoApiKey && (smtpFailedWithNetworkError || !smtpAvailable)) {
    await sendBrevoApi();
    return;
  }

  const shouldUseSendchamp = env.EMAIL_PROVIDER === 'sendchamp' || (env.EMAIL_PROVIDER === 'auto' && !smtpAvailable);

  const shouldConsiderBunce = env.EMAIL_PROVIDER === 'sendchamp' || (env.EMAIL_PROVIDER === 'auto' && (smtpFailedWithNetworkError || !smtpAvailable));
  if (shouldConsiderBunce && env.SENDCHAMP_EMAIL_API_KEY && !isBunceKey(env.SENDCHAMP_EMAIL_API_KEY) && !warnedInvalidBunceEmailKey) {
    warnedInvalidBunceEmailKey = true;
    logger.warn('Invalid SENDCHAMP_EMAIL_API_KEY format; expected sk_live_... or sk_test_...');
  }

  const bunceKeyFrom = isBunceKey(env.SENDCHAMP_EMAIL_API_KEY)
    ? 'SENDCHAMP_EMAIL_API_KEY'
    : isBunceKey(env.SENDCHAMP_API_KEY)
      ? 'SENDCHAMP_API_KEY'
      : undefined;

  const bunceKey = bunceKeyFrom === 'SENDCHAMP_EMAIL_API_KEY'
    ? env.SENDCHAMP_EMAIL_API_KEY
    : bunceKeyFrom === 'SENDCHAMP_API_KEY'
      ? env.SENDCHAMP_API_KEY
      : undefined;

  if (bunceKey) {
    const res = await fetch('https://api.bunce.so/v1/messaging/transactional/send/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Authorization': bunceKey,
      },
      body: JSON.stringify({
        sender_email: sendchampSenderEmail,
        sender_name: sendchampSenderName,
        email: to,
        message_type: 'transactional',
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Bunce email failed (${res.status}) [${bunceKeyFrom ?? 'unknown-key'}]: ${body}`);
    }
    return;
  }

  if (env.EMAIL_PROVIDER === 'sendchamp' && env.SENDCHAMP_API_KEY) {
    const mod: any = await import('sendchamp-sdk');
    const Sendchamp = mod?.default ?? mod?.Sendchamp ?? mod;

    const mode = env.SENDCHAMP_API_KEY.includes('live') ? 'live' : 'test';
    const client = typeof Sendchamp === 'function'
      ? (Sendchamp.prototype && Object.keys(Sendchamp.prototype).length > 0
        ? new Sendchamp({ publicKey: env.SENDCHAMP_API_KEY, mode })
        : Sendchamp({ publicKey: env.SENDCHAMP_API_KEY, mode }))
      : null;
    if (!client?.EMAIL?.send) throw new Error('Sendchamp SDK init failed');
    const email = client.EMAIL;

    const res = await email.send({
      subject,
      to: [{ email: to, name: to }],
      from: { email: sendchampSenderEmail, name: sendchampSenderName },
      message_body: { type: 'html', value: html },
    });

    if (res?.status !== 'success') {
      throw new Error(`Sendchamp email failed (${res?.code ?? 'unknown'}): ${res?.message ?? 'Unknown error'}`);
    }
    return;
  }

  if (env.EMAIL_PROVIDER === 'sendchamp') {
    throw new Error('EMAIL_PROVIDER=sendchamp but no Sendchamp email configuration is available');
  }

  if (env.EMAIL_PROVIDER === 'auto' && smtpFailedWithNetworkError) {
    throw new Error('SMTP failed (likely blocked by hosting provider) and no HTTP email provider is configured');
  }

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

export async function sendTrialEndedEmail(to: string, businessName: string) {
  await send(to, 'Your Milu free trial has ended', layout(`
    ${heading('Your free trial has ended')}
    ${para(`Hi, your 10-day free trial for <strong>${businessName}</strong> has come to an end.`)}
    ${infoBox(`<p style="font-size:14px; color:#5C3D2E; margin:0;">Your Milu number has been <strong>paused</strong>. Calls to your number will no longer be answered until you upgrade to a paid plan.</p>`)}
    ${para('Upgrade now to keep your AI agent active and never miss another customer call.')}
    ${ctaButton(`${env.APP_URL}/billing`, 'Upgrade my plan')}
    ${divider()}
    <p style="font-size:13px; color:#7A5230;">Questions? Reply to this email or contact us at <a href="mailto:${env.GMAIL_USER ?? 'info.miluai@gmail.com'}" style="color:#5C3D2E;">${env.GMAIL_USER ?? 'info.miluai@gmail.com'}</a></p>
  `, 'Your Milu free trial has ended'));
}

export async function sendPhoneNumberAssignedEmail(to: string, businessName: string, miluNumber: string) {
  const instructions = `
    <p style="font-size:13px; font-weight:600; color:#3B2314; margin-bottom:10px;">Call forwarding instructions</p>
    <p style="font-size:13px; color:#5C3D2E; margin:0 0 12px;">
      Forward your existing business line to <strong>${miluNumber}</strong> so Milu can answer calls for you.
    </p>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr><td style="font-size:13px; color:#7A5230; padding:5px 0; width:140px;">General</td><td style="font-size:13px; color:#3B2314; font-weight:600; font-family:monospace; padding:5px 0;">**21*${miluNumber}#</td></tr>
      <tr><td style="font-size:13px; color:#7A5230; padding:5px 0;">MTN</td><td style="font-size:13px; color:#3B2314; font-weight:600; font-family:monospace; padding:5px 0;">**21*${miluNumber}#</td></tr>
      <tr><td style="font-size:13px; color:#7A5230; padding:5px 0;">Airtel</td><td style="font-size:13px; color:#3B2314; font-weight:600; font-family:monospace; padding:5px 0;">**21*${miluNumber}#</td></tr>
      <tr><td style="font-size:13px; color:#7A5230; padding:5px 0;">Glo</td><td style="font-size:13px; color:#3B2314; font-weight:600; font-family:monospace; padding:5px 0;">**21*${miluNumber}#</td></tr>
      <tr><td style="font-size:13px; color:#7A5230; padding:5px 0;">9mobile</td><td style="font-size:13px; color:#3B2314; font-weight:600; font-family:monospace; padding:5px 0;">**21*${miluNumber}#</td></tr>
    </table>
    <p style="font-size:12px; color:#7A5230; margin:12px 0 0;">If the code doesn't work on your network, contact your carrier support and ask for "call forwarding (unconditional)".</p>
  `;

  await send(to, `Your Milu number for ${businessName} is ready`, layout(`
    ${successBadge('Number assigned')}
    ${heading('Your Milu number is ready')}
    ${para(`A Milu phone number has been assigned to <strong>${businessName}</strong>.`)}
    ${infoBox(`
      <p style="font-size:13px; color:#7A5230; margin:0;">Milu number</p>
      <p style="font-size:18px; color:#3B2314; font-weight:700; margin:6px 0 0;">${miluNumber}</p>
    `)}
    ${divider()}
    ${infoBox(instructions)}
    ${ctaButton(`${env.APP_URL}/dashboard/settings`, 'Open settings')}
  `, `Milu number assigned: ${miluNumber}`));
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
