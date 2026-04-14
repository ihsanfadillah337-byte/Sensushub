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

  // Create a new KIB "Peralatan" again since they deleted and re-added
  await page.locator('input[placeholder="Label KIB..."]').fill('Peralatan Test');
  await page.locator('input[placeholder="Kode KIB..."]').fill('PT');
  
  // Click Tambah for Master KIB
  const addKibBtns = await page.locator('button:has-text("Tambah")').all();
  await addKibBtns[0].click(); // or 1 depending on UI layout
  await page.waitForTimeout(1000);

  // Click on "Peralatan Test"
  try {
    await page.locator('div').filter({ hasText: /^Peralatan Test$/ }).last().click();
  } catch(e) {
    await page.locator('text=Peralatan Test').first().click();
  }
  await page.waitForTimeout(1000);

  // Fill in the new dropdown as usual
  await page.locator('input[placeholder="Nama Kolom Bar..."]').fill('Status Peralatan');
  
  // Use keyboard/combobox to select dropdown
  const comboboxes = await page.locator('button[role="combobox"]').all();
  if (comboboxes.length >= 2) {
    await comboboxes[1].click(); // second combobox is Type
    await page.locator('div[role="option"]:has-text("Dropdown Berkode")').click();
  }
  await page.waitForTimeout(500);

  // Fill "Opsi"
  await page.locator('button:has-text("Opsi")').first().click();
  
  const optionInputs = await page.locator('input[placeholder="Label ops..."]').all();
  const codeInputs = await page.locator('input[placeholder="Kode..."]').all();
  if (optionInputs.length > 0 && codeInputs.length > 0) {
    await optionInputs[0].fill('Rusak');
    await codeInputs[0].fill('1');
  }

  // Click Tambah (Save Column)
  const allTambahs = await page.locator('button:has-text("Tambah")').all();
  await allTambahs[allTambahs.length - 1].click();

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
    else console.log('No Vite error, no crash logged. Test worked.');
  }

  await browser.close();
})();
