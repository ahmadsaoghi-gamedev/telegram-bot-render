// server.js (CommonJS)
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('Missing BOT_TOKEN');

const bot = new TelegramBot(token, { polling: false });

const app = express();
app.use(express.json()); // body JSON

bot.onText(/^\/start(?:\\s(.+))?/, async (msg) => {
  const text =
`👋 *Selamat Datang!*

_PASTIKAN TELEGRAM SUDAH VERSI TERBARU SAAT MENGGUNAKAN BOT INI UNTUK PENGALAMAN YANG LEBIH BAIK!_

Tekan tombol di bawah untuk membuka aplikasi dan mulai menjelajahi ribuan konten menarik.

_untuk informasi dan diskusi periksa grup resmi!_

GGReels`;
  await bot.sendMessage(msg.chat.id, text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Buka Aplikasi', web_app: { url: 'https://tele-stream-wizard.vercel.app/' } }],
        [{ text: '🔎 Cari Judul', callback_data: 'cari' }],
        [
          { text: '👥 Grup Resmi', url: 'https://t.me/your_group' },
          { text: '📦 Bahan Konten', url: 'https://your-site/resources' }
        ],
        [{ text: '🔁 RESTART', callback_data: 'restart' }]
      ]
    }
  });
});

bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  if (q.data === 'cari') {
    await bot.answerCallbackQuery(q.id);
    await bot.sendMessage(chatId, 'Ketik judul yang ingin dicari…');
  }
  if (q.data === 'restart') {
    await bot.answerCallbackQuery(q.id, { text: 'Memulai ulang…' });
    bot.emit('text', { chat: { id: chatId }, text: '/start' });
  }
});

app.get('/', (req,res)=>res.send('OK'));
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Listening on', PORT));
