import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────
// E2E: Турнир из 4 кортов (стандартный режим, не IPT)
// ─────────────────────────────────────────────────────────────

/** Build a 4×4×4 scores array with given last-round value */
function buildScores({ lastRoundValue = null }: { lastRoundValue?: number | null } = {}) {
  return Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, (_, ri) =>
      ri < 3
        ? [10, 8, 5, 7] // rounds 0-2 fully filled
        : [lastRoundValue, lastRoundValue, lastRoundValue, lastRoundValue] // round 3
    )
  );
}

/** Set localStorage keys before the page JS runs */
async function setupLocalStorage(
  page: import('@playwright/test').Page,
  scores: (number | null)[][][]
) {
  await page.addInitScript((sc) => {
    localStorage.setItem('kotc_version', '1.1');
    localStorage.setItem('kotc3_cfg', JSON.stringify({ ppc: 4, nc: 4, fixedPairs: false }));
    localStorage.setItem('kotc3_scores', JSON.stringify(sc));
  }, scores);
}

test.describe('Турнир из 4 кортов', () => {
  test('1. Навигация: 4 корта (К1–К4) отображаются в нав-баре', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('.nb[data-tab="home"]').waitFor({ timeout: 15_000 });

    for (let ci = 0; ci < 4; ci++) {
      const pill = page.locator(`.nav-pill[data-tab="${ci}"]`);
      await expect(pill).toBeVisible();
      await expect(pill.locator('.pill-main')).toContainText(`К${ci + 1}`);
    }
  });

  test('2. Финальные дивизионы заблокированы до ввода очков', async ({ page }) => {
    // Empty scores — no last-round data
    await setupLocalStorage(page, buildScores({ lastRoundValue: null }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('.nb[data-tab="home"]').waitFor({ timeout: 15_000 });

    for (const tab of ['hard', 'advance', 'medium', 'lite']) {
      const pill = page.locator(`.pill-div-btn[data-tab="${tab}"]`);
      await expect(pill).toHaveClass(/pill-div-locked/);
    }
  });

  test('3. Нулевые очки в 4-м туре разблокируют дивизионы (основной баг)', async ({ page }) => {
    // Last round filled with zeros — the critical edge case
    await setupLocalStorage(page, buildScores({ lastRoundValue: 0 }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('.nb[data-tab="home"]').waitFor({ timeout: 15_000 });

    for (const tab of ['hard', 'advance', 'medium', 'lite']) {
      const pill = page.locator(`.pill-div-btn[data-tab="${tab}"]`);
      await expect(pill).not.toHaveClass(/pill-div-locked/);
    }
  });

  test('4. Ненулевые очки в 4-м туре разблокируют дивизионы', async ({ page }) => {
    await setupLocalStorage(page, buildScores({ lastRoundValue: 5 }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('.nb[data-tab="home"]').waitFor({ timeout: 15_000 });

    for (const tab of ['hard', 'advance', 'medium', 'lite']) {
      const pill = page.locator(`.pill-div-btn[data-tab="${tab}"]`);
      await expect(pill).not.toHaveClass(/pill-div-locked/);
    }
  });

  test('5. Переключение вкладок: HD → screen-hard, LT → screen-lite', async ({ page }) => {
    await setupLocalStorage(page, buildScores({ lastRoundValue: 3 }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('.nb[data-tab="home"]').waitFor({ timeout: 15_000 });

    // Click HD pill → screen-hard должен стать active
    await page.locator('.pill-div-btn[data-tab="hard"]').click();
    await expect(page.locator('#screen-hard')).toHaveClass(/active/);

    // Click LT pill → screen-lite должен стать active
    await page.locator('.pill-div-btn[data-tab="lite"]').click();
    await expect(page.locator('#screen-lite')).toHaveClass(/active/);
  });
});
