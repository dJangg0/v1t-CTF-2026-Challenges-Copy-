const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

function buildReportUrl(rawPath, config) {
  if (!rawPath || rawPath.length > 2048) {
    throw new Error('Invalid path');
  }

  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\')) {
    throw new Error('Only same-site absolute paths are supported');
  }

  const baseUrl = new URL(config.shopBaseUrl);
  const targetUrl = new URL(rawPath, baseUrl);
  if (targetUrl.origin !== baseUrl.origin) {
    throw new Error('External hosts are not supported');
  }

  return targetUrl.toString();
}

async function loginIfNeeded(page, config) {
  if (!config.webReviewLogin) {
    return;
  }

  try {
    await page.goto(`${config.shopBaseUrl}/login`, {waitUntil: 'domcontentloaded', timeout: 8000});
    await page.waitForSelector('input[name="email"]', {timeout: 5000});
    await page.type('input[name="email"]', config.customerEmail, {delay: 10});
    await page.type('input[name="password"]', config.customerPassword, {delay: 10});
    await Promise.allSettled([
      page.waitForNavigation({waitUntil: 'domcontentloaded', timeout: 8000}),
      page.click('#submit-login, button[name="submitLogin"], button[type="submit"]'),
    ]);
  } catch (error) {
    console.warn(`[web] login skipped or failed: ${error.message}`);
  }
}

async function visitUrl(url, config) {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'anishop-web-'));
  let browser;

  try {
    browser = await puppeteer.launch({
      browser: 'firefox',
      protocol: 'webDriverBiDi',
      executablePath: config.firefoxPath,
      headless: true,
      userDataDir: profileDir,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--headless"],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(8000);
    page.on('dialog', async (dialog) => {
      console.log(`[web] dialog: ${dialog.message()}`);
      await dialog.dismiss().catch(() => {});
    });

    await loginIfNeeded(page, config);
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 8000});
    await new Promise((resolve) => setTimeout(resolve, config.visitMs));

    return {
      status: 'ok',
      url,
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[web] page review failed for ${url}:`, error);
    return {
      status: `error: ${error.message}`,
      url,
      finishedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await fs.rm(profileDir, {recursive: true, force: true}).catch(() => {});
  }
}

module.exports = {
  buildReportUrl,
  visitUrl,
};
