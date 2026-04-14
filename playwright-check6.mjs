import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });
  page.on('pageerror', error => { errors.push('PAGE: ' + error.message + '\n' + error.stack); });

  await page.goto('http://localhost:8080/auth');
  const loginButton = await page.locator('button:has-text("Masuk")');
  const inputs = await page.locator('input').all();
  if(inputs.length >= 2) {
    await inputs[0].fill('ihsanihsann666@gmail.com');
    await inputs[1].fill('ihsan123');
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
    loginButton.click()
  ]);

  await page.goto('http://localhost:8080/dashboard/settings', { waitUntil: 'networkidle' });

  // Unlock PIN
  const lockIcon = await page.$('.lucide-lock');
  if (lockIcon) {
    await lockIcon.click();
    await page.waitForTimeout(500);
    const pinInput = await page.locator('input[type="password"]');
    await pinInput.fill('123456');
    await page.locator('button:has-text("Buka")').click();
    await page.waitForTimeout(1000);
  }

  // Click on "Peralatan"
  // Wait, the user said "pas abis isi pin dan klik peralatan dan mesin"
  const elements = await page.locator('div').filter({ hasText: 'Peralatan dan Mesin' }).all();
  for (const el of elements) {
      if (await el.isVisible()) {
          try {
             await el.click();
             await page.waitForTimeout(500);
          } catch(e) {}
      }
  }

  await page.waitForTimeout(2000);

  if (errors.length > 0) {
    console.log('---- DETECTED ERRORS ----');
    console.log(errors.join('\n'));
  } else {
    // Check vite overlay
    const overlay = await page.evaluate(() => {
        const vite = document.querySelector('vite-error-overlay');
        return vite ? vite.shadowRoot.textContent : null;
    });
    if(overlay) console.log('VITE ERROR OVERLAY:', overlay);
    else {
        // Did we hit ErrorBoundary?
        const text = await page.innerText('body');
        if (text.includes('Aplikasi Crash Mendadak')) {
            console.log('CRASHED INTO ERROR BOUNDARY:', text);
        } else {
            console.log('No Vite error, no crash logged. Test worked.');
        }
    }
  }

  await browser.close();
})();
