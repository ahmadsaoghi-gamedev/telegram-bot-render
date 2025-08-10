require('dotenv').config({ path: '.env.bot' });
const TelegramBot = require('node-telegram-bot-api');

// Bot configuration from environment variables
const token = process.env.BOT_TOKEN;
const webAppUrl = 'https://tele-stream-wizard.vercel.app/';
const groupLink = 'https://t.me/+GABRA-_0qvhiMjc1';
const contentChannelLink = 'https://t.me/+mgUNj7DLFF5lMDQ1';

// Create bot instance
const bot = new TelegramBot(token, { polling: true });

// Store user states for search functionality
const userStates = {};

// Welcome message template
const getWelcomeMessage = () => {
  return `👋 Selamat Datang!

PASTIKAN TELEGRAM SUDAH VERSI TERBARU SAAT MENGGUNAKAN BOT INI UNTUK PENGALAMAN YANG LEBIH BAIK!

Tekan tombol di bawah untuk membuka aplikasi dan mulai menjelajahi ribuan konten menarik.

untuk informasi dan diskusi periksa grup resmi!

SHReels`;
};

// Inline keyboard template
const getInlineKeyboard = () => {
  return {
    inline_keyboard: [
      [
        {
          text: '📱 Buka Aplikasi',
          web_app: { url: webAppUrl }
        }
      ],
      [
        {
          text: '🔎 Cari Judul',
          callback_data: 'cari'
        }
      ],
      [
        {
          text: '👥 Grup Resmi',
          url: groupLink
        },
        {
          text: '📦 Bahan Konten',
          url: contentChannelLink
        }
      ],
      [
        {
          text: '🔁 RESTART',
          callback_data: 'restart'
        }
      ]
    ]
  };
};

// Handle /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  // Log user information for development
  console.log('User started bot:', {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    language_code: user.language_code,
    is_premium: user.is_premium
  });

  // Store user profile data (in a real app, this would go to a database)
  const userProfile = {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    languageCode: user.language_code,
    isPremium: user.is_premium,
    membershipType: 'basic',
    points: 0,
    totalCommission: 0,
    referralCode: `r_${user.id.toString(36)}`,
    joinDate: new Date().toISOString().split('T')[0],
    lastActive: new Date().toISOString()
  };

  // In a real application, you would save this to a database
  // For now, we'll just log it
  console.log('User profile created/updated:', userProfile);

  // Reset user state
  delete userStates[chatId];

  // Send welcome message with inline keyboard
  bot.sendMessage(chatId, getWelcomeMessage(), {
    reply_markup: getInlineKeyboard(),
    parse_mode: 'HTML'
  });
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const data = callbackQuery.data;
  const messageId = message.message_id;

  try {
    if (data === 'cari') {
      // Set user state to searching
      userStates[chatId] = 'searching';

      // Send search prompt
      await bot.sendMessage(chatId, 'Ketik judul yang ingin dicari...');

      // Answer callback to remove loading state
      await bot.answerCallbackQuery(callbackQuery.id);

    } else if (data === 'restart') {
      // Delete current message
      await bot.deleteMessage(chatId, messageId);

      // Reset user state
      delete userStates[chatId];

      // Send new welcome message
      await bot.sendMessage(chatId, getWelcomeMessage(), {
        reply_markup: getInlineKeyboard(),
        parse_mode: 'HTML'
      });

      // Answer callback to remove loading state
      await bot.answerCallbackQuery(callbackQuery.id);
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: 'Terjadi kesalahan, silakan coba lagi.',
      show_alert: true
    });
  }
});

// Handle regular text messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Skip if message is a command
  if (text && text.startsWith('/')) return;

  // Skip if message is from callback query
  if (msg.reply_to_message) return;

  // Check if user is in searching state
  if (userStates[chatId] === 'searching' && text) {
    // Reset user state
    delete userStates[chatId];

    // Send search result
    bot.sendMessage(chatId, `Hasil untuk: ${text} (contoh)`);
  }
});

// Error handling
bot.on('error', (error) => {
  console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

// Log bot startup
console.log('SHReels Bot is running...');
console.log('Web App URL:', webAppUrl);
console.log('Group Link:', groupLink);
console.log('Content Channel:', contentChannelLink);
