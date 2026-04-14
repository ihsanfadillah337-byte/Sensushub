import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];

  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });
  page.on('pageerror', error => { errors.push('PAGE: ' + error.message); });

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
    await pinInput.fill('123456'); // Default PIN or user PIN
    await page.locator('button:has-text("Buka")').click();
    await page.waitForTimeout(500);
  }

  // Select KIB Master
  console.log('Selecting KIB...');
  const selectTrigger = await page.locator('button[role="combobox"]').first();
  if (selectTrigger) {
    await selectTrigger.click();
    await page.waitForTimeout(500);
    // Click "Tanah" or something
    const firstItem = await page.locator('div[role="option"]').nth(0);
    if(firstItem) await firstItem.click();
    await page.waitForTimeout(1000);
  }

  console.log('Clicking pencil icons...');
  // Click pencil on a column
  const pencils = await page.locator('.lucide-pencil').all();
  console.log('Found pencils:', pencils.length);
  for (const p of pencils) {
    try {
      await p.click({ force: true });
      await page.waitForTimeout(500);
    } catch(e) {}
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
