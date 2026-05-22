import type { Language } from "@workspace/i18n";
import { t } from "@workspace/i18n";
import { createTransport, type Transporter } from "nodemailer";
import { logger } from "../lib/logger.js";

let envTransporter: Transporter | null = null;

function getEnvTransporter(): Transporter | null {
  if (envTransporter) return envTransporter;

  const host = process.env["SMTP_HOST"];
  const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];

  if (!host || !user || !pass) return null;

  envTransporter = createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return envTransporter;
}

export function resetTransporter(): void {
  envTransporter = null;
}

function buildTransporterFromSettings(settings: Record<string, string>): Transporter | null {
  const host = settings["smtp_host"]?.trim();
  const port = parseInt(settings["smtp_port"] ?? "587", 10);
  const user = settings["smtp_user"]?.trim();
  const pass = settings["smtp_password"]?.trim();
  const secMode = settings["smtp_secure"] ?? "tls";

  if (!host || !user || !pass) return null;

  const secure = secMode === "ssl" || port === 465;
  const requireTls = secMode === "tls";

  const rejectUnauthorized = process.env["SMTP_TLS_REJECT_UNAUTHORIZED"] !== "false";

  return createTransport({
    host,
    port,
    secure,
    requireTLS: requireTls,
    auth: { user, pass },
    tls: { rejectUnauthorized },
  });
}

function resolveFrom(settings?: Record<string, string>): string {
  if (settings) {
    const name = settings["smtp_from_name"]?.trim() || "AJKMart";
    const email = settings["smtp_from_email"]?.trim() || settings["smtp_user"]?.trim() || "";
    if (email) return `${name} <${email}>`;
  }
  return process.env["SMTP_FROM"] || "AJKMart <noreply@ajkmart.com>";
}

function resolveLanguage(language?: string): Language {
  const valid: Language[] = ["en", "ur", "roman"];
  if (language && valid.includes(language as Language)) return language as Language;
  return "en";
}

/**
 * Returns true when email integration is enabled AND SMTP credentials are set.
 * Used to decide if email can be used as an OTP delivery channel.
 */
export function isEmailProviderConfigured(settings: Record<string, string>): boolean {
  if ((settings["integration_email"] ?? "off") !== "on") return false;
  return !!(
    settings["smtp_host"]?.trim() &&
    settings["smtp_user"]?.trim() &&
    settings["smtp_password"]?.trim()
  );
}

export interface EmailResult {
  sent: boolean;
  reason?: string;
  error?: string;
  provider?: string;
}

function applyTemplateVars(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), val);
  }
  return result;
}

export async function sendVerificationEmail(
  to: string,
  verificationLink: string,
  name?: string,
  language?: string,
  settings?: Record<string, string>
): Promise<{ sent: boolean; reason?: string }> {
  const lang = resolveLanguage(language);
  const dir = lang === "ur" ? "rtl" : "ltr";
  const greeting = name ? `, ${name}` : "";
  const appName = settings?.["app_name"] ?? "AJKMart";

  const subject = t("emailVerifySubject", lang);
  const heading = t("emailVerifyHeading", lang).replace("{name}", greeting);
  const body = t("emailVerifyBody", lang);
  const button = t("emailVerifyButton", lang);
  const expiry = t("emailVerifyExpiry", lang);
  const ignore = t("emailVerifyIgnore", lang);

  const customTemplate = settings?.["email_template_verify_html"]?.trim();

  const tr = settings ? buildTransporterFromSettings(settings) : null;
  const transport = tr || getEnvTransporter();
  if (!transport) {
    logger.info(
      `[EMAIL] Verification email for ${to} — SMTP not configured. Link: ${verificationLink}`
    );
    return { sent: false, reason: "SMTP not configured" };
  }

  const defaultHtml = `
        <div dir="${dir}" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>${heading}</h2>
          <p>${body}</p>
          <p><a href="${verificationLink}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">${button}</a></p>
          <p style="color:#6b7280;font-size:13px;">${verificationLink}</p>
          <p>${expiry}</p>
          <p style="color:#9ca3af;font-size:12px;">${ignore}</p>
        </div>
      `;

  const html = customTemplate
    ? applyTemplateVars(customTemplate, {
        link: verificationLink,
        userName: name || "",
        appName,
        otp: "",
      })
    : defaultHtml;

  try {
    await transport.sendMail({
      from: resolveFrom(settings),
      to,
      subject,
      html,
      text: `${heading}\n\n${body}\n${verificationLink}\n\n${expiry}\n${ignore}`,
    });
    return { sent: true };
  } catch (err: any) {
    logger.error(`[EMAIL] Failed to send verification email to ${to}:`, err?.message);
    return { sent: false, reason: err?.message };
  }
}

export async function sendPasswordResetEmail(
  to: string,
  otp: string,
  name?: string,
  language?: string,
  settings?: Record<string, string>
): Promise<{ sent: boolean; reason?: string }> {
  const lang = resolveLanguage(language);
  const dir = lang === "ur" ? "rtl" : "ltr";
  const greeting = name ? ` — ${name}` : "";
  const appName = settings?.["app_name"] ?? "AJKMart";

  const subject = t("emailResetSubject", lang);
  const heading = t("emailResetHeading", lang).replace("{name}", greeting);
  const body = t("emailResetBody", lang);
  const expiry = t("emailResetExpiry", lang);
  const ignore = t("emailResetIgnore", lang);

  const customTemplate = settings?.["email_template_reset_html"]?.trim();

  const tr = settings ? buildTransporterFromSettings(settings) : null;
  const transport = tr || getEnvTransporter();
  if (!transport) {
    logger.info(`[EMAIL] Password reset OTP for ${to} — SMTP not configured.`);
    return { sent: false, reason: "SMTP not configured" };
  }

  const defaultHtml = `
        <div dir="${dir}" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>${heading}</h2>
          <p>${body}</p>
          <h1 style="font-size:32px;letter-spacing:8px;text-align:center;padding:16px;background:#f3f4f6;border-radius:8px;">${otp}</h1>
          <p>${expiry}</p>
          <p style="color:#9ca3af;font-size:12px;">${ignore}</p>
        </div>
      `;

  const html = customTemplate
    ? applyTemplateVars(customTemplate, { otp, userName: name || "", appName, link: "" })
    : defaultHtml;

  try {
    await transport.sendMail({
      from: resolveFrom(settings),
      to,
      subject,
      html,
      text: `${heading}\n\n${body} ${otp}\n\n${expiry}\n${ignore}`,
    });
    return { sent: true };
  } catch (err: any) {
    logger.error(`[EMAIL] Failed to send reset email to ${to}:`, err?.message);
    return { sent: false, reason: err?.message };
  }
}

export async function sendMagicLinkEmail(
  email: string,
  token: string,
  settings: Record<string, string>,
  language?: string
): Promise<EmailResult> {
  const appName = settings["app_name"] ?? "AJKMart";

  const baseUrl =
    process.env["APP_BASE_URL"] ??
    (process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : "http://localhost:3000");
  const magicUrl = `${baseUrl}/auth/magic-link?token=${encodeURIComponent(token)}`;

  const lang = resolveLanguage(language);
  const dir = lang === "ur" ? "rtl" : "ltr";

  const subject = t("emailMagicSubject", lang).replace("{app}", appName);
  const body = t("emailMagicBody", lang);
  const button = t("emailMagicButton", lang);
  const ignore = t("emailMagicIgnore", lang);

  const customTemplate = settings["email_template_magic_html"]?.trim();

  const defaultHtml = `
    <div dir="${dir}" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #2563eb;">${appName}</h2>
      <p>${body}</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${magicUrl}" style="background: #2563eb; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          ${button}
        </a>
      </div>
      <p style="color: #6b7280; font-size: 13px;">${ignore}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px;">— ${appName} Team</p>
    </div>
  `;

  const html = customTemplate
    ? applyTemplateVars(customTemplate, { link: magicUrl, userName: "", appName, otp: "" })
    : defaultHtml;

  const tr = buildTransporterFromSettings(settings) || getEnvTransporter();
  if (!tr) {
    logger.info(`[EMAIL] Magic link for ${email}: ${magicUrl}`);
    return { sent: false, error: "SMTP not configured — logged to console" };
  }

  try {
    await tr.sendMail({ from: resolveFrom(), to: email, subject, html });
    return { sent: true };
  } catch (err: any) {
    logger.error(`[EMAIL] Failed to send magic link to ${email}:`, err.message);
    return { sent: false, error: err.message };
  }
}

/* ─── Admin Alert Emails ─────────────────────────────────────────────────────
 * Sends admin alert emails using platform settings (SMTP config from DB).
 * Called from order/ride/vendor events when integration_email=on.
 *
 * Alert types must match email_alert_* keys in platform settings.
 */
export type AdminAlertType =
  | "new_vendor"
  | "high_value_order"
  | "fraud"
  | "low_balance"
  | "daily_summary"
  | "weekly_report"
  | "account_restriction"
  | "health_critical"
  | "data_export"
  | "security_pattern"
  | "sentry_new_issue"
  | "schema_drift";

export async function sendRecoveryEmail(
  email: string,
  recoveryUrl: string,
  name?: string,
  language?: string
): Promise<{ sent: boolean; reason?: string }> {
  const lang = resolveLanguage(language);
  const dir = lang === "ur" ? "rtl" : "ltr";
  const greeting = name ? `Hello ${name}` : "Hello";
  const appName = "AJKMart";

  const subject = "Account Recovery — Reset Your Password";
  const defaultHtml = `
    <div dir="${dir}" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #2563eb;">${appName}</h2>
      <p>${greeting},</p>
      <p>An administrator has initiated an account recovery for your account. Click the button below to set a new password. This link is valid for <strong>1 hour</strong> and can only be used once.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${recoveryUrl}" style="background: #2563eb; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          Reset Password
        </a>
      </div>
      <p style="color: #6b7280; font-size: 13px;">If you did not request this, contact support immediately.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px;">— ${appName} Support</p>
    </div>
  `;

  const transport = getEnvTransporter();
  if (!transport) {
    logger.info(`[EMAIL] Recovery link for ${email}: ${recoveryUrl}`);
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    await transport.sendMail({
      from: resolveFrom(),
      to: email,
      subject,
      html: defaultHtml,
      text: `${greeting},\n\nAn administrator initiated account recovery for your AJKMart account.\nReset your password here:\n${recoveryUrl}\n\nThis link is valid for 1 hour and can only be used once.\n\nIf you did not request this, contact support immediately.\n\n— AJKMart Support`,
    });
    return { sent: true };
  } catch (err: any) {
    logger.error(`[EMAIL] Failed to send recovery email to ${email}:`, err?.message);
    return { sent: false, reason: err?.message };
  }
}

export async function sendAdminAlert(
  alertType: AdminAlertType,
  subject: string,
  htmlBody: string,
  settings: Record<string, string>
): Promise<EmailResult> {
  if ((settings["integration_email"] ?? "off") !== "on") {
    return { sent: false, reason: "Email integration disabled" };
  }

  const alertKey = `email_alert_${alertType}`;
  if ((settings[alertKey] ?? "on") !== "on") {
    return { sent: false, reason: `Alert type "${alertType}" is disabled` };
  }

  const to = settings["smtp_admin_alert_email"]?.trim();
  if (!to) {
    return {
      sent: false,
      reason: "Admin alert recipient email not configured (smtp_admin_alert_email)",
    };
  }

  const tr = buildTransporterFromSettings(settings);
  if (!tr) {
    logger.info(`[EMAIL:admin-alert] SMTP not configured — logging alert: ${subject}`);
    return {
      sent: false,
      reason:
        "SMTP credentials not configured. Set smtp_host, smtp_user, smtp_password in Integrations → Email.",
    };
  }

  const appName = settings["app_name"] ?? "AJKMart";
  const from = resolveFrom(settings);

  const fullHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1e40af; color: #fff; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">⚡ ${appName} Admin Alert</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px; background: #fff;">
        ${htmlBody}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          This is an automated alert from ${appName}. Do not reply to this email.
        </p>
      </div>
    </div>
  `;

  try {
    await tr.sendMail({ from, to, subject: `[${appName}] ${subject}`, html: fullHtml });
    logger.info(`[EMAIL:admin-alert] Sent "${alertType}" alert to ${to}`);
    return { sent: true };
  } catch (err: any) {
    logger.error(`[EMAIL:admin-alert] Failed to send "${alertType}" alert:`, err.message);
    return { sent: false, error: err.message };
  }
}

/* ─── Convenience wrappers for each alert type ─────────────────────────────── */

export async function alertNewVendor(
  vendorName: string,
  vendorPhone: string,
  shopName: string,
  settings: Record<string, string>
): Promise<EmailResult> {
  return sendAdminAlert(
    "new_vendor",
    `New Vendor Registration — ${shopName}`,
    `
      <h3 style="color: #059669;">🏪 New Vendor Registered</h3>
      <table style="width:100%; border-collapse: collapse;">
        <tr><td style="padding:6px 0; color:#6b7280; width:140px;">Vendor Name</td><td style="padding:6px 0; font-weight:bold;">${vendorName}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Shop Name</td><td style="padding:6px 0; font-weight:bold;">${shopName}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Phone</td><td style="padding:6px 0; font-family:monospace;">${vendorPhone}</td></tr>
      </table>
      <p>Please review and approve/reject this vendor application from the Admin Panel → Vendors section.</p>
    `,
    settings
  );
}

export async function alertHighValueOrder(
  orderId: string,
  amount: number,
  customerPhone: string,
  settings: Record<string, string>
): Promise<EmailResult> {
  return sendAdminAlert(
    "high_value_order",
    `High Value Order — Rs. ${amount.toFixed(0)}`,
    `
      <h3 style="color: #d97706;">⚠️ High Value Order Alert</h3>
      <table style="width:100%; border-collapse: collapse;">
        <tr><td style="padding:6px 0; color:#6b7280; width:140px;">Order ID</td><td style="padding:6px 0; font-family:monospace;">#${orderId.slice(-8).toUpperCase()}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Amount</td><td style="padding:6px 0; font-weight:bold; color:#059669;">Rs. ${amount.toFixed(0)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Customer</td><td style="padding:6px 0; font-family:monospace;">${customerPhone}</td></tr>
      </table>
      <p>Please verify this order in the Admin Panel → Orders section.</p>
    `,
    settings
  );
}

export async function alertFraudSuspect(
  orderId: string,
  reason: string,
  customerPhone: string,
  settings: Record<string, string>
): Promise<EmailResult> {
  return sendAdminAlert(
    "fraud",
    `Fraud Suspect — Order #${orderId.slice(-8).toUpperCase()}`,
    `
      <h3 style="color: #dc2626;">🚨 Possible Fraud / Fake Order Detected</h3>
      <table style="width:100%; border-collapse: collapse;">
        <tr><td style="padding:6px 0; color:#6b7280; width:140px;">Order ID</td><td style="padding:6px 0; font-family:monospace;">#${orderId.slice(-8).toUpperCase()}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Customer</td><td style="padding:6px 0; font-family:monospace;">${customerPhone}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Reason</td><td style="padding:6px 0; color:#dc2626; font-weight:bold;">${reason}</td></tr>
      </table>
      <p>Please investigate and take appropriate action from the Admin Panel.</p>
    `,
    settings
  );
}

export async function alertLowWalletBalance(
  vendorName: string,
  balance: number,
  threshold: number,
  settings: Record<string, string>
): Promise<EmailResult> {
  return sendAdminAlert(
    "low_balance",
    `Low Wallet Balance — ${vendorName}`,
    `
      <h3 style="color: #d97706;">💰 Low Balance Warning</h3>
      <table style="width:100%; border-collapse: collapse;">
        <tr><td style="padding:6px 0; color:#6b7280; width:140px;">Vendor</td><td style="padding:6px 0; font-weight:bold;">${vendorName}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Current Balance</td><td style="padding:6px 0; font-weight:bold; color:#dc2626;">Rs. ${balance.toFixed(0)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Alert Threshold</td><td style="padding:6px 0;">Rs. ${threshold.toFixed(0)}</td></tr>
      </table>
      <p>The vendor's wallet balance has fallen below the alert threshold.</p>
    `,
    settings
  );
}

export interface AccountRestrictionAlertParams {
  userId: string;
  userName?: string | null;
  userPhone?: string | null;
  conditionType: string;
  severity: string;
  reason: string;
  appliedBy: string;
  triggeredByRule?: string | null;
}

export async function alertAccountRestriction(
  params: AccountRestrictionAlertParams,
  settings: Record<string, string>
): Promise<EmailResult> {
  const {
    userId,
    userName,
    userPhone,
    conditionType,
    severity,
    reason,
    appliedBy,
    triggeredByRule,
  } = params;
  const displayName = userName || userPhone || userId;
  const severityColors: Record<string, string> = {
    ban: "#dc2626",
    suspension: "#d97706",
    restriction_strict: "#d97706",
    restriction_normal: "#6b7280",
    warning: "#6b7280",
  };
  const color = severityColors[severity] ?? "#dc2626";

  return sendAdminAlert(
    "account_restriction",
    `Account ${severity === "ban" ? "Banned" : severity === "suspension" ? "Suspended" : "Restricted"} — ${displayName}`,
    `
      <h3 style="color: ${color};">⚠️ Account Condition Applied</h3>
      <table style="width:100%; border-collapse: collapse;">
        <tr><td style="padding:6px 0; color:#6b7280; width:160px;">User</td><td style="padding:6px 0; font-weight:bold;">${displayName}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">User ID</td><td style="padding:6px 0; font-family:monospace; font-size:12px;">${userId}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Condition Type</td><td style="padding:6px 0; font-family:monospace;">${conditionType}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Severity</td><td style="padding:6px 0; font-weight:bold; color:${color};">${severity}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Reason</td><td style="padding:6px 0;">${reason}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Applied By</td><td style="padding:6px 0;">${appliedBy}</td></tr>
        ${triggeredByRule ? `<tr><td style="padding:6px 0; color:#6b7280;">Triggered By Rule</td><td style="padding:6px 0; font-family:monospace;">${triggeredByRule}</td></tr>` : ""}
      </table>
      <p style="margin-top:12px;">Review this condition in the Admin Panel → Users → Conditions section.</p>
    `,
    settings
  );
}

/**
 * Send an admin password reset link email. Used by:
 *   • the public /auth/forgot-password endpoint, and
 *   • the super-admin "Send reset link" action in the admin user mgmt UI.
 *
 * Falls back to console logging when SMTP is not configured so local
 * development still surfaces the link to the operator.
 */
export async function sendAdminPasswordResetLinkEmail(
  to: string,
  options: {
    resetUrl: string;
    recipientName?: string;
    expiresAt: Date;
    settings?: Record<string, string>;
  }
): Promise<{ sent: boolean; reason?: string }> {
  const { resetUrl, recipientName, expiresAt, settings } = options;
  const appName = settings?.["app_name"] ?? "AJKMart";
  const subject = `${appName} admin password reset`;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hello,";
  const expiresIso = expiresAt.toISOString();
  const expiresMinutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));

  const tr = settings ? buildTransporterFromSettings(settings) : null;
  const transport = tr || getEnvTransporter();

  if (!transport) {
    logger.info(`[EMAIL] (SMTP not configured) Admin password reset link for ${to}`);
    logger.info(`[EMAIL]   ${resetUrl}`);
    logger.info(`[EMAIL]   expires at ${expiresIso}`);
    return { sent: false, reason: "SMTP not configured" };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #111827;">
      <h2 style="color:#111827;">${appName} admin account</h2>
      <p>${greeting}</p>
      <p>We received a request to reset the password for your ${appName} admin account.
         Click the button below to choose a new password. This link will expire in
         <strong>${expiresMinutes} minute${expiresMinutes === 1 ? "" : "s"}</strong> and can only
         be used once.</p>
      <p style="text-align:center; margin: 28px 0;">
        <a href="${resetUrl}" style="background:#111827;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block;">
          Reset your password
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280;">
        If the button does not work, copy and paste this URL into your browser:<br/>
        <span style="word-break:break-all;">${resetUrl}</span>
      </p>
      <p style="font-size:12px;color:#9ca3af;">
        If you did not request a password reset you can safely ignore this email — your
        password will remain unchanged.
      </p>
    </div>
  `;

  const text = [
    `${greeting}`,
    "",
    `We received a request to reset the password for your ${appName} admin account.`,
    `Open the link below within ${expiresMinutes} minute(s) to choose a new password:`,
    "",
    resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  try {
    await transport.sendMail({
      from: resolveFrom(settings),
      to,
      subject,
      html,
      text,
    });
    return { sent: true };
  } catch (err: any) {
    logger.error(`[EMAIL] Failed to send admin reset link to ${to}:`, err?.message);
    return { sent: false, reason: err?.message };
  }
}

/**
 * Notify an admin that their password was changed outside the normal
 * in-app flow — i.e. somebody (typically an operator running a SQL
 * UPDATE for account recovery) rewrote the `admin_accounts.secret`
 * value directly. Surfaced by the startup watchdog
 * (`detectAndNotifyOutOfBandPasswordResets`).
 *
 * The email is intentionally short, action-oriented, and does not echo
 * the new password. We cannot know the originating IP of a direct DB
 * write, so the alert states the source as "directly in the database"
 * and gives the timestamp at which the change was detected by the
 * application so the admin can correlate against operator activity.
 *
 * Falls back to console logging when SMTP is not configured.
 */
export async function sendAdminPasswordOutOfBandResetEmail(
  to: string,
  options: {
    recipientName?: string | null;
    detectedAt: Date;
    previousChangedAt?: Date | null;
    settings?: Record<string, string>;
  }
): Promise<{ sent: boolean; reason?: string }> {
  const { recipientName, detectedAt, previousChangedAt, settings } = options;
  const appName = settings?.["app_name"] ?? "AJKMart";
  const subject = `[${appName}] Your admin password was changed from the database`;
  const greeting = recipientName ? `Hi ${recipientName},` : "Hello,";
  const detectedIso = detectedAt.toISOString();
  const previousIso = previousChangedAt ? previousChangedAt.toISOString() : "unknown";

  const tr = settings ? buildTransporterFromSettings(settings) : null;
  const transport = tr || getEnvTransporter();

  if (!transport) {
    logger.info(`[EMAIL] (SMTP not configured) Out-of-band admin password reset alert for ${to}`);
    logger.info(`[EMAIL]   detectedAt:        ${detectedIso}`);
    logger.info(`[EMAIL]   previousChangedAt: ${previousIso}`);
    return { sent: false, reason: "SMTP not configured" };
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827;">
      <h2 style="color:#b91c1c;">⚠ Security alert: your ${appName} admin password was changed</h2>
      <p>${greeting}</p>
      <p>
        We detected that the password on your <strong>${appName}</strong> admin account was
        changed <strong>directly in the database</strong> — not through the in-app
        forgot-password link, not through the change-password screen, and not through any
        super-admin "send reset link" action.
      </p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding:6px 0; color:#6b7280; width:200px;">Source</td>
          <td style="padding:6px 0; font-weight:bold;">Direct database write (e.g. operator SQL update)</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#6b7280;">Detected at</td>
          <td style="padding:6px 0; font-family:monospace;">${detectedIso}</td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#6b7280;">Previous change on file</td>
          <td style="padding:6px 0; font-family:monospace;">${previousIso}</td>
        </tr>
      </table>
      <p>
        <strong>If you (or another administrator) requested account recovery just now, no further action is needed</strong> —
        sign in with the new password and change it from the admin panel.
      </p>
      <p>
        <strong>If this was not you</strong>, treat your account as compromised:
      </p>
      <ol>
        <li>Sign in with the new password and immediately change it from the admin panel.</li>
        <li>Review recent activity in <em>Admin → Security → Audit log</em>.</li>
        <li>Notify the platform owner so the database operator can be audited.</li>
      </ol>
      <p style="font-size:12px;color:#9ca3af;">
        This is an automated security notification. It is sent once per detected
        out-of-band password change.
      </p>
    </div>
  `;

  const text = [
    greeting,
    "",
    `We detected that the password on your ${appName} admin account was changed`,
    "directly in the database, not through the in-app password flow.",
    "",
    `Source:                  Direct database write (operator SQL update)`,
    `Detected at:             ${detectedIso}`,
    `Previous change on file: ${previousIso}`,
    "",
    "If you requested account recovery, sign in with the new password and",
    "change it from the admin panel.",
    "",
    "If this was not you, treat your account as compromised: sign in,",
    "change the password immediately, review the admin audit log, and",
    "notify the platform owner.",
  ].join("\n");

  try {
    await transport.sendMail({
      from: resolveFrom(settings),
      to,
      subject,
      html,
      text,
    });
    return { sent: true };
  } catch (err: any) {
    logger.error(`[EMAIL] Failed to send out-of-band reset alert to ${to}:`, err?.message);
    return { sent: false, reason: err?.message };
  }
}

/* ── Registration approval / rejection emails ── */

export async function sendApprovalEmail(
  to: string,
  name: string | null | undefined,
  role: string,
  settings: Record<string, string>
): Promise<EmailResult> {
  const tr = buildTransporterFromSettings(settings);
  const transport = tr || getEnvTransporter();
  const appName = settings["app_name"]?.trim() || "AJKMart";
  const roleName = role === "rider" ? "Rider" : role === "vendor" ? "Vendor" : "Account";
  const greeting = name ? `Dear ${name}` : "Hello";

  const subject = `Your ${roleName} Registration is Approved — ${appName}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#10B981;">Congratulations! Your registration is approved.</h2>
      <p>${greeting},</p>
      <p>Great news! Your <strong>${roleName}</strong> registration on <strong>${appName}</strong> has been reviewed and <strong style="color:#10B981;">approved</strong>.</p>
      <p>You can now log in to the app and start using your account.</p>
      <p style="color:#6b7280;font-size:13px;">If you have any questions, please contact our support team.</p>
      <p>Welcome aboard!<br/><strong>${appName} Team</strong></p>
    </div>
  `;
  const text = `${greeting},\n\nYour ${roleName} registration on ${appName} has been approved. You can now log in to the app.\n\nWelcome aboard!\n${appName} Team`;

  if (!transport) {
    logger.info(`[EMAIL] Approval email for ${to} — SMTP not configured. ${text}`);
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    await transport.sendMail({ from: resolveFrom(settings), to, subject, html, text });
    logger.info(`[EMAIL] Approval email sent to ${to}`);
    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[EMAIL] Failed to send approval email to ${to}: ${msg}`);
    return { sent: false, error: msg };
  }
}

export async function sendRejectionEmail(
  to: string,
  name: string | null | undefined,
  role: string,
  reason: string,
  settings: Record<string, string>
): Promise<EmailResult> {
  const tr = buildTransporterFromSettings(settings);
  const transport = tr || getEnvTransporter();
  const appName = settings["app_name"]?.trim() || "AJKMart";
  const roleName = role === "rider" ? "Rider" : role === "vendor" ? "Vendor" : "Account";
  const greeting = name ? `Dear ${name}` : "Hello";

  const subject = `Your ${roleName} Registration Status — ${appName}`;
  const reasonLine = reason ? `<p><strong>Reason:</strong> ${reason}</p>` : "";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#EF4444;">Registration Not Approved</h2>
      <p>${greeting},</p>
      <p>We have reviewed your <strong>${roleName}</strong> registration on <strong>${appName}</strong> and unfortunately we are unable to approve it at this time.</p>
      ${reasonLine}
      <p>If you believe this is a mistake or would like to provide additional information, please contact our support team.</p>
      <p>Thank you for your interest in ${appName}.<br/><strong>${appName} Team</strong></p>
    </div>
  `;
  const reasonText = reason ? `\nReason: ${reason}` : "";
  const text = `${greeting},\n\nYour ${roleName} registration on ${appName} could not be approved.${reasonText}\n\nPlease contact support if you have questions.\n${appName} Team`;

  if (!transport) {
    logger.info(`[EMAIL] Rejection email for ${to} — SMTP not configured. ${text}`);
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    await transport.sendMail({ from: resolveFrom(settings), to, subject, html, text });
    logger.info(`[EMAIL] Rejection email sent to ${to}`);
    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[EMAIL] Failed to send rejection email to ${to}: ${msg}`);
    return { sent: false, error: msg };
  }
}

/* ── KYC approval / rejection / resubmit emails sent to the user ── */

export async function sendKycApprovalEmail(
  to: string,
  name: string | null | undefined,
  settings: Record<string, string>
): Promise<EmailResult> {
  if (!isEmailProviderConfigured(settings)) {
    logger.info(
      `[EMAIL] KYC approval email for ${to} — email integration disabled or SMTP not configured`
    );
    return { sent: false, reason: "Email integration disabled or SMTP not configured" };
  }

  const tr = buildTransporterFromSettings(settings);
  const transport = tr || getEnvTransporter();
  const appName = settings["app_name"]?.trim() || "AJKMart";
  const greeting = name ? `Dear ${name}` : "Hello";
  const subject = `Your KYC Verification is Approved — ${appName}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#10B981;">✅ KYC Verified Successfully</h2>
      <p>${greeting},</p>
      <p>Great news! Your identity verification (KYC) on <strong>${appName}</strong> has been reviewed and <strong style="color:#10B981;">approved</strong>.</p>
      <p>Your account is now fully verified. You can access all features of the platform without any restrictions.</p>
      <p style="color:#6b7280;font-size:13px;">If you have any questions, please contact our support team.</p>
      <p>Thank you for verifying your identity.<br/><strong>${appName} Team</strong></p>
    </div>
  `;
  const text = `${greeting},\n\nYour KYC verification on ${appName} has been approved. Your account is now fully verified.\n\nThank you!\n${appName} Team`;

  if (!transport) {
    logger.info(`[EMAIL] KYC approval email for ${to} — SMTP not configured`);
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    await transport.sendMail({ from: resolveFrom(settings), to, subject, html, text });
    logger.info(`[EMAIL] KYC approval email sent to ${to}`);
    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[EMAIL] Failed to send KYC approval email to ${to}: ${msg}`);
    return { sent: false, error: msg };
  }
}

export async function sendKycRejectionEmail(
  to: string,
  name: string | null | undefined,
  reason: string,
  settings: Record<string, string>
): Promise<EmailResult> {
  if (!isEmailProviderConfigured(settings)) {
    logger.info(
      `[EMAIL] KYC rejection email for ${to} — email integration disabled or SMTP not configured`
    );
    return { sent: false, reason: "Email integration disabled or SMTP not configured" };
  }

  const tr = buildTransporterFromSettings(settings);
  const transport = tr || getEnvTransporter();
  const appName = settings["app_name"]?.trim() || "AJKMart";
  const greeting = name ? `Dear ${name}` : "Hello";
  const subject = `KYC Verification Update — ${appName}`;
  const reasonLine = reason ? `<p><strong>Reason:</strong> ${reason}</p>` : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#EF4444;">⚠️ KYC Verification Not Approved</h2>
      <p>${greeting},</p>
      <p>We have reviewed your identity verification (KYC) submission on <strong>${appName}</strong> and were unable to approve it at this time.</p>
      ${reasonLine}
      <p>Please resubmit your KYC with the correct documents. If you need help, contact our support team.</p>
      <p>Thank you for your patience.<br/><strong>${appName} Team</strong></p>
    </div>
  `;
  const reasonText = reason ? `\nReason: ${reason}` : "";
  const text = `${greeting},\n\nYour KYC verification on ${appName} could not be approved.${reasonText}\n\nPlease resubmit with correct documents. Contact support if you need help.\n${appName} Team`;

  if (!transport) {
    logger.info(`[EMAIL] KYC rejection email for ${to} — SMTP not configured`);
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    await transport.sendMail({ from: resolveFrom(settings), to, subject, html, text });
    logger.info(`[EMAIL] KYC rejection email sent to ${to}`);
    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[EMAIL] Failed to send KYC rejection email to ${to}: ${msg}`);
    return { sent: false, error: msg };
  }
}

export async function sendKycResubmitEmail(
  to: string,
  name: string | null | undefined,
  reason: string,
  settings: Record<string, string>
): Promise<EmailResult> {
  if (!isEmailProviderConfigured(settings)) {
    logger.info(
      `[EMAIL] KYC resubmit email for ${to} — email integration disabled or SMTP not configured`
    );
    return { sent: false, reason: "Email integration disabled or SMTP not configured" };
  }

  const tr = buildTransporterFromSettings(settings);
  const transport = tr || getEnvTransporter();
  const appName = settings["app_name"]?.trim() || "AJKMart";
  const greeting = name ? `Dear ${name}` : "Hello";
  const subject = `Action Required: Resubmit Your KYC — ${appName}`;
  const reasonLine = reason ? `<p><strong>What needs to be fixed:</strong> ${reason}</p>` : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">
      <h2 style="color:#F59E0B;">📋 Please Resubmit Your KYC Documents</h2>
      <p>${greeting},</p>
      <p>Our team has reviewed your identity verification (KYC) on <strong>${appName}</strong> and needs you to resubmit with updated documents.</p>
      ${reasonLine}
      <p>Please open the app and resubmit your KYC with the corrections noted above.</p>
      <p>Thank you for your cooperation.<br/><strong>${appName} Team</strong></p>
    </div>
  `;
  const reasonText = reason ? `\nWhat needs to be fixed: ${reason}` : "";
  const text = `${greeting},\n\nPlease resubmit your KYC on ${appName}.${reasonText}\n\nOpen the app to resubmit. Contact support if you need help.\n${appName} Team`;

  if (!transport) {
    logger.info(`[EMAIL] KYC resubmit email for ${to} — SMTP not configured`);
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    await transport.sendMail({ from: resolveFrom(settings), to, subject, html, text });
    logger.info(`[EMAIL] KYC resubmit email sent to ${to}`);
    return { sent: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[EMAIL] Failed to send KYC resubmit email to ${to}: ${msg}`);
    return { sent: false, error: msg };
  }
}

/* ── Generic transactional email sender (env-var SMTP only) ── */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailResult> {
  const transport = getEnvTransporter();
  if (!transport) {
    logger.info(
      `[Email:generic] SMTP not configured — logging only. To: ${input.to} | Subject: ${input.subject}`
    );
    return { sent: false, reason: "SMTP not configured" };
  }
  try {
    await transport.sendMail({
      from: resolveFrom(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    logger.info(`[Email:generic] Sent to ${input.to} | Subject: ${input.subject}`);
    return { sent: true };
  } catch (err: any) {
    logger.error(`[Email:generic] Failed to send to ${input.to}:`, err?.message);
    return { sent: false, error: err?.message };
  }
}
