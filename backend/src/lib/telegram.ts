import TelegramBot from 'node-telegram-bot-api';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const POLLING = process.env.TELEGRAM_POLLING !== 'false';
let bot: TelegramBot | null = null;

export function isTelegramConfigured(): boolean {
  return !!TOKEN;
}

export function getTelegramBot(): TelegramBot | null {
  if (!TOKEN) return null;
  if (!bot) {
    bot = new TelegramBot(TOKEN, { polling: POLLING });
    bot.on('polling_error', (err) => {
      console.error('Telegram polling error:', err.message);
    });
  }
  return bot;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const b = getTelegramBot();
  if (!b) return false;
  try {
    await b.sendMessage(chatId, text, { parse_mode: 'HTML' });
    return true;
  } catch (err) {
    console.error('Telegram send error:', err);
    return false;
  }
}

export function formatTelegramNotification(title: string, message: string, link?: string): string {
  const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
  let text = `<b>${title}</b>\n${message}`;
  if (link) text += `\n\n<a href="${appUrl}${link}">Открыть</a>`;
  return text;
}
