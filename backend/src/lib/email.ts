import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM ?? 'RPS Task Manager <noreply@rps.local>';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER) return null;
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

export function isEmailConfigured(): boolean {
  return !!SMTP_HOST && !!SMTP_USER && !!SMTP_PASS;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) return false;

  try {
    await transport.sendMail({ from: SMTP_FROM, to, subject, html });
    return true;
  } catch (err) {
    console.error('Email send error:', err);
    return false;
  }
}

export function buildNotificationEmail(title: string, message: string, link?: string): string {
  const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
  const fullLink = link ? `${appUrl}${link}` : appUrl;
  const body = message.replace(/\n/g, '<br/>');
  return `
    <div style="font-family:sans-serif;max-width:480px">
      <h2 style="color:#3B82F6">${title}</h2>
      <p>${body}</p>
      ${link ? `<p><a href="${fullLink}" style="color:#3B82F6">Открыть в системе</a></p>` : ''}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="color:#999;font-size:12px">RPS Task Manager</p>
    </div>
  `;
}

interface DigestTask {
  title: string;
  dueDate: string;
  assignee: string;
  link: string;
}

export function buildDigestEmail(data: {
  firstName: string;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  inProgress: number;
  overdueTasks: DigestTask[];
}): string {
  const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
  const overdueRows = data.overdueTasks
    .map(
      (t) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee"><a href="${appUrl}${t.link}">${t.title}</a></td>
          <td style="padding:8px;border-bottom:1px solid #eee">${t.dueDate}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${t.assignee}</td>
        </tr>`,
    )
    .join('');

  return `
    <div style="font-family:sans-serif;max-width:560px">
      <h2 style="color:#3B82F6">Ежедневная сводка</h2>
      <p>Здравствуйте, ${data.firstName}!</p>
      <ul>
        <li><b>Просрочено:</b> ${data.overdue}</li>
        <li><b>Срок сегодня:</b> ${data.dueToday}</li>
        <li><b>На этой неделе:</b> ${data.dueThisWeek}</li>
        <li><b>В работе:</b> ${data.inProgress}</li>
      </ul>
      ${
        data.overdueTasks.length
          ? `<h3 style="font-size:14px">Просроченные задачи</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#f3f4f6">
          <th style="padding:8px;text-align:left">Задача</th>
          <th style="padding:8px;text-align:left">Срок</th>
          <th style="padding:8px;text-align:left">Исполнитель</th>
        </tr>
        ${overdueRows}
      </table>`
          : ''
      }
      <p style="margin-top:24px"><a href="${appUrl}/dashboard" style="color:#3B82F6">Открыть дашборд</a></p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
      <p style="color:#999;font-size:12px">RPS Task Manager</p>
    </div>
  `;
}
