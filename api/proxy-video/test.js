const express = require('express');
const router = express.Router();

/**
 * Health check endpoint for video proxy server
 * GET /api/proxy-video/health
 */
router.get('/health', (req, res) => {
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

module.exports = router;
