const express = require('express');
const fetch = require('node-fetch');
const { URL } = require('url');
const router = express.Router();

/**
 * Simple Video Proxy Server
 * Converts HTTP video URLs to HTTPS for mixed content issues
 */

// CORS headers for video streaming
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, Accept, Accept-Encoding, Accept-Language, Cache-Control, Connection, Host, If-Modified-Since, If-None-Match, User-Agent',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
};

// Video content types
const videoContentTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.m4v': 'video/x-m4v',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.mkv': 'video/x-matroska'
};

/**
 * Get content type from URL
 */
function getContentType(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        const extension = pathname.substring(pathname.lastIndexOf('.'));
        return videoContentTypes[extension] || 'video/mp4';
    } catch (error) {
        return 'video/mp4';
    }
}

/**
 * Validate video URL
 */
function validateVideoUrl(url) {
    try {
        const urlObj = new URL(url);

        // Check if it's a valid URL
        if (!urlObj.hostname) {
            return { isValid: false, error: 'Invalid URL format' };
        }

        // Check if it's a video file
        const pathname = urlObj.pathname.toLowerCase();
        const hasVideoExtension = Object.keys(videoContentTypes).some(ext =>
            pathname.includes(ext)
        );

        if (!hasVideoExtension) {
            return { isValid: false, error: 'URL does not appear to be a video file' };
        }

        return { isValid: true };
    } catch (error) {
        return { isValid: false, error: 'Invalid URL' };
    }
}

/**
 * Handle OPTIONS request for CORS preflight
 */
router.options('/stream', (req, res) => {
    res.set(corsHeaders);
    res.status(200).end();
});

/**
 * Main video proxy endpoint - GET method
 * GET /api/proxy-video/stream?u=<encoded_url>
 */
router.get('/stream', async (req, res) => {
    // Set CORS headers
    res.set(corsHeaders);

    try {
        const { u: encodedUrl } = req.query;

        // Validate query parameters
        if (!encodedUrl) {
            return res.status(400).json({
                error: 'Missing URL parameter',
                message: 'Please provide "u" parameter with encoded video URL'
            });
        }

        // Decode URL
        let videoUrl;
        try {
            videoUrl = decodeURIComponent(encodedUrl);
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid URL encoding',
                message: 'URL parameter is not properly encoded'
            });
        }

        // Validate video URL
        const validation = validateVideoUrl(videoUrl);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Invalid video URL',
                message: validation.error
            });
        }

        console.log('🎬 Video proxy request:', {
            videoUrl,
            userAgent: req.get('User-Agent'),
            range: req.get('Range')
        });

        // Prepare fetch options
        const fetchOptions = {
            method: 'GET',
            headers: {
                'User-Agent': req.get('User-Agent') || 'Mozilla/5.0 (compatible; VideoProxy/1.0)',
                'Accept': '*/*',
                'Accept-Encoding': 'identity',
                'Connection': 'keep-alive'
            }
        };

        // Handle range requests for video streaming
        const range = req.get('Range');
        if (range) {
            fetchOptions.headers['Range'] = range;
        }

        // Fetch video from source
        const response = await fetch(videoUrl, fetchOptions);

        if (!response.ok) {
            console.error('❌ Video fetch failed:', {
                status: response.status,
                statusText: response.statusText,
                videoUrl
            });

            return res.status(response.status).json({
                error: 'Video fetch failed',
                status: response.status,
                statusText: response.statusText
            });
        }

        // Set content type
        const contentType = getContentType(videoUrl);
        res.set('Content-Type', contentType);

        // Set content length if available
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            res.set('Content-Length', contentLength);
        }

        // Set range headers for streaming
        const acceptRanges = response.headers.get('accept-ranges');
        if (acceptRanges) {
            res.set('Accept-Ranges', acceptRanges);
        }

        const contentRange = response.headers.get('content-range');
        if (contentRange) {
            res.set('Content-Range', contentRange);
        }

        // Set cache headers
        res.set({
            'Cache-Control': 'public, max-age=3600',
            'ETag': response.headers.get('etag'),
            'Last-Modified': response.headers.get('last-modified')
        });

        // Stream video content
        console.log('✅ Streaming video:', {
            videoUrl,
            contentType,
            contentLength,
            range: range || 'full'
        });

        // Pipe the response
        response.body.pipe(res);

        // Handle errors during streaming
        response.body.on('error', (error) => {
            console.error('❌ Video streaming error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Video streaming failed',
                    message: error.message
                });
            }
        });

    } catch (error) {
        console.error('❌ Video proxy error:', error);

        if (!res.headersSent) {
            res.status(500).json({
                error: 'Internal server error',
                message: error.message
            });
        }
    }
});

/**
 * Test endpoint for debugging
 * GET /api/proxy-video/test?url=<video_url>
 */
router.get('/test', (req, res) => {
    // Set CORS headers
    res.set(corsHeaders);

    const { url } = req.query;

    if (!url) {
        return res.json({
            error: 'Missing URL parameter',
            usage: '/api/proxy-video/test?url=<video_url>'
        });
    }

    const validation = validateVideoUrl(url);
    const contentType = getContentType(url);

    res.json({
        url,
        validation,
        contentType,
        timestamp: new Date().toISOString()
    });
});

// Handle OPTIONS request for test endpoint
router.options('/test', (req, res) => {
    res.set(corsHeaders);
    res.status(200).end();
});

module.exports = router;
