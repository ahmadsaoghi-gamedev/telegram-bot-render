const express = require('express');
const router = express.Router();

// CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Accept-Encoding, Accept-Language, Cache-Control, Connection, Host, If-Modified-Since, If-None-Match, User-Agent',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
};

/**
 * Health check endpoint for video proxy server
 * GET /api/proxy-video/health
 */
router.get('/health', (req, res) => {
    // Set CORS headers
    res.set(corsHeaders);
    
    res.json({
        status: 'ok',
        message: 'Video proxy server is running',
        timestamp: new Date().toISOString(),
        service: 'video-proxy',
        version: '1.0.0',
        endpoints: {
            health: 'GET /api/proxy-video/health',
            proxy: 'POST /api/proxy-video',
            test: 'GET /api/proxy-video/test'
        }
    });
});

// Handle OPTIONS request for CORS preflight
router.options('/health', (req, res) => {
    res.set(corsHeaders);
    res.status(200).end();
});

module.exports = router;
