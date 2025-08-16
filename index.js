const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'https://testelegramwebapp.vercel.app',
    'https://testelegramwebapp.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://otmeyqginakxlyphlrrt.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Telegram Bot Token
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBAPP_URL = 'https://testelegramwebapp.vercel.app';

// Bot Commands
const BOT_COMMANDS = {
  start: {
    message: `👋 *Selamat Datang!*

_PASTIKAN TELEGRAM SUDAH VERSI TERBARU SAAT MENGGUNAKAN BOT INI UNTUK PENGALAMAN YANG LEBIH BAIK!_

Tekan tombol di bawah untuk membuka aplikasi dan mulai menjelajahi ribuan konten menarik.

_untuk informasi dan diskusi periksa grup resmi!_

SHReels`,
    keyboard: {
      inline_keyboard: [
        [{
          text: '📱 Buka Aplikasi',
          web_app: { url: 'https://testelegramwebapp.vercel.app/' }
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
  },
  help: {
    message: `❓ *Bantuan SHReels*

🎬 *Perintah yang Tersedia:*
/start - Buka aplikasi utama
/profile - Lihat profil Anda
/movies - Jelajahi film yang tersedia
/points - Cek saldo poin Anda

📱 *Fitur Aplikasi:*
• Tonton konten premium
• Dapatkan poin untuk menonton
• Undang teman untuk bonus
• Opsi keanggotaan VIP

🔗 *Dukungan:* Hubungi grup resmi untuk bantuan`,
    keyboard: {
      inline_keyboard: [
        [
          {
            text: '📱 Buka Aplikasi',
            web_app: { url: 'https://testelegramwebapp.vercel.app/' }
          }
        ],
        [
          {
            text: '🔙 Kembali ke Start',
            callback_data: 'start'
          }
        ]
      ]
    }
  }
};

// Helper function to send Telegram message
async function sendTelegramMessage(chatId, text, keyboard = null, parseMode = 'Markdown') {
  try {
    const messageData = {
      chat_id: chatId,
      text: text,
      parse_mode: parseMode
    };

    if (keyboard) {
      messageData.reply_markup = JSON.stringify(keyboard);
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageData)
    });

    const result = await response.json();
    
    if (!result.ok) {
      console.error('❌ Telegram API error:', result.description);
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Error sending Telegram message:', error);
    return false;
  }
}

// Handle /start command
async function handleStartCommand(chatId, username = null) {
  const command = BOT_COMMANDS.start;
  
  // Add personalized greeting if username available
  let message = command.message;
  if (username) {
    message = `👋 Hello @${username}!\n\n` + message;
  }
  
  return await sendTelegramMessage(chatId, message, command.keyboard);
}

// Handle callback queries (button clicks)
async function handleCallbackQuery(callbackQuery) {
  const { id, from, data } = callbackQuery;
  const chatId = from.id;
  
  console.log('🔘 Callback query received:', { from: from.username, data });

  let response;
  
  switch (data) {
    case 'start':
    case 'restart':
      response = await handleStartCommand(chatId, from.username);
      break;
      
    case 'cari':
      response = await sendTelegramMessage(chatId, 
        `🔎 *Cari Judul Film*

Untuk mencari film, buka aplikasi dan gunakan fitur pencarian yang tersedia.

📱 *Fitur Pencarian:*
• Cari berdasarkan judul
• Filter berdasarkan genre
• Urutkan berdasarkan rating
• Lihat film terpopuler

_Tekan tombol di bawah untuk membuka aplikasi_`,
        {
          inline_keyboard: [
            [
              {
                text: '📱 Buka Aplikasi',
                web_app: { url: 'https://testelegramwebapp.vercel.app/' }
              }
            ],
            [
              {
                text: '🔙 Kembali',
                callback_data: 'start'
              }
            ]
          ]
        }
      );
      break;
      
    case 'profile':
      response = await sendTelegramMessage(chatId, 
        `👤 *Profil Anda*

📱 Buka aplikasi untuk melihat profil lengkap, poin, dan pengaturan Anda.`,
        {
          inline_keyboard: [
            [
              {
                text: '📱 Buka Aplikasi',
                web_app: { url: 'https://testelegramwebapp.vercel.app/' }
              }
            ],
            [
              {
                text: '🔙 Kembali',
                callback_data: 'start'
              }
            ]
          ]
        }
      );
      break;
      
    case 'points':
      response = await sendTelegramMessage(chatId,
        `💰 *Poin Anda*

📱 Buka aplikasi untuk cek saldo poin saat ini dan dapatkan lebih banyak reward.`,
        {
          inline_keyboard: [
            [
              {
                text: '📱 Buka Aplikasi',
                web_app: { url: 'https://testelegramwebapp.vercel.app/' }
              }
            ],
            [
              {
                text: '🔙 Kembali',
                callback_data: 'start'
              }
            ]
          ]
        }
      );
      break;
      
    case 'help':
      const helpCommand = BOT_COMMANDS.help;
      response = await sendTelegramMessage(chatId, helpCommand.message, helpCommand.keyboard);
      break;
      
    default:
      response = await sendTelegramMessage(chatId, '❓ Perintah tidak dikenal. Gunakan /start untuk memulai.');
  }

  // Answer callback query to remove loading state
  if (response) {
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callback_query_id: id
        })
      });
    } catch (error) {
      console.error('❌ Error answering callback query:', error);
    }
  }
}

// Telegram Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const { message, callback_query } = req.body;
    
    if (message) {
      const { text, from, chat } = message;
      console.log('📨 Message received:', { text, from: from.username, chat_id: chat.id });
      
      if (text === '/start') {
        await handleStartCommand(chat.id, from.username);
      } else if (text === '/help') {
        const helpCommand = BOT_COMMANDS.help;
        await sendTelegramMessage(chat.id, helpCommand.message, helpCommand.keyboard);
      } else if (text === '/profile') {
        await sendTelegramMessage(chat.id, 
          '👤 Open the app to view your profile!',
          {
            inline_keyboard: [
              [
                {
                  text: '🎬 Open App',
                  web_app: { url: WEBAPP_URL }
                }
              ]
            ]
          }
        );
      } else if (text === '/movies') {
        await sendTelegramMessage(chat.id,
          '🎬 Browse our movie collection in the app!',
          {
            inline_keyboard: [
              [
                {
                  text: '🎬 Open App',
                  web_app: { url: WEBAPP_URL }
                }
              ]
            ]
          }
        );
      } else if (text === '/points') {
        await sendTelegramMessage(chat.id,
          '💰 Check your points balance in the app!',
          {
            inline_keyboard: [
              [
                {
                  text: '🎬 Open App',
                  web_app: { url: WEBAPP_URL }
                }
              ]
            ]
          }
        );
      }
    }
    
    if (callback_query) {
      await handleCallbackQuery(callback_query);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    message: 'Railway Backend API is working! 🚀',
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    features: [
      'CORS enabled for Netlify/Vercel',
      'Supabase integration',
      'Telegram bot webhook',
      'Auto-save user profiles',
      'Bot command handling',
      'Web app button integration',
      'Error handling'
    ]
  });
});

// Save Telegram user endpoint
app.post('/api/save-telegram-user', async (req, res) => {
  try {
    const { telegramUser, referralCode } = req.body;
    
    if (!telegramUser || !telegramUser.id) {
      return res.status(400).json({ success: false, error: 'Invalid telegram user data' });
    }

    console.log('💾 Saving Telegram user:', telegramUser);

    // Check if user exists
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_id', telegramUser.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('❌ Error checking user:', checkError);
      return res.status(500).json({ success: false, error: checkError.message });
    }

    let userData = {
      telegram_id: telegramUser.id,
      first_name: telegramUser.first_name || 'Unknown',
      last_name: telegramUser.last_name || null,
      username: telegramUser.username || null,
      photo_url: telegramUser.photo_url || null,
      updated_at: new Date().toISOString()
    };

    // Add default values for new users
    if (!existingUser) {
      userData.points = 0;
      userData.total_commission = 0;
      userData.is_vip = false;
      userData.referral_code = `r_${telegramUser.id}_${Date.now()}`;
      userData.created_at = new Date().toISOString();
      userData.membership_type = 'free';
    }

    // Handle referral
    if (!existingUser && referralCode) {
      const { data: referrer } = await supabase
        .from('profiles')
        .select('telegram_id')
        .eq('referral_code', referralCode)
        .single();

      if (referrer) {
        userData.referred_by = referrer.telegram_id;
        console.log('🔗 User referred by:', referrer.telegram_id);
      }
    }

    let result;
    if (existingUser) {
      // Update existing user
      const { data, error } = await supabase
        .from('profiles')
        .update(userData)
        .eq('telegram_id', telegramUser.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Update failed:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
      result = data;
    } else {
      // Create new user
      const { data, error } = await supabase
        .from('profiles')
        .insert(userData)
        .select()
        .single();

      if (error) {
        console.error('❌ Create failed:', error);
        return res.status(500).json({ success: false, error: error.message });
      }
      result = data;
    }

    console.log('✅ User saved successfully:', result.id);
    res.json({ success: true, profile: result });

  } catch (error) {
    console.error('❌ Save user error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Telegram user endpoint
app.get('/api/get-telegram-user/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    
    const { data: user, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'User not found' });
      }
      throw error;
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Railway Backend running on port ${PORT}`);
  console.log(`🌐 Webhook URL: https://telegram-bot-render-production.up.railway.app/webhook`);
  console.log(`📱 Web App URL: ${WEBAPP_URL}`);
  
  if (BOT_TOKEN) {
    console.log('🤖 Telegram bot token configured');
  } else {
    console.log('⚠️ TELEGRAM_BOT_TOKEN not set - bot features disabled');
  }
});

module.exports = app;
