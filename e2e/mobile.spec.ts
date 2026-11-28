import { expect, test } from '@playwright/test';

const mobileRoutes = [
  '/',
  '/roadmap',
  '/roadmap/1',
  '/planner',
  '/notes',
  '/projects',
  '/interview',
  '/interview?tab=practice',
  '/jobs',
  '/settings',
];

test.describe('Learning Road mobile UI', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('renders every route without horizontal overflow on 375px phone', async ({ page }) => {
    for (const route of mobileRoutes) {
      await page.goto(route);
      await expect(page.locator('main.content')).toBeVisible();
      await expect(page.locator('.mobile-topbar')).toBeVisible();
      await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
      // Wait for loading skeletons to settle
      await expect(page.locator('.skeleton')).toHaveCount(0, { timeout: 10_000 });

      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        topbarRight: document.querySelector('.mobile-topbar')?.getBoundingClientRect().right ?? 0,
        headingHeight: document.querySelector('.page-heading')?.getBoundingClientRect().height ?? 0,
      }));
      expect(metrics.scrollWidth, `Horizontal overflow on ${route}`).toBeLessThanOrEqual(
        metrics.innerWidth,
      );
      expect(metrics.topbarRight, `Topbar overflow on ${route}`).toBeLessThanOrEqual(
        metrics.innerWidth + 1,
      );
      expect(metrics.headingHeight, `Bloated page-heading on ${route}`).toBeLessThan(180);
    }
  });

  test('bottom navigation switches routes and opens drawer with Escape dismissal', async ({
    page,
  }) => {
    await page.goto('/');
    const bottomNav = page.locator('.mobile-bottom-nav');
    await expect(bottomNav).toBeVisible();

    await bottomNav.locator('a[href="/roadmap"]').click();
    await expect(page).toHaveURL('/roadmap');
    await expect(bottomNav.locator('a[href="/roadmap"]')).toHaveClass(/active/);

    // Open More drawer for Career & System pages
    await bottomNav.locator('button').click();
    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toHaveClass(/open/);
    await expect(page.locator('body')).toHaveClass(/drawer-open/);

    // Escape closes drawer and unlocks body scroll
    await page.keyboard.press('Escape');
    await expect(sidebar).not.toHaveClass(/open/);
    await expect(page.locator('body')).not.toHaveClass(/drawer-open/);

    // Reopen drawer and navigate to Jobs
    await bottomNav.locator('button').click();
    await sidebar.locator('a[href="/jobs"]').click();
    await expect(page).toHaveURL('/jobs');
    await expect(sidebar).not.toHaveClass(/open/);
    await expect(bottomNav.locator('button')).toHaveClass(/active/);
  });

  test('notes uses master-detail flow on mobile', async ({ page }) => {
    await page.goto('/notes');
    await expect(page.locator('.notes-sidebar')).toBeVisible();
    await expect(page.locator('.notes-editor-card')).toBeHidden();

    // Creating a note transitions to editor with back button
    await page.getByRole('button', { name: /Ghi chú mới|New note/i }).first().click();
    await expect(page.locator('.notes-editor-card')).toBeVisible();
    await expect(page.locator('.notes-sidebar')).toBeHidden();
    await expect(page.locator('.notes-back-btn')).toBeVisible();

    // Inputs use >= 16px font size to avoid iOS Safari auto-zoom
    const inputFontSize = await page
      .locator('#note-title')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(inputFontSize).toBeGreaterThanOrEqual(16);

    // Back returns to list
    await page.locator('.notes-back-btn').click();
    await expect(page.locator('.notes-sidebar')).toBeVisible();
    await expect(page.locator('.notes-editor-card')).toBeHidden();
  });

  test('jobs uses mobile card layout and bottom-sheet modal at 375px', async ({ page }) => {
    await page.goto('/jobs');
    await page.locator('.page-header').getByRole('button', { name: /Thêm hồ sơ|Add application/i }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.modal-sheet-handle')).toBeVisible();

    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    expect(modalBox!.width).toBeGreaterThanOrEqual(370);

    await modal.locator('#job-company').fill('Mobile Test Co');
    await modal.locator('#job-position').fill('Frontend Engineer');
    await modal.getByRole('button', { name: /Lưu hồ sơ|Save application/i }).click();

    await expect(page.locator('.jobs-cards-mobile')).toBeVisible();
    await expect(page.locator('.jobs-table-desktop')).toBeHidden();
    await expect(page.locator('.job-mobile-card', { hasText: 'Mobile Test Co' })).toBeVisible();
  });

  test('stays overflow-free on 320px narrow phone and landscape orientation', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    for (const route of ['/', '/roadmap', '/planner', '/settings']) {
      await page.goto(route);
      await expect(page.locator('.skeleton')).toHaveCount(0, { timeout: 10_000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `320px overflow on ${route}`).toBeLessThanOrEqual(0);
    }

    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto('/');
    await expect(page.locator('.skeleton')).toHaveCount(0, { timeout: 10_000 });
    const landscapeOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(landscapeOverflow).toBeLessThanOrEqual(0);
  });
});
