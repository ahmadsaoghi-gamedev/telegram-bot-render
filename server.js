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

SHReels`;
  await bot.sendMessage(msg.chat.id, text, {
    parse_mode: 'Markdown',
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
});

bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  
  if (q.data === 'cari') {
    await bot.answerCallbackQuery(q.id);
    await bot.sendMessage(chatId, '🔍 *Cari Judul*\n\nKetik judul film atau series yang ingin dicari…', {
      parse_mode: 'Markdown'
    });
  }
  
  if (q.data === 'grup') {
    await bot.answerCallbackQuery(q.id);
    await bot.sendMessage(chatId, '👥 *Grup Resmi*\n\nBergabunglah dengan komunitas kami untuk diskusi dan update terbaru!\n\n🔗 Link: https://t.me/+GABRA-_0qvhiMjc1', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '👥 Join Grup Resmi', url: 'https://t.me/+GABRA-_0qvhiMjc1' }],
          [{ text: '🔙 Kembali', callback_data: 'restart' }]
        ]
      }
    });
  }
  
  if (q.data === 'bahan') {
    await bot.answerCallbackQuery(q.id);
    await bot.sendMessage(chatId, '📦 *Bahan Konten*\n\nAkses koleksi lengkap konten premium dan eksklusif!\n\n🔗 Link: https://t.me/+mgUNj7DLFF5lMDQ1', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📦 Akses Bahan Konten', url: 'https://t.me/+mgUNj7DLFF5lMDQ1' }],
          [{ text: '🔙 Kembali', callback_data: 'restart' }]
        ]
      }
    });
  }
  
  if (q.data === 'restart') {
    await bot.answerCallbackQuery(q.id, { text: 'Memulai ulang…' });
    // Trigger start command
    const startMsg = {
      chat: { id: chatId },
      text: '/start'
    };
    bot.emit('text', startMsg);
  }
});

app.get('/', (req,res)=>res.send('OK'));
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Listening on', PORT));

