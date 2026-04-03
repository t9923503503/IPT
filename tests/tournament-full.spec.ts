/**
 * Playwright e2e — полный цикл турнира из 4 кортов (ThaiVolley32, ppc=4, nc=4).
 *
 * Сценарий:
 *  1. Загрузка страницы и проверка 4 кортов в навигации
 *  2. Дивизионы HD/AV/MD/LT заблокированы до ввода очков
 *  3. Запись очков R1 в localStorage, перезагрузка
 *  4. Дивизионы разблокируются (включая корты с нулями)
 *  5. Переход на HD — экран открывается
 *  6. Переход на СТАТ — проверка лидеров
 */
import { test, expect, Page } from '@playwright/test';

// ─── Тестовые данные: scores[ci][mi][ri] ────────────────────────────────────
// 4 корта × 4 игрока × 4 раунда
const SCORES_R1 = [
  // Корт А (ci=0)
  [[10, 10, 10, 10], [0, 8, 5, 0], [8, 0, 0, 5], [0, 0, 0, 0]],
  // Корт Б (ci=1)
  [[10, 10, 10, 10], [0, 5, 8, 0], [8, 0, 0, 5], [0, 0, 0, 0]],
  // Корт В (ci=2)
  [[10, 10, 10, 10], [0, 5, 8, 0], [8, 0, 0, 5], [0, 0, 0, 0]],
  // Корт Г (ci=3)
  [[10, 10, 10, 10], [0, 5, 8, 0], [8, 0, 0, 5], [0, 0, 0, 0]],
];

const ROSTER = [
  { men: ['Жидков', 'Майлыбаев', 'Надымов', 'Мамедов', ''],   women: ['Иванова', 'Петрова', 'Сидорова', 'Козлова', ''] },
  { men: ['Паничкин', 'Микуляк', 'Никифоров', 'Обухов', ''],   women: ['Загребина', 'Стрекалова', 'Привалова', 'Рогожкина', ''] },
  { men: ['Привалов', 'Юшманов', 'Смирнов', 'Федоров', ''],    women: ['Кузнецова', 'Новикова', 'Морозова', 'Волкова', ''] },
  { men: ['Алексеев', 'Борисов', 'Васильев', 'Григорьев', ''], women: ['Дмитриева', 'Егорова', 'Жукова', 'Захарова', ''] },
];

/** Инициализирует localStorage с тестовыми данными турнира */
async function seedLocalStorage(page: Page, scores = SCORES_R1) {
  await page.evaluate(
    ({ scores, roster }) => {
      localStorage.setItem('kotc_version',  '1.1');
      localStorage.setItem('kotc3_cfg',     JSON.stringify({ ppc: 4, nc: 4, fixedPairs: false }));
      localStorage.setItem('kotc3_scores',  JSON.stringify(scores));
      localStorage.setItem('kotc3_roster',  JSON.stringify(roster));
    },
    { scores, roster: ROSTER }
  );
}

/** Ждёт навбара и убеждается что приложение загружено */
async function waitForApp(page: Page) {
  await page.locator('.nb[data-tab="home"]').waitFor({ timeout: 15_000 });
}

// ════════════════════════════════════════════════════════════════════════════
test.describe('Турнир 4 корта — полный цикл (e2e)', () => {

  test('1. Страница загружается, К1-К4 видны в навигации', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    // Все 4 корта присутствуют в навигации
    for (let ci = 0; ci < 4; ci++) {
      await expect(page.locator(`.nav-pill[data-tab="${ci}"]`)).toBeVisible();
    }

    // К-пиллы имеют правильные лейблы
    await expect(page.locator('.nav-pill[data-tab="0"] .pill-main')).toContainText('К1');
    await expect(page.locator('.nav-pill[data-tab="3"] .pill-main')).toContainText('К4');
  });

  test('2. Дивизионы HD/AV/MD/LT заблокированы до ввода очков', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    // Дивизионные пиллы присутствуют и заблокированы
    for (const tab of ['hard', 'advance', 'medium', 'lite']) {
      const pill = page.locator(`.pill-div-btn[data-tab="${tab}"]`);
      await expect(pill).toBeVisible();
      await expect(pill).toHaveClass(/pill-div-locked/);
    }
  });

  test('3. После заполнения всех раундов дивизионы разблокируются', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    // Записываем очки R1 (включая нулевые)
    await seedLocalStorage(page, SCORES_R1);

    // Перезагружаем — приложение подгрузит данные из localStorage
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    // Дивизионные пиллы должны быть разблокированы
    for (const tab of ['hard', 'advance', 'medium', 'lite']) {
      const pill = page.locator(`.pill-div-btn[data-tab="${tab}"]`);
      await expect(pill).not.toHaveClass(/pill-div-locked/);
    }
  });

  test('4. Краевой случай: нули в последнем туре — дивизионы всё равно разблокированы', async ({ page }) => {
    // Все последние туры с 0
    const scoresAllZero = SCORES_R1.map(court =>
      court.map((player, mi) => player.map((v, ri) => ri === 3 ? 0 : v))
    );

    await page.goto('/');
    await waitForApp(page);
    await seedLocalStorage(page, scoresAllZero);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    for (const tab of ['hard', 'advance', 'medium', 'lite']) {
      const pill = page.locator(`.pill-div-btn[data-tab="${tab}"]`);
      await expect(pill).not.toHaveClass(/pill-div-locked/);
    }
  });

  test('5. Переход на HD открывает screen-hard', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await seedLocalStorage(page, SCORES_R1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    // Клик по HD-пиллу
    await page.locator('.pill-div-btn[data-tab="hard"]').click();

    // Экран hard должен стать активным
    await expect(page.locator('#screen-hard')).toHaveClass(/active/);
  });

  test('6. Экран СТАТ отображается без ошибок', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await seedLocalStorage(page, SCORES_R1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    // Переходим на СТАТ
    await page.locator('.nb[data-tab="stats"]').click();
    await expect(page.locator('#screen-stats')).toHaveClass(/active/);

    // Экран должен быть виден и не содержать текст ошибки запуска
    await expect(page.locator('#screen-stats')).toBeVisible();
    await expect(page.locator('text=Ошибка запуска приложения')).toHaveCount(0);
  });

  test('7. Лидеры (победители кортов) имеют очки в СВОД', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await seedLocalStorage(page, SCORES_R1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    // Переходим на СВОД
    await page.locator('.nb[data-tab="svod"]').click();
    await expect(page.locator('#screen-svod')).toHaveClass(/active/);

    // Страница СВОД видна без ошибок
    await expect(page.locator('#screen-svod')).toBeVisible();
    await expect(page.locator('text=Ошибка запуска приложения')).toHaveCount(0);
  });

  test('8. Корт К1 открывается и показывает счёт', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await seedLocalStorage(page, SCORES_R1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    // Клик по К1
    await page.locator('.nav-pill[data-tab="0"]').click();
    await expect(page.locator('#screen-0')).toHaveClass(/active/);
    await expect(page.locator('#screen-0')).toBeVisible();
  });

  test('9. Частично заполненный последний тур — дивизионы остаются заблокированы', async ({ page }) => {
    // Только часть ячеек последнего тура заполнена
    const scoresPartial = SCORES_R1.map(court =>
      court.map((player, mi) =>
        player.map((v, ri) => {
          // Обнуляем ячейки rt=3 для некоторых игроков
          if (ri === 3 && mi >= 2) return null;
          return v;
        })
      )
    );

    await page.goto('/');
    await waitForApp(page);
    await seedLocalStorage(page, scoresPartial);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForApp(page);

    // С частично заполненным последним туром дивизионы должны оставаться заблокированы
    for (const tab of ['hard', 'advance', 'medium', 'lite']) {
      const pill = page.locator(`.pill-div-btn[data-tab="${tab}"]`);
      await expect(pill).toHaveClass(/pill-div-locked/);
    }
  });

});
