#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;
const DEMO_ROOT = __dirname;
const LIB_DIST_ROOT = path.resolve(__dirname, '..', 'lib', 'dist');

// MIME types for common files
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return mimeTypes[ext] || 'application/octet-stream';
}

function safeResolve(root, relativePath) {
    const resolved = path.resolve(root, relativePath);
    if (resolved === root || resolved.startsWith(root + path.sep)) {
        return resolved;
    }

    return null;
}

function resolvePath(requestPathname) {
    const decoded = decodeURIComponent(requestPathname);

    if (decoded === '/') {
        return safeResolve(DEMO_ROOT, 'index.html');
    }

    if (decoded.startsWith('/lib/')) {
        return safeResolve(LIB_DIST_ROOT, decoded.slice('/lib/'.length));
    }

    return safeResolve(DEMO_ROOT, decoded.replace(/^\//, ''));
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    const pathname = resolvePath(parsedUrl.pathname || '/');

    if (!pathname) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 - Forbidden');
        return;
    }

    // Set required headers for WebTransport and MoQT (enables SharedArrayBuffer)
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Handle CORS for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    fs.stat(pathname, (err, stats) => {
        if (err) {
            // File not found
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 - File Not Found');
            return;
        }

        if (stats.isFile()) {
            // Serve the file
            const contentType = getContentType(pathname);
            res.setHeader('Content-Type', contentType);

            // This server is only used for local development, so always disable
            // caching to ensure demo pages pick up fresh rollup output.
            res.setHeader('Cache-Control', 'no-store');

            const fileStream = fs.createReadStream(pathname);
            fileStream.pipe(res);

            fileStream.on('error', (error) => {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 - Internal Server Error');
            });
        } else {
            // Directory - try to serve index.html
            const indexPath = path.join(pathname, 'index.html');
            fs.stat(indexPath, (indexErr, indexStats) => {
                if (!indexErr && indexStats.isFile()) {
                    res.setHeader('Content-Type', 'text/html');
                    const fileStream = fs.createReadStream(indexPath);
                    fileStream.pipe(res);
                } else {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 - File Not Found');
                }
            });
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 MoQT Demo Server running at http://localhost:${PORT}/`);
    console.log(`📋 Required headers enabled for WebTransport support`);
    console.log(`🛑 Press Ctrl+C to stop the server`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});
