import { prisma } from './prisma.js';
import { getTelegramBot, isTelegramConfigured } from './telegram.js';

export function initTelegramBot() {
  if (!isTelegramConfigured()) {
    console.log('Telegram Bot: не настроен (TELEGRAM_BOT_TOKEN)');
    return;
  }

  const bot = getTelegramBot();
  if (!bot) return;

  bot.onText(/\/start/, async (msg) => {
    const chatId = String(msg.chat.id);
    await bot!.sendMessage(
      chatId,
      '👋 Добро пожаловать в RPS Task Manager Bot!\n\nДля привязки аккаунта:\n1. Откройте Настройки в веб-приложении\n2. Нажмите «Получить код»\n3. Отправьте команду:\n/link ВАШ_КОД',
    );
  });

  bot.onText(/\/link (.+)/, async (msg, match) => {
    const chatId = String(msg.chat.id);
    const code = match?.[1]?.trim().toUpperCase();

    if (!code) {
      await bot!.sendMessage(chatId, '❌ Укажите код: /link ВАШ_КОД');
      return;
    }

    const user = await prisma.user.findFirst({ where: { telegramLinkCode: code } });
    if (!user) {
      await bot!.sendMessage(chatId, '❌ Неверный или просроченный код. Получите новый в настройках.');
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramLinkCode: null },
    });

    await bot!.sendMessage(
      chatId,
      `✅ Аккаунт привязан!\n${user.firstName} ${user.lastName}\n\nТеперь вы будете получать уведомления о задачах.`,
    );
  });

  console.log('Telegram Bot: запущен');
}
