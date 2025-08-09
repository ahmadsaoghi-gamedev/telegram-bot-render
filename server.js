// server.js (CommonJS) — Render Web Service + Webhook
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('Missing BOT_TOKEN');

const bot = new TelegramBot(token, { polling: false });
const app = express();
app.use(express.json());

// helper kirim tampilan utama
async function sendWelcome(chatId) {
  const text = `
<b>👋 Selamat Datang!</b>

<i>PASTIKAN TELEGRAM SUDAH VERSI TERBARU SAAT MENGGUNAKAN BOT INI UNTUK PENGALAMAN YANG LEBIH BAIK!</i>

Tekan tombol di bawah untuk membuka aplikasi dan mulai menjelajahi ribuan konten menarik.

<i>untuk informasi dan diskusi periksa grup resmi!</i>

SHReels`;
  return bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Buka Aplikasi', web_app: { url: 'https://tele-stream-wizard.vercel.app/' } }],
        [{ text: '🔍 Cari Judul', callback_data: 'cari' }],
        [
          { text: '👥 Grup Resmi', callback_data: 'grup' },
          { text: '📦 Bahan Konten', callback_data: 'bahan' }
        ],
        [{ text: '🔁 RESTART', callback_data: 'restart' }]
      ]
    }
  });
}

// /start
bot.onText(/^\/start(?:\s(.+))?/, async (msg) => {
  await sendWelcome(msg.chat.id);
});

// actions
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;

  if (q.data === 'cari') {
    await bot.answerCallbackQuery(q.id);
    return bot.sendMessage(
      chatId,
      '🔍 <b>Cari Judul</b>\n\nKetik judul film atau series yang ingin dicari…',
      { parse_mode: 'HTML' }
    );
  }

  if (q.data === 'grup') {
    await bot.answerCallbackQuery(q.id);
    return bot.sendMessage(
      chatId,
      '👥 <b>Grup Resmi</b>\n\nBergabunglah dengan komunitas kami untuk diskusi dan update terbaru!\n\n🔗 Link: https://t.me/+GABRA-_0qvhiMjc1',
      {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: '👥 Join Grup Resmi', url: 'https://t.me/+GABRA-_0qvhiMjc1' }],
            [{ text: '🔙 Kembali', callback_data: 'restart' }]
          ]
        }
      }
    );
  }

  if (q.data === 'bahan') {
    await bot.answerCallbackQuery(q.id);
    return bot.sendMessage(
      chatId,
      '📦 <b>Bahan Konten</b>\n\nAkses koleksi lengkap konten premium dan eksklusif!\n\n🔗 Link: https://t.me/+mgUNj7DLFF5lMDQ1',
      {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [{ text: '📦 Akses Bahan Konten', url: 'https://t.me/+mgUNj7DLFF5lMDQ1' }],
            [{ text: '🔙 Kembali', callback_data: 'restart' }]
          ]
        }
      }
    );
  }

  if (q.data === 'restart') {
    await bot.answerCallbackQuery(q.id, { text: 'Memulai ulang…' });
    return sendWelcome(chatId);
  }
});

// webhook endpoints
app.get('/', (_req, res) => res.send('OK'));
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Listening on', PORT));
