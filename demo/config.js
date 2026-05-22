// MoQT Demo Site Configuration
// Manages relay settings for development and production environments

// Development configuration (localhost)
const LOCALHOST_CONFIG = {
	relay: "https://localhost:4443",
	fingerprint: "https://localhost:4443/fingerprint",
	environment: "development"
};

// Production configuration (Cloudflare)
const CLOUDFLARE_CONFIG = {
	relay: "https://draft-16-manish.cloudflare.mediaoverquic.com",
	fingerprint: null, // No fingerprint needed for trusted certificate
	environment: "production"
};

// Current active configuration
// Toggle this to switch between environments
const USE_CLOUDFLARE = true;

// Export the active configuration
const CONFIG = USE_CLOUDFLARE ? CLOUDFLARE_CONFIG : LOCALHOST_CONFIG;

// Helper functions
const getRelayUrl = () => CONFIG.relay;
const getFingerprintUrl = () => CONFIG.fingerprint;
const getEnvironment = () => CONFIG.environment;
const isLocalhost = () => CONFIG.environment === "development";
const isProduction = () => CONFIG.environment === "production";

// Export configuration and helpers
window.MoQConfig = {
	CONFIG,
	LOCALHOST_CONFIG,
	CLOUDFLARE_CONFIG,
	getRelayUrl,
	getFingerprintUrl,
	getEnvironment,
	isLocalhost,
	isProduction
};

// Log current configuration
console.log(`MoQT Demo initialized with ${CONFIG.environment} configuration:`, CONFIG);
