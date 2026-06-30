import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { isEmailConfigured } from '../lib/email.js';
import { isTelegramConfigured } from '../lib/telegram.js';
import { isMinioConfigured } from '../lib/storage.js';

const router = Router();

router.use(authenticate);

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

router.get('/integrations', async (_req: AuthRequest, res) => {
  res.json({
    email: isEmailConfigured(),
    telegram: isTelegramConfigured(),
    minio: isMinioConfigured(),
  });
});

router.get('/telegram', async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { telegramChatId: true, telegramLinkCode: true },
    });
    res.json({
      linked: !!user?.telegramChatId,
      linkCode: user?.telegramLinkCode,
      botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/telegram/link-code', async (req: AuthRequest, res, next) => {
  try {
    const code = generateCode();
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { telegramLinkCode: code },
    });
    res.json({ code, botUsername: process.env.TELEGRAM_BOT_USERNAME });
  } catch (err) {
    next(err);
  }
});

router.delete('/telegram', async (req: AuthRequest, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { telegramChatId: null, telegramLinkCode: null },
    });
    res.json({ message: 'Telegram отключён' });
  } catch (err) {
    next(err);
  }
});

export default router;
