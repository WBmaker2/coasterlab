import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('.editor-svg')).toBeVisible();
});

test('default track loads, runs, and graphs update', async ({ page }) => {
  await expect(page.locator('.point-hit')).toHaveCount(10);
  await expect(page.getByRole('heading', { name: '프리셋' })).toBeVisible();
  await page.locator('#run-button').click();
  await expect(page.locator('#run-badge')).toHaveText('실행 중');
  await expect(page.locator('#graph-status')).toHaveText('탐색 중');
  await expect(page.locator('.graph-card').first().locator('canvas')).toHaveAttribute(
    'aria-label',
    /에너지 그래프/
  );
  await page.locator('#scrub').evaluate((input: HTMLInputElement) => {
    input.value = '1000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#run-badge')).toHaveText('일시정지');
  await expect(page.locator('.data-table table')).toHaveCount(3);
});

test('preset switching, 3D view, and force arrows', async ({ page }) => {
  await page.locator('[data-preset="loop"]').click();
  await expect(page.locator('.point-hit')).toHaveCount(37);
  await expect(page.locator('#validation-list')).toContainText('루프 통과 조건');
  await page.getByRole('tab', { name: '3D 주행' }).click();
  await expect(page.locator('.scene-canvas')).toBeVisible();
  await page.locator('#toggle-forces').check();
  await expect(page.locator('#force-legend')).toBeVisible();
  await page.locator('[data-camera="side"]').click();
  await expect(page.locator('[data-camera="side"]')).toHaveAttribute('aria-pressed', 'true');
});

test('adds and removes control points and supports keyboard editing', async ({ page }) => {
  const points = page.locator('.point-hit');
  await expect(points).toHaveCount(10);
  await page.locator('#add-point').click();
  await expect(points).toHaveCount(11);
  const xInput = page.locator('#selected-point input[data-axis="x"]');
  await expect(xInput).toBeVisible();
  const before = Number(await xInput.inputValue());
  const secondPoint = page.locator('.point-hit').nth(1);
  await secondPoint.focus();
  await page.keyboard.press('ArrowRight');
  await expect(xInput).not.toHaveValue(String(before));
  await page.locator('#remove-point').click();
  await expect(points).toHaveCount(10);
  await page.locator('.point-hit').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#run-badge')).toHaveText('실행 중');
  await page.locator('#reset-button').click();
});

test('dragging a control point updates the track', async ({ page }) => {
  const point = page.locator('.point-hit').nth(3);
  const box = await point.boundingBox();
  const xInput = page.locator('#selected-point input[data-axis="x"]');
  const before = Number(await xInput.inputValue());
  if (!box) throw new Error('Control point is not visible.');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 36, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(xInput).not.toHaveValue(String(before));
});

test('completes the first mission and saves progress', async ({ page }) => {
  await page.locator('.nav-item[data-route="missions"]').click();
  await expect(page.getByRole('heading', { name: '예측하고, 달리고, 설명하기' })).toBeVisible();
  await page.locator('#mission-detail .mission-option input').nth(1).check();
  await page.locator('#start-mission').click();
  await expect(page.locator('#mission-panel')).toContainText('가장 빠른 순간');
  await expect(page.locator('#run-badge')).toHaveText('실행 중');
  await page.locator('#mission-panel [data-action="submit"]').click();
  await expect(page.locator('#mission-panel')).toContainText('완료 · 100점');
  await expect(page.locator('#mission-panel')).toContainText('마찰이 없을 때는 높이가 가장 낮은 곳에서');
  await page.locator('#mission-panel').getByRole('button', { name: '미션 목록' }).click();
  await expect(page.locator('#mission-progress')).toContainText('1');
  await page.reload();
  await expect(page.locator('#mission-progress')).toContainText('1');
  await expect(page.locator('#mission-progress')).toContainText('100');
});

test('wrong mission answers can be retried and lower the score', async ({ page }) => {
  await page.locator('.nav-item[data-route="missions"]').click();
  await page.locator('#mission-detail .mission-option input').first().check();
  await page.locator('#start-mission').click();
  await expect(page.locator('#mission-panel [data-action="submit"]')).toBeEnabled();
  await page.locator('#mission-panel [data-action="submit"]').click();
  await expect(page.locator('#mission-panel')).toContainText('다시 확인해 보세요');
  await page.locator('#mission-panel input[name="mission-option"]').nth(1).check();
  await page.locator('#mission-panel [data-action="submit"]').click();
  await expect(page.locator('#mission-panel')).toContainText('완료 · 70점');
});

test('teacher can hide a mission and reset progress with confirmation', async ({ page }) => {
  await page.locator('.nav-item[data-route="teacher"]').click();
  await expect(page.getByRole('heading', { name: '교실 운영' })).toBeVisible();
  const firstToggle = page.locator('[data-enable="energy-fastest"]');
  await firstToggle.uncheck();
  await page.locator('.nav-item[data-route="missions"]').click();
  await expect(page.locator('#mission-list')).not.toContainText('가장 빠른 순간');
  await page.locator('.nav-item[data-route="teacher"]').click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#reset-progress').click();
  await expect(page.locator('#teacher-host')).toContainText('5개가 활성화');
  await expect(page.locator('.progress-figure strong').first()).toHaveText('0');
});

test('comfort and reduced motion preferences persist', async ({ page }) => {
  await page.getByRole('tab', { name: '3D 주행' }).click();
  await page.locator('#toggle-comfort').check();
  await page.locator('#toggle-motion').check();
  await page.waitForTimeout(350);
  await page.reload();
  await page.getByRole('tab', { name: '3D 주행' }).click();
  await expect(page.locator('#toggle-comfort')).toBeChecked();
  await expect(page.locator('#toggle-motion')).toBeChecked();
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
});

test('teacher can print a worksheet with the enabled missions', async ({ page }) => {
  await page.locator('.nav-item[data-route="teacher"]').click();
  await page.evaluate(() => {
    (window as unknown as { __printed?: boolean }).__printed = false;
    window.print = () => {
      (window as unknown as { __printed?: boolean }).__printed = true;
    };
  });
  await page.locator('#print-sheet').click();
  await page.waitForTimeout(400);
  await expect(page.locator('#print-sheet-content')).toContainText('롤러코스터 에너지 랩');
  await expect(page.locator('#print-sheet-content')).toContainText('가장 빠른 순간');
  const printed = await page.evaluate(
    () => (window as unknown as { __printed?: boolean }).__printed === true
  );
  expect(printed).toBe(true);
});

test('mobile layout keeps editor and exposes graph tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#mobile-graphs')).toBeVisible();
  await expect(page.locator('#run-button')).toBeVisible();
  await page.locator('#mobile-graphs').click();
  await expect(page.locator('.graphs-panel')).toBeVisible();
  await expect(page.locator('.workspace')).toBeHidden();
  await page.locator('#close-mobile-graphs').click();
  await expect(page.locator('.workspace')).toBeVisible();
});

test('design, missions, and teacher screens have no serious accessibility violations', async ({
  page
}) => {
  const scan = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );
  };
  expect(await scan()).toHaveLength(0);
  await page.locator('.nav-item[data-route="missions"]').click();
  expect(await scan()).toHaveLength(0);
  await page.locator('.nav-item[data-route="teacher"]').click();
  expect(await scan()).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.nav-item[data-route="design"]').click();
  expect(await scan()).toHaveLength(0);
  await page.locator('#mobile-graphs').click();
  expect(await scan()).toHaveLength(0);
});
