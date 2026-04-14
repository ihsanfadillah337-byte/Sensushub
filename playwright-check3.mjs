import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];

  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });
  page.on('pageerror', error => { errors.push('PAGE: ' + error.message + '\n' + error.stack); });

  await page.goto('http://localhost:8080/auth');
  
  const inputs = await page.locator('input').all();
  if(inputs.length >= 2) {
    await inputs[0].fill('ihsanihsann666@gmail.com');
    await inputs[1].fill('ihsan123');
  }
  await Promise.all([
    page.waitForNavigation().catch(()=>{}),
    page.locator('button:has-text("Masuk")').click()
  ]);

  await page.goto('http://localhost:8080/dashboard/settings', {waitUntil: 'networkidle'});

  // Unlock the padlock
  console.log('Unlocking PIN...');
  const lockIcon = await page.$('.lucide-lock');
  if (lockIcon) {
    await lockIcon.click();
    await page.waitForTimeout(500);
    const pinInput = await page.locator('input[type="password"]');
    await pinInput.fill('123456'); // Default PIN
    await page.locator('button:has-text("Buka")').click();
    await page.waitForTimeout(500);
  }

  // Select KIB Peralatan dan Mesin
  console.log('Clicking Peralatan dan Mesin...');
  const textMatches = await page.locator(':has-text("Peralatan dan Mesin")').all();
  // We want the dropdown or the card? In DashboardSettings, master KIBs are shown as a list on the left!
  const kibItem = await page.locator('div').filter({ hasText: /^Peralatan dan Mesin$/ }).last();
  try {
    await kibItem.click();
  } catch (e) {
    // try any text match
    await page.locator('text=Peralatan dan Mesin').click();
  }
  
  await page.waitForTimeout(2000);

  if (errors.length > 0) {
    console.log('---- DETECTED ERRORS ----');
    console.log(errors.join('\n'));
  } else {
    // check vite overlay
    const overlay = await page.evaluate(() => {
        const vite = document.querySelector('vite-error-overlay');
        return vite ? vite.shadowRoot.textContent : null;
    });
    if(overlay) console.log('VITE ERROR:', overlay);
    else console.log('All clicks succeeded, no errors.');
  }

  await browser.close();
})();
