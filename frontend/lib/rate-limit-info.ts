/**
 * Rate limit information and helper functions for Mistral API
 */

export interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfter?: number;
  message: string;
  suggestions: string[];
}

export function parseRateLimitError(error: any): RateLimitInfo {
  const errorMessage = error?.message || error?.error || '';
  const isRateLimit = errorMessage.includes('Rate limit exceeded') || 
                     errorMessage.includes('429') ||
                     error?.status === 429;

  if (!isRateLimit) {
    return {
      isRateLimited: false,
      message: errorMessage,
      suggestions: []
    };
  }

  return {
    isRateLimited: true,
    message: "API rate limit exceeded",
    suggestions: [
      "Wait 1-2 minutes before trying again",
      "The free tier has very low rate limits (1-2 requests per minute)",
      "Consider upgrading to a paid Mistral AI plan for higher limits",
      "Check your Mistral console at https://admin.mistral.ai/plateforme/limits",
      "Try using a smaller image or simpler diagram"
    ]
  };
}

export function getRateLimitAdvice(): string[] {
  return [
    "🔄 **Automatic Retry**: The system will automatically retry your request with delays",
    "⏱️ **Free Tier Limits**: Free accounts have ~1-2 requests per minute",
    "💰 **Upgrade Options**: Paid plans start at $10/month for higher limits",
    "📊 **Monitor Usage**: Check your limits at https://admin.mistral.ai/plateforme/limits",
    "🖼️ **Optimize Images**: Smaller, clearer diagrams process faster and use fewer tokens"
  ];
}