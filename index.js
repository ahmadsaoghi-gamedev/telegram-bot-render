// 🚂 Railway Backend Example - index.js
// Copy this file to your Railway backend repository

const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

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
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Telegram Bot Setup
const bot = new TelegramBot(process.env.BOT_TOKEN, { 
    webHook: {
        port: PORT,
        host: '0.0.0.0'
    }
});

// Set Webhook URL
const webhookUrl = `${process.env.RAILWAY_STATIC_URL || 'https://telegram-bot-render-production.up.railway.app/'}/webhook/${process.env.BOT_TOKEN}`;

// Set webhook when server starts
bot.setWebHook(webhookUrl).then(() => {
    console.log(`✅ Webhook set to: ${webhookUrl}`);
}).catch(err => {
    console.error('❌ Failed to set webhook:', err);
});

// Webhook endpoint
app.post(`/webhook/${process.env.BOT_TOKEN}`, (req, res) => {
    console.log('📨 Received webhook:', req.body);
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        webhook: webhookUrl
    });
});

// API endpoint untuk auto-save user profile dari frontend
app.post('/api/save-telegram-user', async (req, res) => {
    try {
        const { telegramUser, initData } = req.body;
        
        console.log('📥 Received save request for user:', telegramUser?.id);
        console.log('👤 User data:', telegramUser);
        console.log('📄 Init data length:', initData?.length || 0);

        if (!telegramUser || !telegramUser.id) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid telegram user data' 
            });
        }

        // Optional: Verify Telegram data authenticity
        // You can add hash verification here using crypto
        
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

        console.log('💾 Saving profile to Supabase:', profileData);
        
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
            console.error('❌ Error saving profile:', error);
            return res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }

        console.log('✅ Profile saved:', profile.id);
        
        // Create/update points entry
        const { error: pointsError } = await supabase
            .from('points')
            .upsert({
                user_id: profile.id,
                current_points: 0,
                total_earned: 0,
                total_withdrawn: 0
            }, { onConflict: 'user_id' });
        
        if (pointsError) {
            console.error('⚠️ Points creation failed:', pointsError);
            // Don't fail the request for points error
        } else {
            console.log('✅ Points entry created/updated');
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
        
        if (!telegramId) {
            return res.status(400).json({ error: 'Invalid telegram ID' });
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
            console.error('Error fetching profile:', error);
            return res.status(404).json({ error: 'Profile not found' });
        }

        res.json({ profile });
        
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test endpoint untuk debugging
app.get('/api/test', (req, res) => {
    res.json({
        message: 'Backend API is working!',
        timestamp: new Date().toISOString(),
        environment: {
            NODE_ENV: process.env.NODE_ENV,
            PORT: PORT,
            SUPABASE_URL: process.env.SUPABASE_URL ? 'Set' : 'Not set',
            BOT_TOKEN: process.env.BOT_TOKEN ? 'Set' : 'Not set',
            WEBHOOK_URL: webhookUrl
        }
    });
});

// Bot command handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const webAppUrl = 'https://testelegramwebapp.netlify.app';
    
    console.log(`📱 /start command from user ${msg.from?.id}`);
    
    bot.sendMessage(chatId, '🎬 Selamat datang di SHReels!\n\nKlik tombol di bawah untuk membuka aplikasi streaming:', {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: '🎬 Buka Aplikasi',
                    web_app: { url: webAppUrl }
                }
            ]]
        }
    });
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(chatId, `🤖 Bantuan SHReels Bot:

📱 /start - Membuka aplikasi streaming
🎬 /app - Shortcut ke aplikasi
❓ /help - Menampilkan bantuan ini

💡 Gunakan tombol "🎬 Buka Aplikasi" untuk akses langsung ke platform streaming kami!`);
});

bot.onText(/\/app/, (msg) => {
    const chatId = msg.chat.id;
    const webAppUrl = 'https://testelegramwebapp.netlify.app';
    
    bot.sendMessage(chatId, '🎬 Buka Aplikasi SHReels:', {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: '🎬 Buka Aplikasi',
                    web_app: { url: webAppUrl }
                }
            ]]
        }
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('💥 Server Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚂 Railway Backend Server running on port ${PORT}`);
    console.log(`🌐 Webhook URL: ${webhookUrl}`);
    console.log(`🏥 Health check: ${process.env.RAILWAY_STATIC_URL || 'http://localhost:' + PORT}/health`);
    console.log(`🧪 Test endpoint: ${process.env.RAILWAY_STATIC_URL || 'http://localhost:' + PORT}/api/test`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    process.exit(0);
});

