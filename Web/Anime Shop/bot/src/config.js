function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig(env = process.env) {
  return {
    host: env.HOST || '0.0.0.0',
    port: readPositiveInt(env.PORT, 8000),
    firefoxPath: env.FIREFOX_PATH || '/opt/firefox/firefox',
    visitMs: readPositiveInt(env.WEB_REVIEW_TIMEOUT_MS, 10000),
    maxConcurrentVisits: readPositiveInt(env.WEB_REVIEW_MAX_CONCURRENT, 20),
    shopBaseUrl: (env.SHOP_BASE_URL || 'http://app').replace(/\/+$/, ''),
    webReviewLogin: env.WEB_REVIEW_LOGIN !== '0',
    customerEmail: env.SHOP_CUSTOMER_EMAIL || 'assistant@anishop.local',
    customerPassword: env.SHOP_CUSTOMER_PASSWORD || 'assistant_demo',
  };
}

module.exports = {
  getConfig,
};
