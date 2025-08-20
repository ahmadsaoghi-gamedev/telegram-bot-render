// XENDIT ADDON - Add these endpoints to your existing index.js

// Add these imports at the top of your existing index.js
const crypto = require('crypto');

// Add Xendit configuration after your existing configurations
const XENDIT_CONFIG = {
    apiKey: process.env.XENDIT_SECRET_KEY,
    baseUrl: 'https://api.xendit.co',
    isTestMode: true,
    merchantId: 'SHREELS001',
    merchantName: 'SHReels Premium'
};

// Add Xendit helper functions
const getXenditHeaders = () => ({
    'Authorization': `Basic ${Buffer.from(XENDIT_CONFIG.apiKey + ':').toString('base64')}`,
    'Content-Type': 'application/json',
    'X-IDEMPOTENCY-KEY': `xendit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
});

const verifyWebhookSignature = (payload, signature, secret) => {
    if (!secret) return true; // Skip verification if no secret
    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
    return signature === expectedSignature;
};

// ADD THESE ENDPOINTS TO YOUR EXISTING app.get('/') or create new ones:

// Health check endpoint (add this if you don't have it)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            supabase: 'connected',
            xendit: XENDIT_CONFIG.apiKey ? 'configured' : 'not_configured'
        }
    });
});

// Xendit webhook endpoint
app.post('/api/xendit/webhook', async (req, res) => {
    try {
        const payload = JSON.stringify(req.body);
        const signature = req.headers['x-xendit-signature'];

        console.log('📦 Xendit webhook received:', {
            id: req.body.id,
            external_id: req.body.external_id,
            status: req.body.status,
            amount: req.body.amount
        });

        // Verify webhook signature (optional but recommended)
        if (process.env.WEBHOOK_SECRET) {
            if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET)) {
                console.error('❌ Invalid webhook signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        const { id, external_id, status, amount, paid_amount, paid_at } = req.body;

        // Process the webhook using Supabase function
        const { data, error } = await supabase.rpc('process_xendit_webhook', {
            invoice_id: id,
            payment_status: status,
            paid_amount: paid_amount || amount,
            paid_at: paid_at ? new Date(paid_at).toISOString() : new Date().toISOString()
        });

        if (error) {
            console.error('❌ Webhook processing error:', error);
            return res.status(500).json({ error: 'Webhook processing failed' });
        }

        console.log('✅ Webhook processed successfully');
        res.status(200).json({ success: true });

    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Payment status check endpoint
app.get('/api/payment/:invoiceId', async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const { data, error } = await supabase
            .from('payment_transactions')
            .select(`*, vip_packages(name, duration_days), profiles(telegram_id, is_vip, vip_expires_at)`)
            .eq('xendit_invoice_id', invoiceId)
            .single();

        if (error) {
            console.error('❌ Payment status check error:', error);
            return res.status(404).json({ error: 'Payment not found' });
        }

        res.json({ success: true, payment: data });

    } catch (error) {
        console.error('❌ Payment status error:', error);
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
        const { data: vipPackage, error: packageError } = await supabase
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

        // Create Xendit invoice
        const response = await fetch(`${XENDIT_CONFIG.baseUrl}/v2/invoices`, {
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
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('telegram_id', telegramId)
            .single();

        if (profile) {
            await supabase
                .from('payment_transactions')
                .insert({
                    user_id: profile.id,
                    vip_package_id: packageId,
                    xendit_invoice_id: invoice.id,
                    amount: vipPackage.price,
                    status: 'PENDING',
                    external_id: externalId
                });
        }

        console.log('✅ Xendit invoice created:', invoice.id);
        res.json({ success: true, invoice });

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

        const response = await fetch(`${XENDIT_CONFIG.baseUrl}/v2/invoices/${invoiceId}`, {
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

// INSTRUCTIONS:
// 1. Copy the imports and configurations to the top of your existing index.js
// 2. Add the helper functions after your existing configurations
// 3. Add the endpoints after your existing endpoints
// 4. Keep all your existing Telegram bot functionality intact
