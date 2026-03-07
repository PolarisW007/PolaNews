import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'WorldOverview <noreply@worldoverview.app>';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!SMTP_HOST || !SMTP_USER) {
    console.warn('[Email] SMTP not configured');
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendDigestEmail(
  to: string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html: htmlContent,
    });
    return true;
  } catch (e) {
    console.error('[Email] Send failed:', e);
    return false;
  }
}

export async function sendBreakingNewsAlert(
  to: string,
  title: string,
  summary: string,
  articleUrl: string
): Promise<boolean> {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0A0F0D; color: #E0F2E9; padding: 24px; border-radius: 12px;">
      <h2 style="color: #00E676; margin-bottom: 16px;">🔴 突发新闻</h2>
      <h3 style="margin-bottom: 8px;">${title}</h3>
      <p style="color: #8FA89B; line-height: 1.6;">${summary}</p>
      <a href="${articleUrl}" style="display: inline-block; margin-top: 16px; padding: 10px 20px; background: #00E676; color: #0A0F0D; text-decoration: none; border-radius: 8px; font-weight: 600;">阅读原文</a>
      <hr style="border: 1px solid #1E3A2F; margin: 24px 0;">
      <p style="color: #3E5248; font-size: 12px;">一念三千 · 全球资讯AI聚合阅读平台</p>
    </div>
  `;
  return sendDigestEmail(to, `[突发] ${title}`, html);
}
