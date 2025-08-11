// api/bot.js - Minimal working version

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET requests (for testing)
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'Bot endpoint is working' });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Check if BOT_TOKEN exists
    if (!process.env.BOT_TOKEN) {
      console.error('BOT_TOKEN is missing');
      return res.status(500).json({ error: 'BOT_TOKEN not configured' });
    }

    // Parse the update
    const update = req.body;
    
    if (!update) {
      return res.status(400).json({ error: 'No update received' });
    }

    console.log('Received update:', JSON.stringify(update));

    // Handle different update types
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    return res.status(200).json({ status: 'ok' });

  } catch (error) {
    console.error('Error processing update:', error);
    return res.status(500).json({ 
      error: error.message,
      type: error.constructor.name 
    });
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text;

  console.log(`Message from ${chatId}: ${text}`);

  if (text === '/start') {
    return await sendStartMessage(chatId);
  } 
  
  if (text && !text.startsWith('/')) {
    return await sendSearchResult(chatId, text);
  }
}

async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const data = query.data;

  console.log(`Callback query from ${chatId}: ${data}`);

  // Answer callback query first
  await answerCallbackQuery(query.id);

  if (data === 'cari') {
    return await sendMessage(chatId, 'Ketik judul yang ingin dicari…');
  }
  
  if (data === 'restart') {
    return await sendStartMessage(chatId);
  }
}

async function sendStartMessage(chatId) {
  const text = `👋 *Selamat Datang!*

_PASTIKAN TELEGRAM SUDAH VERSI TERBARU SAAT MENGGUNAKAN BOT INI UNTUK PENGALAMAN YANG LEBIH BAIK!_

Tekan tombol di bawah untuk membuka aplikasi dan mulai menjelajahi ribuan konten menarik.

_untuk informasi dan diskusi periksa grup resmi!_

SHReels`;

  const keyboard = {
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
  };

  return await sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function sendSearchResult(chatId, searchTerm) {
  const text = `Hasil untuk: *${searchTerm}*

Buka aplikasi untuk melihat hasil lengkap:`;

  const keyboard = {
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
  };

  return await sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function sendMessage(chatId, text, options = {}) {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
    ...options
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Telegram API error:', error);
      throw new Error(`Telegram API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

async function answerCallbackQuery(callbackQueryId, text = '') {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/answerCallbackQuery`;
  
  const payload = {
    callback_query_id: callbackQueryId,
    text: text
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    return await response.json();
  } catch (error) {
    console.error('Error answering callback query:', error);
    throw error;
  }
}
