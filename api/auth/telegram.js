import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Vercel Serverless Function untuk autentikasi Telegram
export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { initData } = req.body;

        if (!initData) {
            return res.status(400).json({ error: 'initData is required' });
        }

        // Verify Telegram initData
        const isValid = verifyTelegramInitData(initData);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }

        // Parse initData to get user info
        const userData = parseInitData(initData);
        if (!userData.user) {
            return res.status(400).json({ error: 'User data not found' });
        }

        // Create custom JWT for Supabase
        const customJWT = createSupabaseJWT(userData.user);

        return res.status(200).json({
            success: true,
            jwt: customJWT,
            user: userData.user
        });

    } catch (error) {
        console.error('Telegram auth error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

// Verify Telegram initData using bot token
function verifyTelegramInitData(initData) {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
        console.error('BOT_TOKEN not found in environment variables');
        return false;
    }

    try {
        // Parse the initData
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        urlParams.delete('hash');

        // Create data-check-string
        const dataCheckString = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // Create secret key
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(BOT_TOKEN)
            .digest();

        // Create hash
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

// Parse initData to extract user information
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

// Create custom JWT for Supabase authentication
function createSupabaseJWT(telegramUser) {
    const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!SUPABASE_JWT_SECRET) {
        throw new Error('SUPABASE_JWT_SECRET not found in environment variables');
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: 'telegram-auth',
        sub: `telegram_${telegramUser.id}`,
        aud: 'authenticated',
        exp: now + (24 * 60 * 60), // 24 hours
        iat: now,
        email: `${telegramUser.id}@telegram.local`,
        app_metadata: {
            provider: 'telegram',
            providers: ['telegram']
        },
        user_metadata: {
            telegram_id: telegramUser.id,
            first_name: telegramUser.first_name,
            last_name: telegramUser.last_name,
            username: telegramUser.username,
            photo_url: telegramUser.photo_url
        },
        role: 'authenticated'
    };

    return jwt.sign(payload, SUPABASE_JWT_SECRET, { algorithm: 'HS256' });
}
