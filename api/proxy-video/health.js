const express = require('express');
const router = express.Router();

// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Accept-Encoding, Accept-Language, Cache-Control, Connection, Host, If-Modified-Since, If-None-Match, User-Agent',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
};

/**
 * Health check endpoint
 * GET /api/proxy-video/healthz
 */
router.get('/healthz', (req, res) => {
    res.set(corsHeaders);

    res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        service: 'video-proxy'
    });
});

// Handle OPTIONS request for health endpoint
router.options('/healthz', (req, res) => {
    res.set(corsHeaders);
    res.status(200).end();
});

module.exports = router;
