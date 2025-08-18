import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Inisialisasi Supabase dengan kunci ANONYMOUS (untuk operasi biasa)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Inisialisasi Supabase dengan kunci SERVICE_ROLE (untuk operasi admin)
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

        // --- 1. Verifikasi Data dari Telegram ---
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

        // --- 2. Cari atau Buat Profil Pengguna ---
        const telegramId = userData.user.id;

        // Cari profil yang sudah ada
        let { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, telegram_id, username, is_vip, vip_expires_at')
            .eq('telegram_id', telegramId)
            .single();

        if (profileError && profileError.code !== 'PGRST116') {
            console.error('Error fetching profile:', profileError);
            throw new Error('Database error while fetching profile');
        }

        // JIKA PROFIL TIDAK DITEMUKAN, BUAT PENGGUNA BARU
        if (!profile) {
            console.log('Profile not found, creating new user...');

            // a. Buat pengguna di sistem auth.users Supabase
            const { data: newUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
                email: `${telegramId}@telegram.user`, // Email unik dummy
                email_confirm: true, // Langsung aktifkan
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

            // b. Buat profil di tabel 'profiles'
            const { data: newProfile, error: insertProfileError } = await supabaseAdmin
                .from('profiles')
                .insert({
                    id: newUser.user.id, // Gunakan ID dari auth.users
                    telegram_id: telegramId,
                    username: userData.user.username || null,
                    is_vip: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select('id, telegram_id, username, is_vip, vip_expires_at')
                .single();

            if (insertProfileError) {
                console.error('Error creating profile:', insertProfileError);
                throw new Error('Failed to create user profile');
            }

            console.log('Profile created:', newProfile);

            // Skip points and referrals for now - focus on core authentication
            console.log('User profile created successfully, skipping optional features');

            profile = newProfile;
        } else {
            console.log('Existing profile found:', profile.id);

            // Update profile dengan data Telegram terbaru (hanya username)
            const { error: updateError } = await supabaseAdmin
                .from('profiles')
                .update({
                    username: userData.user.username || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', profile.id);

            if (updateError) {
                console.error('Error updating profile:', updateError);
                // Don't throw error, profile update is not critical
            }
        }

        // --- 3. Buat JWT Kustom ---
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
}



// Verifikasi initData dari Telegram
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

// Parse initData untuk mendapatkan informasi user
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

// Buat Custom JWT untuk Supabase
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
        exp: now + (24 * 60 * 60), // 24 hours
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

// Handle referral system - simplified version
async function handleReferral(newUserId, referrerId) {
    try {
        console.log('Referral feature temporarily disabled for stability');
        // TODO: Implement referral system when referrals table is ready
    } catch (error) {
        console.error('Referral handling error:', error);
    }
}
