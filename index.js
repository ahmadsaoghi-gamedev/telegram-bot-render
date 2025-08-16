// index.js - Railway deployment with authentication endpoint
require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

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
                    web_app: { url: 'https://689ff8d05318ec4a84a63754--tesminiapp.netlify.app/' }
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
                            url: `https://689ff8d05318ec4a84a63754--tesminiapp.netlify.app/?search=${encodeURIComponent(searchTerm)}`
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
        let { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, telegram_id, username')
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
                    username: userData.user.username
                }
            });

            if (userError) {
                console.error('Error creating auth user:', userError);
                throw new Error('Failed to create authentication user');
            }

            console.log('Auth user created:', newUser.user.id);

            // Buat profil di tabel 'profiles'
            const { data: newProfile, error: insertProfileError } = await supabaseAdmin
                .from('profiles')
                .insert({
                    id: newUser.user.id,
                    telegram_id: telegramId,
                    username: userData.user.username || null,
                    is_vip: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select('id, telegram_id, username')
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
            username: telegramUser.username
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
        status: 'OK',
        message: 'Telegram Bot is running',
        timestamp: new Date().toISOString(),
        endpoints: [
            'GET / - Status check',
            'POST /webhook - Telegram webhook',
            'GET /health - Health check',
            'POST /api/auth/telegram - Authentication endpoint'
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
        supabase_configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Bot server is running on port ${PORT}`);
    console.log(`📡 Webhook URL: https://telegram-bot-render-production.up.railway.app/webhook`);
    console.log(`🔐 Auth URL: https://telegram-bot-render-production.up.railway.app/api/auth/telegram`);
    console.log(`🤖 Bot token configured: ${BOT_TOKEN ? 'Yes' : 'No'}`);

    // Log environment info
    console.log('Environment info:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: PORT,
        BOT_TOKEN_SET: !!BOT_TOKEN,
        SUPABASE_URL_SET: !!process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY_SET: !!process.env.SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY_SET: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_JWT_SECRET_SET: !!process.env.SUPABASE_JWT_SECRET
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

