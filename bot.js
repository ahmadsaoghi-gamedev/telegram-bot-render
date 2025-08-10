// api/bot.js
const TelegramBot = require('node-telegram-bot-api');

let bot;
function getBot() {
  if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN env is missing');
  if (!bot) {
    bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });

    // /start
    bot.onText(/^\/start(?:\s(.+))?/, async (msg) => {
      const chatId = msg.chat.id;

      // pastikan tidak ada reply keyboard yang nyangkut
      await bot.sendMessage(chatId, ' ', { reply_markup: { remove_keyboard: true } }).catch(() => { });

      const text =
        `👋 *Selamat Datang!*

_PASTIKAN TELEGRAM SUDAH VERSI TERBARU SAAT MENGGUNAKAN BOT INI UNTUK PENGALAMAN YANG LEBIH BAIK!_

Tekan tombol di bawah untuk membuka aplikasi dan mulai menjelajahi ribuan konten menarik.

_untuk informasi dan diskusi periksa grup resmi!_

SHReels`;

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ 
              text: '📱 Buka Aplikasi', 
              web_app: { url: 'https://tele-stream-wizard.vercel.app/' } 
            }],
            [{ 
              text: '🔎 Cari Judul', 
              callback_data: 'cari' 
            }],
            [
              { 
                text: '👥 Grup Resmi', 
                url: 'https://t.me/+GABRA-_0qvhiMjc1' 
              },
              { 
                text: '📦 Bahan Konten', 
                url: 'https://t.me/+mgUNj7DLFF5lMDQ1' 
              }
            ],
            [{ 
              text: '🔁 RESTART', 
              callback_data: 'restart' 
            }]
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
        // kirim ulang tampilan start
        const startMsg = { chat: { id: chatId }, text: '/start' };
        bot.emit('message', startMsg);
      }
    });

    bot.on('message', (m) => {
      if (!m.text || m.text.startsWith('/')) return;
      
      // Kirim hasil pencarian dengan tombol webapp
      bot.sendMessage(m.chat.id, `Hasil untuk: *${m.text}*\n\nBuka aplikasi untuk melihat hasil lengkap:`, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ 
              text: '📱 Lihat Hasil di App', 
              web_app: { url: `https://tele-stream-wizard.vercel.app/?search=${encodeURIComponent(m.text)}` } 
            }],
            [{ 
              text: '🔙 Kembali ke Menu', 
              callback_data: 'restart' 
            }]
          ]
        }
      });
    });
  }
  return bot;
}

// baca body tanpa micro
async function readBody(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const raw = await readBody(req);
    const update = JSON.parse(raw || '{}');

    const bot = getBot();
    await bot.processUpdate(update);

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing update:', error);
    res.status(500).send('Internal Server Error');
  }
};
