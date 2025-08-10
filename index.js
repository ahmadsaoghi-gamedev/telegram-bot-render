require('dotenv').config({ path: '.env.bot' }); // Load environment variables
const TelegramBot = require('node-telegram-bot-api');
const http = require('http'); // For creating the HTTP server

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN env is missing. Please set it in .env.bot');
  process.exit(1); // Exit if token is not set
}

const bot = new TelegramBot(token, { polling: false }); // Still using polling: false for webhook

// /start command handler
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

// callback_query handler
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

// message handler
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

// Create HTTP server to handle webhooks
const PORT = process.env.PORT || 3000; // Use PORT from env or default to 3000

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') { // Telegram sends updates to /webhook
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', async () => {
      try {
        const update = JSON.parse(body);
        await bot.processUpdate(update);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      } catch (error) {
        console.error('Error processing update:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Bot server listening on port ${PORT}`);
  console.log(`Webhook URL: YOUR_SERVER_URL/webhook`); // User needs to set this webhook URL
});

// Error handling for the server
server.on('error', (error) => {
  console.error('HTTP server error:', error);
});
