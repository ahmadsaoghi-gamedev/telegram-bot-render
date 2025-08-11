// index.js - Railway deployment
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN environment variable is required');
  process.exit(1);
}

// Initialize bot (webhook mode for production)
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Helper function to send welcome message
async function sendWelcomeMessage(chatId) {
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
    console.log(`Welcome message sent to chat: ${chatId}`);
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
}

// Bot handlers
bot.onText(/^\/start(?:\s(.+))?/, async (msg) => {
  const chatId = msg.chat.id;
  console.log(`/start command received from chat: ${chatId}`);
  
  try {
    // Clear any previous keyboard
    await bot.sendMessage(chatId, ' ', { 
      reply_markup: { remove_keyboard: true } 
    }).catch(() => {});
    
    await sendWelcomeMessage(chatId);
  } catch (error) {
    console.error('Error handling /start command:', error);
  }
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  console.log(`Callback query received: ${data} from chat: ${chatId}`);
  
  try {
    await bot.answerCallbackQuery(query.id);
    
    switch (data) {
      case 'cari':
        await bot.sendMessage(chatId, 'Ketik judul yang ingin dicari…');
        break;
        
      case 'restart':
        await bot.answerCallbackQuery(query.id, { text: 'Memulai ulang…' });
        await sendWelcomeMessage(chatId);
        break;
        
      default:
        console.log(`Unknown callback data: ${data}`);
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
  }
});

// Handle regular messages (search functionality)
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const searchTerm = msg.text;
  
  console.log(`Search query received: "${searchTerm}" from chat: ${chatId}`);
  
  try {
    const responseText = `Hasil untuk: *${searchTerm}*

Buka aplikasi untuk melihat hasil lengkap:`;

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
    // Fallback message
    try {
      await bot.sendMessage(chatId, `Mencari: ${searchTerm}...`);
    } catch (fallbackError) {
      console.error('Error sending fallback message:', fallbackError);
    }
  }
});

// Error handling
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Express routes
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Telegram Bot is running',
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
  console.log('Webhook received:', JSON.stringify(req.body, null, 2));
  
  try {
    bot.processUpdate(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error processing update');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Bot server is running on port ${PORT}`);
  console.log(`📡 Webhook URL: https://telegram-bot-render-production.up.railway.app/webhook`);
  console.log(`🤖 Bot token configured: ${BOT_TOKEN ? 'Yes' : 'No'}`);
  
  // Log environment info
  console.log('Environment info:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: PORT,
    BOT_TOKEN_SET: !!BOT_TOKEN
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

