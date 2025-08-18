// api/auth.js

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Inisialisasi Supabase dengan kunci ANONYMOUS
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Inisialisasi Supabase dengan kunci SERVICE_ROLE (untuk tugas admin)
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Set CORS headers for actual requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: `Method ${req.method} is not allowed. Use POST instead.`
    });
  }

  try {
    const { initData } = req.body;
    if (!initData) {
      return res.status(400).json({ error: 'initData is required' });
    }

    // --- 1. Verifikasi Data dari Telegram ---
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    const userData = JSON.parse(urlParams.get('user'));

    urlParams.delete('hash');
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return res.status(403).json({ error: 'Invalid Telegram data' });
    }

    // --- 2. Cari atau Buat Profil Pengguna ---
    const telegramId = userData.id;

    let { data: profile } = await supabase
      .from('profiles')
      .select('id, telegram_id')
      .eq('telegram_id', telegramId)
      .single();

    // JIKA PROFIL TIDAK DITEMUKAN, BUAT PENGGUNA BARU
    if (!profile) {
      // a. Buat pengguna di sistem auth.users Supabase
      const { data: newUser, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email: `${telegramId}@telegram.user`, // Email unik dummy
        email_confirm: true, // Langsung aktifkan
      });

      if (userError) throw userError;

      // b. Buat profil di tabel 'profiles'
      const { data: newProfile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: newUser.user.id, // Gunakan ID dari auth.users
          telegram_id: telegramId,
          first_name: userData.first_name,
          last_name: userData.last_name || null,
          username: userData.username || null,
          photo_url: userData.photo_url || null,
        })
        .select('id, telegram_id')
        .single();

      if (profileError) throw profileError;

      profile = newProfile;
    }

    // --- 3. Buat JWT Kustom ---
    const token = jwt.sign(
      {
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24), // Token berlaku 24 jam
        sub: profile.id,
        app_metadata: {
          provider: 'telegram',
          providers: ['telegram'],
        },
      },
      process.env.SUPABASE_JWT_SECRET
    );

    return res.status(200).json({ token });

  } catch (error) {
    console.error('Auth API Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}