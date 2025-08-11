// api/bot.js
let TelegramBot;

try {
  TelegramBot = require('node-telegram-bot-api');
} catch (error) {
  console.error('Failed to require node-telegram-bot-api:', error);
  throw error;
}

let bot;

function initBot() {
  if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN environment variable is required');
  }
  
  if (bot) return bot;
  
  bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
  
  // Setup handlers
  setupHandlers();
  
  return bot;
}

function setupHandlers() {
  // Start command handler
  bot.onText(/^\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    const text = `👋 *Selamat Datang!*

_PASTIKAN TELEGRAM SUDAH VERSI TERBARU SAAT MENGGUNAKAN BOT INI UNTUK PENGALAMAN YANG LEBIH BAIK!_

Tekan tombol di bawah untuk membuka aplikasi dan mulai menjelajahi ribuan konten menarik.

_untuk informasi dan diskusi periksa grup resmi!_

SHReels`;

    const options = {
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
    };

    try {
      await bot.sendMessage(chatId, text, options);
    } catch (error) {
      console.error('Error sending start message:', error);
      // Fallback without webapp
      await bot.sendMessage(chatId, 'Bot aktif! Silakan coba lagi.');
    }
  });

  // Callback query handler
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
      await bot.answerCallbackQuery(query.id);

      if (data === 'cari') {
        await bot.sendMessage(chatId, 'Ketik judul yang ingin dicari…');
      } else if (data === 'restart') {
        // Simulate /start command
        const fakeMsg = {
          chat: { id: chatId },
          text: '/start'
        };
        bot.emit('text', fakeMsg, ['/start']);
      }
    } catch (error) {
      console.error('Error handling callback query:', error);
    }
  });

  // Regular message handler
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const searchTerm = msg.text;

    try {
      const responseText = `Hasil untuk: *${searchTerm}*\n\nBuka aplikasi untuk melihat hasil lengkap:`;
      const options = {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ 
              text: '📱 Lihat Hasil di App', 
              web_app: { 
                url: `https://tele-stream-wizard.vercel.app/?search=${encodeURIComponent(searchTerm)}` 
              } 
            }],
            [{ 
              text: '🔙 Kembali ke Menu', 
              callback_data: 'restart' 
            }]
          ]
        }
      };

      await bot.sendMessage(chatId, responseText, options);
    } catch (error) {
      console.error('Error handling message:', error);
      await bot.sendMessage(chatId, `Mencari: ${searchTerm}...`);
    }
  });
}

// Request body reader
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Main handler function
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Initialize bot
    const botInstance = initBot();
    
    // Read and parse request body
    const body = await readBody(req);
    const update = JSON.parse(body || '{}');
    
    // Process the update
    await botInstance.processUpdate(update);
    
    // Return success
    res.status(200).json({ status: 'ok' });
    
  } catch (error) {
    console.error('Webhook error:', error);
    
    // Return detailed error for debugging
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
