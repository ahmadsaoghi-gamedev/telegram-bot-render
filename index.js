// index.js - Railway deployment with Xendit integration
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors({
  origin: [
    'https://testelegramwebapp-main.vercel.app/',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true
}));

// Import video proxy routers
try {
  const videoProxyHealthRouter = require('./api/proxy-video/health.js');
  const videoProxyRouter = require('./api/proxy-video/index.js');

  // Mount health check route
  app.use('/api/proxy-video', videoProxyHealthRouter);

  // Mount main proxy route
  app.use('/api/proxy-video', videoProxyRouter);

  console.log('✅ Video proxy routers loaded');
} catch (error) {
  console.error('❌ Failed to load video proxy routers:', error);
}

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN environment variable is required');
  process.exit(1);
}

// Initialize Supabase clients
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize bot (polling mode for development/production)
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ========================================
// XENDIT WEBHOOK HANDLER
// ========================================

// Xendit webhook signature verification
const verifyWebhookSignature = (payload, signature, secret) => {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

// Xendit webhook endpoint
app.post('/api/xendit/webhook', async (req, res) => {
  try {
    const payload = JSON.stringify(req.body);
    const signature = req.headers['x-xendit-signature'];

    // Verify webhook signature (optional but recommended)
    if (process.env.WEBHOOK_SECRET) {
      if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET)) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    console.log('📦 Xendit webhook received:', JSON.stringify(req.body, null, 2));

    const { event, data } = req.body;

    // Handle different event types
    if (event === 'invoice.paid' || event === 'qr.payment') {
      let paymentId, paymentStatus, paymentAmount, paymentDate, referenceId;

      if (event === 'invoice.paid') {
        // Invoice payment event
        paymentId = data.id;
        paymentStatus = data.status;
        paymentAmount = data.paid_amount || data.amount;
        paymentDate = data.paid_at || data.created;
        referenceId = data.external_id;
      } else if (event === 'qr.payment') {
        // QR payment event
        paymentId = data.id;
        paymentStatus = data.status;
        paymentAmount = data.amount;
        paymentDate = data.created;
        referenceId = data.reference_id;
      }

      console.log('💰 Processing payment:', {
        event,
        payment_id: paymentId,
        status: paymentStatus,
        amount: paymentAmount,
        date: paymentDate,
        reference_id: referenceId
      });

      // Process the webhook using Supabase function
      const { data: result, error } = await supabaseAdmin.rpc('process_xendit_webhook', {
        invoice_id: paymentId,
        payment_status: paymentStatus,
        paid_amount: paymentAmount,
        paid_at: paymentDate ? new Date(paymentDate).toISOString() : new Date().toISOString()
      });

      if (error) {
        console.error('❌ Error processing webhook:', error);
        return res.status(500).json({ error: 'Failed to process webhook' });
      }

      console.log('✅ Webhook processed successfully');
      res.status(200).json({ success: true, event, payment_id: paymentId });
    } else {
      console.log('⚠️ Unhandled event type:', event);
      res.status(200).json({ success: true, message: 'Event ignored' });
    }

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Payment status check endpoint
app.get('/api/payment/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    // Check payment status in database
    const { data, error } = await supabaseAdmin
      .from('payment_transactions')
      .select(`
        *,
        vip_packages(name, duration_days),
        profiles(telegram_id, is_vip, vip_expires_at)
      `)
      .eq('xendit_invoice_id', invoiceId)
      .single();

    console.log('🔍 Payment status check:', { invoiceId, data, error });

    if (error) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({ success: true, payment: data });

  } catch (error) {
    console.error('Error checking payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create Xendit invoice endpoint
app.post('/api/xendit/create-invoice', async (req, res) => {
  try {
    const { telegramId, packageId, userData } = req.body;

    // Validate request
    if (!telegramId || !packageId || !userData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }

    // Get VIP package from database
    const { data: vipPackage, error: packageError } = await supabaseAdmin
      .from('vip_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (packageError || !vipPackage) {
      return res.status(404).json({
        success: false,
        error: 'VIP package not found'
      });
    }

    // Generate external ID
    const externalId = `VIP-${telegramId}-${packageId}-${Date.now()}`;

    // Prepare Xendit invoice request
    const invoiceRequest = {
      external_id: externalId,
      amount: vipPackage.price,
      description: `Pembelian ${vipPackage.name} - SHReels Premium`,
      currency: 'IDR',
      items: [
        {
          name: vipPackage.name,
          price: vipPackage.price,
          quantity: 1,
          reference_id: packageId
        }
      ],
      success_redirect_url: `${process.env.FRONTEND_URL || 'https://testelegramwebapp-main.vercel.app'}/payment/success?invoice_id={invoice_id}`,
      failure_redirect_url: `${process.env.FRONTEND_URL || 'https://testelegramwebapp-main.vercel.app'}/payment/failed?invoice_id={invoice_id}`,
      payment_methods: ['BCA', 'BNI', 'BRI', 'MANDIRI', 'OVO', 'DANA', 'LINKAJA', 'SHOPEEPAY', 'GOPAY', 'QRIS'],
      should_send_email: false,
      customer: {
        given_names: userData.firstName,
        email: userData.email,
        mobile_number: userData.phone
      }
    };

    // Get Xendit API headers
    const getXenditHeaders = () => ({
      'Authorization': `Basic ${Buffer.from(process.env.XENDIT_SECRET_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/json',
      'X-IDEMPOTENCY-KEY': `xendit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });

    // Create Xendit invoice
    const response = await fetch('https://api.xendit.co/v2/invoices', {
      method: 'POST',
      headers: getXenditHeaders(),
      body: JSON.stringify(invoiceRequest)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Xendit API Error:', errorData);
      return res.status(400).json({
        success: false,
        error: `Payment gateway error: ${errorData.message || 'Unknown error'}`
      });
    }

    const invoice = await response.json();

    // Save transaction to database
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('telegram_id', telegramId)
      .single();

    let transaction = null;
    if (profileError) {
      console.error('❌ Profile not found for telegram_id:', telegramId);
      console.error('Profile error:', profileError);
    } else if (profile) {
      const { data: transactionData, error: transactionError } = await supabaseAdmin
        .from('payment_transactions')
        .insert({
          user_id: profile.id,
          telegram_id: telegramId,  // Add the missing telegram_id column
          package_id: packageId,    // Now we know this column exists
          xendit_invoice_id: invoice.id,
          amount: vipPackage.price,
          status: 'pending',
          expires_at: new Date(Date.now() + (vipPackage.duration_days * 24 * 60 * 60 * 1000)).toISOString() // Add expires_at
          // Based on error message, we know these columns exist
        })
        .select()
        .single();

      if (transactionError) {
        console.error('❌ Error saving transaction:', transactionError);
        // Continue anyway, don't fail the request
      } else {
        transaction = transactionData;
        console.log('✅ Transaction saved:', transaction.id);
      }
    } else {
      console.error('❌ Profile not found for telegram_id:', telegramId);
    }

    console.log('✅ Xendit invoice created:', invoice.id);
    res.json({
      success: true,
      invoice,
      transaction: transaction
    });

  } catch (error) {
    console.error('❌ Error creating Xendit invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Get Xendit invoice endpoint
app.get('/api/xendit/invoice/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    // Get Xendit API headers
    const getXenditHeaders = () => ({
      'Authorization': `Basic ${Buffer.from(process.env.XENDIT_SECRET_KEY + ':').toString('base64')}`,
      'Content-Type': 'application/json'
    });

    const response = await fetch(`https://api.xendit.co/v2/invoices/${invoiceId}`, {
      method: 'GET',
      headers: getXenditHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(400).json({
        success: false,
        error: `Failed to get invoice: ${errorData.message || 'Unknown error'}`
      });
    }

    const invoice = await response.json();
    res.json({ success: true, invoice });

  } catch (error) {
    console.error('❌ Error getting Xendit invoice:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ========================================
// EXISTING BOT FUNCTIONALITY
// ========================================

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
          web_app: { url: 'https://testelegramwebapp-main.vercel.app/?source=webapp&mode=app&fullscreen=true&autoExpand=true' }
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
    }).catch(() => { });

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
              url: `https://testelegramwebapp-main.vercel.app/?source=webapp&mode=app&fullscreen=true&autoExpand=true&search=${encodeURIComponent(searchTerm)}`
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

// ========================================
// EXISTING API ENDPOINTS
// ========================================

// Get user profile by Telegram ID
app.get('/api/profile/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;

    console.log(`Fetching profile for Telegram ID: ${telegramId}`);

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Profile not found' });
      }
      throw error;
    }

    console.log('Profile found:', profile.id);
    res.json({ success: true, profile });

  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user profile
app.put('/api/profile/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const updateData = req.body;

    console.log(`Updating profile for Telegram ID: ${telegramId}`, updateData);

    // Remove sensitive fields
    delete updateData.id;
    delete updateData.telegram_id;
    updateData.updated_at = new Date().toISOString();

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    console.log('Profile updated successfully');
    res.json({ success: true, profile });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user points and VIP status
app.get('/api/user-status/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;

    console.log(`Fetching user status for Telegram ID: ${telegramId}`);

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, telegram_id, username, first_name, last_name, photo_url, points, total_commission, is_vip, vip_expires_at, referral_code, referred_by, created_at, updated_at')
      .eq('telegram_id', telegramId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Profile not found' });
      }
      throw error;
    }

    // Calculate VIP status
    const now = new Date();
    const vipExpiresAt = profile.vip_expires_at ? new Date(profile.vip_expires_at) : null;
    const isVipActive = profile.is_vip && vipExpiresAt && vipExpiresAt > now;

    const userStatus = {
      ...profile,
      is_vip_active: isVipActive,
      vip_days_remaining: isVipActive ? Math.ceil((vipExpiresAt - now) / (1000 * 60 * 60 * 24)) : 0
    };

    console.log('User status fetched successfully');
    res.json({ success: true, userStatus });

  } catch (error) {
    console.error('Error fetching user status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add points to user
app.post('/api/add-points/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const { amount, description } = req.body;

    console.log(`Adding ${amount} points to Telegram ID: ${telegramId}`);

    // Get current points
    const { data: currentProfile, error: getError } = await supabaseAdmin
      .from('profiles')
      .select('points')
      .eq('telegram_id', telegramId)
      .single();

    if (getError) throw getError;

    const newPoints = (currentProfile.points || 0) + amount;

    // Update points
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .update({
        points: newPoints,
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) throw error;

    console.log(`Points added successfully. New total: ${newPoints}`);
    res.json({ success: true, profile, pointsAdded: amount, newTotal: newPoints });

  } catch (error) {
    console.error('Error adding points:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// AUTHENTICATION ENDPOINT
// ========================================

// Authentication endpoint
app.post('/api/auth/telegram', async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }

    console.log('Processing authentication for initData:', initData.substring(0, 50) + '...');

    // Check required environment variables
    if (!process.env.BOT_TOKEN) {
      console.error('BOT_TOKEN not found in environment variables');
      return res.status(500).json({ error: 'Server configuration error: BOT_TOKEN missing' });
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_JWT_SECRET) {
      console.error('Supabase environment variables missing');
      return res.status(500).json({ error: 'Server configuration error: Supabase env vars missing' });
    }

    // Verifikasi Data dari Telegram
    const isValid = verifyTelegramInitData(initData);
    if (!isValid) {
      console.error('Telegram data verification failed');
      return res.status(401).json({ error: 'Invalid Telegram data' });
    }

    // Parse initData untuk mendapatkan user info
    const userData = parseInitData(initData);
    if (!userData.user) {
      return res.status(400).json({ error: 'User data not found in initData' });
    }

    console.log('Telegram user data:', userData.user);

    // Cari atau Buat Profil Pengguna
    const telegramId = userData.user.id;

    // Cari profil yang sudah ada
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Error fetching profile:', profileError);
      throw new Error('Database error while fetching profile');
    }

    // JIKA PROFIL TIDAK DITEMUKAN, BUAT PENGGUNA BARU
    if (!profile) {
      console.log('Profile not found, creating new user...');

      // Buat pengguna di sistem auth.users Supabase
      const { data: newUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email: `${telegramId}@telegram.user`,
        email_confirm: true,
        user_metadata: {
          telegram_id: telegramId,
          username: userData.user.username,
          first_name: userData.user.first_name,
          last_name: userData.user.last_name,
          photo_url: userData.user.photo_url
        }
      });

      if (userError) {
        console.error('Error creating auth user:', userError);
        throw new Error('Failed to create authentication user');
      }

      console.log('Auth user created:', newUser.user.id);

      // Buat profil di tabel 'profiles' dengan semua field yang diperlukan
      const { data: newProfile, error: insertProfileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: newUser.user.id,
          telegram_id: telegramId,
          username: userData.user.username || null,
          first_name: userData.user.first_name || 'Unknown',
          last_name: userData.user.last_name || null,
          photo_url: userData.user.photo_url || null,
          points: 0,
          total_commission: 0,
          is_vip: false,
          referral_code: `r_${telegramId}_${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select('*')
        .single();

      if (insertProfileError) {
        console.error('Error creating profile:', insertProfileError);
        throw new Error('Failed to create user profile');
      }

      console.log('Profile created:', newProfile);

      // Handle referral jika ada start_param
      if (userData.start_param && userData.start_param.startsWith('r_')) {
        const referrerId = userData.start_param.substring(2);
        await handleReferral(newUser.user.id, referrerId);
      }

      profile = newProfile;
    } else {
      console.log('Existing profile found:', profile.id);

      // Update profile dengan data Telegram terbaru
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          username: userData.user.username || null,
          first_name: userData.user.first_name || profile.first_name,
          last_name: userData.user.last_name || profile.last_name,
          photo_url: userData.user.photo_url || profile.photo_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (updateError) {
        console.error('Error updating profile:', updateError);
      }
    }

    // Buat JWT Kustom
    const customJWT = createSupabaseJWT(profile, userData.user);

    console.log('Authentication successful for user:', profile.id);

    return res.status(200).json({
      success: true,
      jwt: customJWT,
      user: userData.user,
      profile: profile
    });

  } catch (error) {
    console.error('Auth API Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// OPTIONS handler for CORS
app.options('/api/auth/telegram', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

// ========================================
// HELPER FUNCTIONS
// ========================================

function verifyTelegramInitData(initData) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error('BOT_TOKEN not found in environment variables');
    return false;
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return calculatedHash === hash;
  } catch (error) {
    console.error('Error verifying Telegram data:', error);
    return false;
  }
}

function parseInitData(initData) {
  const urlParams = new URLSearchParams(initData);
  const userData = {};

  for (const [key, value] of urlParams.entries()) {
    if (key === 'user') {
      try {
        userData.user = JSON.parse(decodeURIComponent(value));
      } catch (error) {
        console.error('Error parsing user data:', error);
      }
    } else if (key === 'start_param') {
      userData.start_param = value;
    } else if (key === 'auth_date') {
      userData.auth_date = parseInt(value);
    }
  }

  return userData;
}

function createSupabaseJWT(profile, telegramUser) {
  const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
  if (!SUPABASE_JWT_SECRET) {
    throw new Error('SUPABASE_JWT_SECRET not found in environment variables');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'telegram-auth',
    sub: profile.id,
    aud: 'authenticated',
    exp: now + (24 * 60 * 60),
    iat: now,
    email: `${telegramUser.id}@telegram.user`,
    app_metadata: {
      provider: 'telegram',
      providers: ['telegram']
    },
    user_metadata: {
      telegram_id: telegramUser.id,
      username: telegramUser.username,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name,
      photo_url: telegramUser.photo_url
    },
    role: 'authenticated'
  };

  return jwt.sign(payload, SUPABASE_JWT_SECRET, { algorithm: 'HS256' });
}

async function handleReferral(newUserId, referrerId) {
  try {
    console.log('Processing referral:', { newUserId, referrerId });

    const { data: referrer, error: referrerError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', referrerId)
      .single();

    if (referrerError || !referrer) {
      console.error('Referrer not found:', referrerId);
      return;
    }

    const { error: referralError } = await supabaseAdmin
      .from('referrals')
      .insert({
        referrer_id: referrerId,
        referred_id: newUserId,
        commission_amount: 0,
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (referralError) {
      console.error('Error creating referral:', referralError);
    } else {
      console.log('Referral created successfully');
    }
  } catch (error) {
    console.error('Referral handling error:', error);
  }
}

// ========================================
// EXPRESS ROUTES
// ========================================

app.get('/', (req, res) => {
  res.json({
    status: "OK",
    message: "SHReels Telegram Bot API with Xendit Integration is running",
    timestamp: new Date().toISOString(),
    version: "2.1.0",
    endpoints: [
      "GET / - Status check",
      "POST /webhook - Telegram webhook",
      "GET /health - Health check",
      "POST /api/auth/telegram - Authentication endpoint",
      "GET /api/profile/:telegramId - Get user profile",
      "PUT /api/profile/:telegramId - Update user profile",
      "GET /api/user-status/:telegramId - Get user status",
      "POST /api/add-points/:telegramId - Add points to user",
      // Xendit endpoints
      "POST /api/xendit/webhook - Xendit webhook handler",
      "POST /api/xendit/create-invoice - Create Xendit invoice",
      "GET /api/xendit/invoice/:invoiceId - Get Xendit invoice",
      "GET /api/payment/:invoiceId - Check payment status",
      // Video proxy endpoints
      "GET /api/proxy-video/healthz - Video proxy health check",
      "GET /api/proxy-video/stream - Secure video streaming proxy",
      "GET /api/proxy-video/test - Video URL validation"
    ]
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
    timestamp: new Date().toISOString(),
    bot_token_configured: !!BOT_TOKEN,
    supabase_configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    xendit_configured: !!process.env.XENDIT_SECRET_KEY,
    version: '2.1.0'
  });
});

// ========================================
// SERVER STARTUP
// ========================================

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 SHReels Bot server with Xendit integration is running on port ${PORT}`);
  console.log(`📡 Webhook URL: https://telegram-bot-render-production.up.railway.app/webhook`);
  console.log(`🔐 Auth URL: https://telegram-bot-render-production.up.railway.app/api/auth/telegram`);
  console.log(`👤 Profile API: https://telegram-bot-render-production.up.railway.app/api/profile/:telegramId`);
  console.log(`🏦 Xendit Webhook: https://telegram-bot-render-production.up.railway.app/api/xendit/webhook`);
  console.log(`💳 Payment Status: https://telegram-bot-render-production.up.railway.app/api/payment/:invoiceId`);
  console.log(`🤖 Bot token configured: ${BOT_TOKEN ? 'Yes' : 'No'}`);

  // Log environment info
  console.log('Environment info:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: PORT,
    BOT_TOKEN_SET: !!BOT_TOKEN,
    SUPABASE_URL_SET: !!process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY_SET: !!process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY_SET: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET_SET: !!process.env.SUPABASE_JWT_SECRET,
    XENDIT_SECRET_KEY_SET: !!process.env.XENDIT_SECRET_KEY,
    WEBHOOK_SECRET_SET: !!process.env.WEBHOOK_SECRET
  });
});

// ========================================
// GRACEFUL SHUTDOWN
// ========================================

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});
