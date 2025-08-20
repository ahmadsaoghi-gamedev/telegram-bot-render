// Railway Xendit API Endpoints - Secure backend for Xendit operations
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

// Xendit API Configuration (Server-side only)
const XENDIT_CONFIG = {
    apiKey: process.env.XENDIT_SECRET_KEY,
    baseUrl: 'https://api.xendit.co',
    isTestMode: true,
    merchantId: 'SHREELS001',
    merchantName: 'SHReels Premium'
};

// Get Xendit API headers
const getXenditHeaders = () => ({
    'Authorization': `Basic ${Buffer.from(XENDIT_CONFIG.apiKey + ':').toString('base64')}`,
    'Content-Type': 'application/json',
    'X-IDEMPOTENCY-KEY': `xendit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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
            console.error('Xendit API Error:', errorData);
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

module.exports = { app };
