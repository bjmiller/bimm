const { chromium } = require('playwright-extra');

const main = async () => {
  console.log('executablePath:', chromium.executablePath());
  const context = await chromium.launchPersistentContext('/tmp/opencode/chosic-profile-test', {
    channel: 'chromium',
    headless: true,
    javaScriptEnabled: true,
    locale: 'en-US',
    serviceWorkers: 'allow',
    viewport: { width: 1366, height: 900 }
  });
  const page = await context.newPage();
  await page.goto('about:blank');
  const title = await page.title();
  const version = await page.evaluate(() => navigator.userAgent);
  await context.close();
  console.log('LAUNCH OK, title:', JSON.stringify(title));
  console.log('UA:', version);
};

main().catch((error) => {
  console.error('LAUNCH FAILED:', error.message);
  process.exit(1);
});
