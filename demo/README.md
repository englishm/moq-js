# MoQT Demo Site

A clean, minimal demo site showcasing the MoQT (Media over QUIC Transport) protocol for ultra-low latency video streaming.

## Overview

This demo consists of two main pages:
- **Publisher (`index.html`)**: Start broadcasting and generate player links
- **Player (`player.html`)**: View live streams with ultra-low latency

## Quick Start

### Local Development

1. **Setup and serve the demo**:
   ```bash
   # From the root moq-js directory
   npm run dev           # Watch lib/, rebuild @moq-js/player, and serve the demo
   ```

2. **Open the publisher**:
   - Navigate to http://localhost:8080/
   - Click "Start Publishing" to begin broadcasting
   - Copy the generated player link to share with viewers

**Note**: We use a custom Node.js server that includes the required WebTransport headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, etc.) that simple static servers don't support.

## Configuration

### Environment Switching

The demo can switch between localhost (development) and Cloudflare (production) configurations:

**Edit `config.js`**:
```javascript
// Change this to switch environments
const USE_CLOUDFLARE = false;  // Set to true for production
```

**Localhost Configuration** (Development):
- Relay: `https://localhost:4443`
- Requires fingerprint verification
- Used during local development

**Cloudflare Configuration** (Production):
- Relay: `https://relay.cloudflare.mediaoverquic.com`
- Uses trusted certificates (no fingerprint needed)
- Used for production deployment

## Deployment to Cloudflare Pages

### 1. Prepare for Deployment

1. **Switch to production configuration**:
   ```javascript
   // In config.js
   const USE_CLOUDFLARE = true;
   ```

2. **Create `_headers` file** in the demo directory:
   ```
   /*
     Cross-Origin-Opener-Policy: same-origin
     Cross-Origin-Embedder-Policy: require-corp
     Cross-Origin-Resource-Policy: cross-origin
   ```

### 2. Deploy to Cloudflare Pages

#### Option A: Git Integration
1. Push your code to a Git repository
2. Connect the repository to Cloudflare Pages
3. Set build output directory to `demo`
4. Deploy

#### Option B: Direct Upload
1. Zip the `demo` directory contents
2. Upload directly to Cloudflare Pages
3. Deploy

### 3. Required Headers

The following headers are **essential** for WebTransport to work:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: cross-origin
```

**Create `_headers` file**:
```bash
cd demo
cat > _headers << 'EOF'
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: cross-origin
EOF
```

## File Structure

```
demo/
├── index.html          # Publisher page (main landing)
├── player.html         # Player page for viewers
├── style.css           # Minimal, clean styling
├── config.js           # Environment configuration
├── _headers            # Cloudflare Pages headers (for deployment)
└── README.md           # This file
```

## Browser Compatibility

**Supported Browsers**:
- Chrome 97+ (required for WebTransport)
- Edge 97+
- Other Chromium-based browsers

**Requirements**:
- WebTransport support (Chrome/Edge 97+)
- WebRTC support
- Modern JavaScript (ES6+)
- Static file server (no build process needed)

## Features

### Publisher Page
- ✅ One-click publishing with `<publisher-moq>` web component
- ✅ Auto-generated unique namespace for each session
- ✅ Shareable player links with copy functionality
- ✅ Real-time connection status
- ✅ Environment configuration display

### Player Page
- ✅ Clean video player interface with `<video-moq>` component
- ✅ Automatic connection to streams via URL parameters
- ✅ Fullscreen support
- ✅ Share functionality (native share API + clipboard fallback)
- ✅ Connection status and basic latency estimation
- ✅ Error handling and reconnection

## Troubleshooting

### Stream Not Loading
- Verify the publisher is still active and broadcasting
- Check browser compatibility (Chrome/Edge 97+)
- Ensure proper headers are configured (for Cloudflare Pages)
- Try refreshing or reconnecting

### High Latency
- MoQT is optimized for ultra-low latency streaming
- Actual latency depends on geographic distance to edge servers
- Network conditions can affect performance

### Development Issues
- Make sure the local server is running (`npm run dev`)
- Check browser console for WebTransport errors
- Verify the demo is loading the current player bundle from `lib/dist` via the local dev server
- Ensure all required headers are present (our server includes them automatically)
- If using Python server (`npm run serve:python`), note that required headers are missing

### Deployment Issues
- Verify `_headers` file is in the correct location
- Check Cloudflare Pages build logs
- Ensure `USE_CLOUDFLARE = true` in config.js
- Verify the MoQ library path is correct

## Development Workflow

1. **Start Local Development**:
   ```bash
   # From the root moq-js directory
   npm run dev          # Start local server with headers and watch the player bundle
   ```

2. **Test Locally**:
   - Publisher: http://localhost:8080/
   - Player: Use generated links

3. **Prepare for Production**:
   - Run `npm run deploy:prepare` to switch to Cloudflare config
   - Ensure `_headers` file is present
   - Test configuration

4. **Deploy**:
   - Run `npm run build` from the repo root so the current IIFE bundles from
     `lib/dist` are copied into `demo/lib`
   - Upload `demo/` folder contents to Cloudflare Pages
   - For local development, the demo server serves the current `lib/dist` bundles directly
   - For production deploys, the published `demo/` folder contains synced copies
     of the current player bundles in `demo/lib`
   - Run `npm run deploy:restore` to switch back to dev config

## Future Enhancements

### Planned Features
- **Latency Measurement**: Real-time glass-to-glass latency tracking
- **Geographic Demo**: Show user location relative to edge servers
- **Quality Metrics**: Connection quality and performance indicators
- **Multiple Streams**: Support for multiple concurrent streams
- **Recording**: Stream recording and playback capabilities

### Design Evolution
- Enhanced styling inspired by realtime.cloudflare.com
- Sophisticated color schemes and animations
- Advanced micro-interactions
- Professional grid layouts

## Contributing

1. Follow the existing code style and structure
2. Test thoroughly in both localhost and Cloudflare configurations
3. Update documentation for any new features
4. Ensure cross-browser compatibility

## License

This demo is part of the MoQT protocol demonstration project. Please refer to the main project license for usage terms.
