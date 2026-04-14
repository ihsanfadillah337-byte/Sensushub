import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: false }); // Run headed just in case headless has issues, though wait we are in a headless environment. Let's keep headless: true
  const page = await browser.newPage();
  
  // Collect all console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
       console.log('CONSOLE_ERROR:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE_ERROR:', error.message);
    console.log('STACK:', error.stack);
  });

  console.log('Navigating to auth...');
  await page.goto('http://localhost:8080/auth', { waitUntil: 'networkidle', timeout: 5000 });
  
  const loginButton = await page.locator('button:has-text("Masuk")');
  console.log('Logging in...');
  
  const inputs = await page.locator('input').all();
  if(inputs.length >= 2) {
    await inputs[0].fill('ihsanihsann666@gmail.com');
    await inputs[1].fill('ihsan123');
  }
  
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {}),
    loginButton.click()
  ]);

  await page.waitForTimeout(2000);

  console.log('Navigating to settings...');
  await page.goto('http://localhost:8080/dashboard/settings', { waitUntil: 'networkidle', timeout: 5000 }).catch(() => {});

  await page.waitForTimeout(2000);

  // Unlock the padlock
  console.log('Unlocking PIN...');
  const lockIcon = await page.$('.lucide-lock');
  if (lockIcon) {
    await lockIcon.click();
    await page.waitForTimeout(500);
    const pinInput = await page.locator('input[type="password"]');
    await pinInput.fill('123456');
    await page.locator('button:has-text("Buka")').click();
    await page.waitForTimeout(1000);
  }

  // FORCE click "Peralatan dan Mesin"
  console.log('Selecting Peralatan...');
  const btn = await page.locator('divRoleOfKIB:has-text("Peralatan dan Mesin")'); // Pseudo code to describe what I want
  // Real locator:
  const items = await page.locator('div.border-border').all(); // finding the list
  for (const item of items) {
    const text = await item.innerText();
    if (text.includes('Peralatan dan Mesin')) {
       console.log('Clicking target:', text.substring(0, 30));
       await item.click();
       break;
    }
  }

  await page.waitForTimeout(3000); // Wait to see if crash triggers

  // Check vite overlay
  const overlay = await page.evaluate(() => {
      const vite = document.querySelector('vite-error-overlay');
      return vite ? vite.shadowRoot.textContent : null;
  });
  if(overlay) console.log('VITE ERROR OVERLAY:', overlay);
  else console.log('No Vite error overlay visible. (Might be silently crashed or actually working)');

  await browser.close();
})();
