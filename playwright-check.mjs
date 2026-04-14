import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];

  // Collect all console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
       errors.push('CONSOLE_ERROR: ' + msg.text());
    }
  });

  page.on('pageerror', error => {
    errors.push('PAGE_ERROR: ' + error.message + '\n' + error.stack);
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
    page.waitForNavigation({ waitUntil: 'networkidle' }).catch(e => console.log('Navigation wait timed out (might use SPA routing)')),
    loginButton.click()
  ]);

  await page.waitForTimeout(2000);

  console.log('Navigating to settings...');
  await page.goto('http://localhost:8080/dashboard/settings', { waitUntil: 'networkidle', timeout: 5000 }).catch(e => {});

  await page.waitForTimeout(3000); // Give React time to render or crash

  if (errors.length > 0) {
    console.log('---- DETECTED ERRORS ----');
    console.log(errors.join('\n\n'));
  } else {
    const overlay = await page.evaluate(() => {
        const vite = document.querySelector('vite-error-overlay');
        return vite ? vite.shadowRoot.textContent : null;
    });
    if(overlay) console.log('VITE ERROR:', overlay);
    else {
      const body = await page.evaluate(()=>document.body.innerText.substring(0, 500));
      console.log('No obvious errors collected. Body:', body);
    }
  }

  await browser.close();
})();
