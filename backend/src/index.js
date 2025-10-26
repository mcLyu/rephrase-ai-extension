// src/index.js

// Rate limiting using Cloudflare KV (requires KV namespace binding)
// Simple in-memory rate limiting for single-worker deployments
class RateLimiter {
    constructor(maxRequests = 100, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map();
    }

    async check(identifier) {
        const now = Date.now();
        const key = identifier;

        // Clean old entries
        if (this.requests.has(key)) {
            const userData = this.requests.get(key);
            userData.timestamps = userData.timestamps.filter(t => now - t < this.windowMs);

            if (userData.timestamps.length >= this.maxRequests) {
                return false;
            }

            userData.timestamps.push(now);
        } else {
            this.requests.set(key, { timestamps: [now] });
        }

        return true;
    }
}

const rateLimiter = new RateLimiter(100, 60000); // 100 requests per minute per IP

// Input validation
function validateRequest(body) {
    if (!body || typeof body !== 'object') {
        throw new Error('Request body must be a JSON object');
    }

    const { model, messages } = body;

    // Validate model
    if (!model || typeof model !== 'string') {
        throw new Error('Model must be a non-empty string');
    }

    if (model.length > 200) {
        throw new Error('Model name is too long');
    }

    // Validate messages
    if (!Array.isArray(messages)) {
        throw new Error('Messages must be an array');
    }

    if (messages.length === 0) {
        throw new Error('Messages array cannot be empty');
    }

    if (messages.length > 50) {
        throw new Error('Too many messages in conversation');
    }

    // Validate each message
    for (const msg of messages) {
        if (!msg || typeof msg !== 'object') {
            throw new Error('Each message must be an object');
        }

        if (!msg.role || typeof msg.role !== 'string') {
            throw new Error('Message role is required and must be a string');
        }

        if (!['system', 'user', 'assistant'].includes(msg.role)) {
            throw new Error('Message role must be system, user, or assistant');
        }

        if (!msg.content || typeof msg.content !== 'string') {
            throw new Error('Message content is required and must be a string');
        }

        if (msg.content.length > 50000) {
            throw new Error('Message content is too long');
        }
    }

    return { model, messages };
}

var index_default = {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, X-Client-Key",
                    "Access-Control-Max-Age": "86400"
                }
            });
        }

        // Only allow POST requests
        if (request.method !== "POST") {
            return new Response(JSON.stringify({
                error: "Method not allowed. Only POST requests are accepted."
            }), {
                status: 405,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Allow": "POST, OPTIONS"
                }
            });
        }

        try {
            // Rate limiting
            const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
            const allowed = await rateLimiter.check(clientIP);

            if (!allowed) {
                return new Response(JSON.stringify({
                    error: "Rate limit exceeded. Please try again later."
                }), {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Retry-After": "60"
                    }
                });
            }

            // Parse and validate JSON
            let requestBody;
            try {
                requestBody = await request.json();
            } catch (e) {
                return new Response(JSON.stringify({
                    error: "Invalid JSON in request body"
                }), {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            }

            // Validate request structure
            const { model, messages } = validateRequest(requestBody);

            // Make request to OpenRouter
            const httpReferer = env.HTTP_REFERER || "chrome://extensions/";

            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${env.OPENROUTER_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": httpReferer
                },
                body: JSON.stringify({ model, messages })
            });

            const data = await response.text();

            return new Response(data, {
                status: response.status,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        } catch (e) {
            // Log error for debugging (visible in Cloudflare dashboard)
            console.error('Worker error:', e);

            // Don't expose internal error details to client
            const isValidationError = e.message && (
                e.message.includes('must be') ||
                e.message.includes('required') ||
                e.message.includes('too long') ||
                e.message.includes('cannot be empty')
            );

            return new Response(JSON.stringify({
                error: isValidationError ? e.message : "Internal server error"
            }), {
                status: isValidationError ? 400 : 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                }
            });
        }
    }
};
export {
    index_default as default
};
//# sourceMappingURL=index.js.map
