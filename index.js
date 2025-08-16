// 🚂 Railway Backend - Fixed Version
// Solusi untuk error EADDRINUSE dan webhook conflicts

const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 8080; // Railway biasanya menggunakan port dinamis

console.log('🚀 Starting Railway Backend...');
console.log('📊 Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: PORT,
    SUPABASE_URL: process.env.SUPABASE_URL ? 'Set ✅' : 'Missing ❌',
    BOT_TOKEN: process.env.BOT_TOKEN ? 'Set ✅' : 'Missing ❌',
    RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL || 'Not set'
});

// CORS Configuration - PENTING untuk menghubungkan dengan Netlify!
app.use(cors({
    origin: [
        'https://testelegramwebapp.netlify.app',
        'http://localhost:8080',
        'http://localhost:3000',
        'http://localhost:5173'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Supabase Client dengan Service Role Key
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    console.log('✅ Supabase client initialized');
} else {
    console.error('❌ Missing Supabase environment variables');
}

// Initialize Telegram Bot - FIXED VERSION
let bot = null;
let webhookUrl = null;

if (process.env.BOT_TOKEN) {
    try {
        // Create bot without webhook initially
        bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
        
        // Set webhook URL
        const baseUrl = process.env.RAILWAY_STATIC_URL || `https://telegram-bot-render-production.up.railway.app`;
        webhookUrl = `${baseUrl}/webhook/${process.env.BOT_TOKEN}`;
        
        console.log('🤖 Telegram bot initialized');
        console.log('🔗 Webhook URL will be:', webhookUrl);
        
    } catch (error) {
        console.error('❌ Error initializing Telegram bot:', error.message);
    }
} else {
    console.error('❌ BOT_TOKEN not provided');
}

// Health check endpoint - MUST BE FIRST
app.get('/health', (req, res) => {
    const health = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        port: PORT,
        webhook: webhookUrl,
        environment: {
            NODE_ENV: process.env.NODE_ENV,
            SUPABASE_URL: process.env.SUPABASE_URL ? 'Connected' : 'Missing',
            BOT_TOKEN: process.env.BOT_TOKEN ? 'Set' : 'Missing',
            RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL || 'Not set'
        }
    };
    
    console.log('🏥 Health check requested');
    res.json(health);
});

// Test endpoint untuk debugging
app.get('/api/test', (req, res) => {
    res.json({
        message: 'Railway Backend API is working! 🚀',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        features: [
            'CORS enabled for Netlify',
            'Supabase integration',
            'Telegram bot webhook',
            'Auto-save user profiles',
            'Error handling'
        ]
    });
});

// Webhook endpoint - FIXED VERSION
if (process.env.BOT_TOKEN) {
    app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
        console.log('📨 Webhook received:', {
            message_id: req.body.message?.message_id,
            chat_id: req.body.message?.chat?.id,
            from_id: req.body.message?.from?.id,
            text: req.body.message?.text
        });
        
        if (bot) {
            try {
                bot.processUpdate(req.body);
                res.status(200).json({ success: true });
            } catch (error) {
                console.error('❌ Error processing webhook:', error);
                res.status(500).json({ error: error.message });
            }
        } else {
            res.status(500).json({ error: 'Bot not initialized' });
        }
    });
}

// API endpoint untuk auto-save user profile dari frontend
app.post('/api/save-telegram-user', async (req, res) => {
    try {
        const { telegramUser, initData } = req.body;
        
        console.log('📥 Save user request:', {
            user_id: telegramUser?.id,
            first_name: telegramUser?.first_name,
            username: telegramUser?.username,
            initData_length: initData?.length || 0
        });

        if (!telegramUser || !telegramUser.id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid telegram user data' 
            });
        }

        if (!supabase) {
            return res.status(500).json({
                success: false,
                error: 'Supabase not configured'
            });
        }

        // Prepare profile data
        const profileData = {
            telegram_id: telegramUser.id,
            username: telegramUser.username || null,
            first_name: telegramUser.first_name,
            last_name: telegramUser.last_name || null,
            photo_url: telegramUser.photo_url || null,
            is_vip: false,
            membership_type: 'free'
        };

        console.log('💾 Saving to Supabase:', profileData);
        
        // Save to Supabase using service role key
        const { data: profile, error } = await supabase
            .from('profiles')
            .upsert(profileData, { 
                onConflict: 'telegram_id',
                ignoreDuplicates: false 
            })
            .select()
            .single();
        
        if (error) {
            console.error('❌ Supabase error:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }

        console.log('✅ Profile saved:', profile.id);
        
        // Create/update points entry
        try {
            const { error: pointsError } = await supabase
                .from('points')
                .upsert({
                    user_id: profile.id,
                    current_points: 0,
                    total_earned: 0,
                    total_withdrawn: 0
                }, { onConflict: 'user_id' });
            
            if (pointsError) {
                console.error('⚠️ Points error (non-critical):', pointsError.message);
            } else {
                console.log('✅ Points entry updated');
            }
        } catch (pointsErr) {
            console.error('⚠️ Points creation failed (non-critical):', pointsErr);
        }

        res.json({ 
            success: true, 
            profile: profile 
        });
        
    } catch (error) {
        console.error('💥 API Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get user profile endpoint
app.get('/api/user-profile/:telegramId', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegramId);
        
        if (!telegramId || !supabase) {
            return res.status(400).json({ error: 'Invalid request' });
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .select(`
                *,
                points (
                    current_points,
                    total_earned,
                    total_withdrawn
                )
            `)
            .eq('telegram_id', telegramId)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json({ profile });
        
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Bot command handlers - ONLY if bot is initialized
if (bot) {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const webAppUrl = 'https://testelegramwebapp.vercel.app';
        
        console.log(`📱 /start from user ${msg.from?.id}`);
        
        bot.sendMessage(chatId, '🎬 Selamat datang di SHReels!\n\nKlik tombol di bawah untuk membuka aplikasi streaming:', {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🎬 Buka Aplikasi',
                        web_app: { url: webAppUrl }
                    }
                ]]
            }
        }).catch(err => {
            console.error('❌ Error sending message:', err);
        });
    });

    bot.onText(/\/help/, (msg) => {
        const chatId = msg.chat.id;
        
        bot.sendMessage(chatId, `🤖 Bantuan SHReels Bot:

📱 /start - Membuka aplikasi streaming
🎬 /app - Shortcut ke aplikasi
❓ /help - Menampilkan bantuan ini

💡 Gunakan tombol "🎬 Buka Aplikasi" untuk akses langsung!`).catch(err => {
            console.error('❌ Error sending help:', err);
        });
    });

    bot.onText(/\/app/, (msg) => {
        const chatId = msg.chat.id;
        const webAppUrl = 'https://testelegramwebapp.vercel.app';
        
        bot.sendMessage(chatId, '🎬 Buka Aplikasi SHReels:', {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: '🎬 Buka Aplikasi',
                        web_app: { url: webAppUrl }
                    }
                ]]
            }
        }).catch(err => {
            console.error('❌ Error sending app button:', err);
        });
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('💥 Server Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server - FIXED VERSION
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚂 Railway Backend running on port ${PORT}`);
    console.log(`🌐 Health check: ${process.env.RAILWAY_STATIC_URL || 'http://localhost:' + PORT}/health`);
    console.log(`🧪 Test endpoint: ${process.env.RAILWAY_STATIC_URL || 'http://localhost:' + PORT}/api/test`);
    
    // Set webhook after server starts
    if (bot && webhookUrl) {
        setTimeout(async () => {
            try {
                await bot.setWebHook(webhookUrl);
                console.log(`✅ Webhook set successfully: ${webhookUrl}`);
            } catch (err) {
                console.error('❌ Failed to set webhook:', err.message);
                console.log('⚠️ Bot will work without webhook (polling disabled)');
            }
        }, 2000); // Wait 2 seconds for server to be fully ready
    }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`🛑 ${signal} received, shutting down gracefully...`);
    
    server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        console.log('⚠️ Forcing shutdown...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});

