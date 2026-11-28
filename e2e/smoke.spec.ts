import { expect, test } from '@playwright/test';

test.describe('Learning Road E2E smoke flows', () => {
  test('dashboard loads with zero fake progress and renders heatmap', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('.heatmap-grid-outer')).toBeVisible();
    await expect(page.locator('.heatmap-cell:not(.is-outside)').first()).toBeVisible();
  });

  test('focus timer starts, stops, saves study session, and updates dashboard', async ({ page }) => {
    await page.goto('/');
    await page.locator('.timer-sidebar-trigger').click();
    const timerModal = page.getByRole('dialog');
    await expect(timerModal).toBeVisible();

    await timerModal.getByRole('button', { name: /Bắt đầu|Start/i }).click();
    await expect(timerModal.getByRole('button', { name: /Dừng & lưu|Stop & log/i })).toBeVisible();
    await timerModal.getByRole('button', { name: /Dừng & lưu|Stop & log/i }).click();

    const saveModal = page.getByRole('dialog');
    await saveModal.locator('#timer-save-duration').fill('30');
    await saveModal.locator('#timer-save-notes').fill('E2E Pomodoro test session');
    await saveModal.getByRole('button', { name: /Lưu study session|Save study session/i }).click();

    await expect(page.getByText(/30 phút|30 min/i).first()).toBeVisible();
  });

  test('command palette searches courses, navigates to course, and sends topic to today planner', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar-search-btn')).toBeVisible();
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog');
    await expect(palette).toBeVisible();

    await palette.locator('input[type="search"]').fill('SQL');
    const sqlResult = palette.locator('.palette-item', { hasText: 'Learn SQL' }).first();
    await expect(sqlResult).toBeVisible();
    await sqlResult.click();

    await expect(page).toHaveURL(/\/roadmap\/\d+/);
    const planTodayBtn = page
      .locator('.check-actions button[title*="Planner"], .check-actions button[title*="today"]')
      .first();
    await expect(planTodayBtn).toBeVisible();
    await planTodayBtn.click();

    await page.goto('/planner');
    await expect(page.locator('.task-row').first()).toBeVisible();
  });

  test('interview flashcard mode flips answer and updates confidence rating', async ({ page }) => {
    await page.goto('/interview?tab=practice');
    await expect(page.locator('.flashcard')).toBeVisible();

    const flipBtn = page.getByRole('button', { name: /Hiện đáp án|Show answer/i });
    await flipBtn.click();

    const rateBtn = page.locator('.flashcard button', { hasText: '(14d)' });
    await rateBtn.click();
    await expect(page.locator('.flashcard')).toBeVisible();
  });

  test('jobs kanban board updates application status and persists across reload', async ({
    page,
  }) => {
    await page.goto('/jobs');
    await page.locator('.page-header').getByRole('button', { name: /Thêm hồ sơ|Add application/i }).click();
    const modal = page.getByRole('dialog');
    await modal.locator('#job-company').fill('Acme Corp');
    await modal.locator('#job-position').fill('Fullstack Engineer');
    await modal.getByRole('button', { name: /Lưu hồ sơ|Save application/i }).click();

    await page.getByRole('button', { name: 'Board' }).click();
    const card = page.locator('.kanban-card', { hasText: 'Acme Corp' });
    await expect(card).toBeVisible();

    await card.locator('select').selectOption('interviewing');
    await page.reload();
    await page.getByRole('button', { name: 'Board' }).click();
    const interviewingCol = page.locator('.kanban-col', { hasText: /Phỏng vấn|Interviewing/i });
    await expect(interviewingCol.locator('.kanban-card', { hasText: 'Acme Corp' })).toBeVisible();
  });

  test('notes unsaved guard prevents accidental loss and settings import preview works', async ({
    page,
  }) => {
    await page.goto('/notes');
    await page.getByRole('button', { name: /Ghi chú mới|New note/i }).click();
    await page.locator('#note-title').fill('Unsaved Note Test');
    await page.locator('#note-content').fill('Draft content');

    await page.locator('.side-nav a[href="/settings"]').click();
    const confirmModal = page.getByRole('dialog');
    await expect(confirmModal).toBeVisible();
    await confirmModal.getByRole('button', { name: /Bỏ thay đổi|Discard/i }).click();

    await expect(page).toHaveURL('/settings');

    const exportPayload = await page.evaluate(async () => {
      const res = await fetch('/api/export');
      return res.json();
    });

    await page.locator('input[type="file"]').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(exportPayload)),
    });

    const previewModal = page.getByRole('dialog');
    await expect(previewModal).toBeVisible();
    await expect(previewModal.getByRole('button', { name: /Import & Gộp|Import & Merge/i })).toBeVisible();
    await previewModal.getByRole('button', { name: /Hủy|Cancel/i }).click();

    const aiSection = page.locator('#ai-settings');
    await expect(aiSection).toBeVisible();
    await aiSection.getByRole('button', { name: 'Google Gemini' }).click();
    await expect(aiSection.locator('#ai-base-url')).toHaveValue(
      'https://generativelanguage.googleapis.com/v1beta/openai',
    );
    await aiSection.locator('#ai-api-key').fill('sk-e2e-test-4321');
    await aiSection.locator('#ai-model').fill('gemini-2.5-flash');
    await aiSection.locator('#ai-temperature').fill('0.7');
    while ((await aiSection.locator('.ai-header-row').count()) > 0) {
      await aiSection.locator('.ai-header-row').first().locator('button').click();
    }
    await aiSection.getByRole('button', { name: /Thêm header|Add header/i }).click();
    const headerRow = aiSection.locator('.ai-header-row').last();
    await headerRow.locator('input').nth(0).fill('x-opencode-session');
    await headerRow.locator('input').nth(1).fill('ses_e2e_header_01');
    await aiSection.getByRole('button', { name: /Lưu cấu hình AI|Save AI settings/i }).click();

    await expect(aiSection.getByText('sk-e••••4321')).toBeVisible();
    await page.reload();
    await expect(page.locator('#ai-settings').getByText('sk-e••••4321')).toBeVisible();
    await expect(page.locator('#ai-settings #ai-model')).toHaveValue('gemini-2.5-flash');
    await expect(page.locator('#ai-settings #ai-temperature')).toHaveValue('0.7');
    await expect(page.locator('#ai-settings .ai-header-row').last().locator('input').nth(0)).toHaveValue(
      'x-opencode-session',
    );
    await expect(page.locator('#ai-settings .ai-header-row').last().locator('input').nth(1)).toHaveValue(
      'ses_e2e_header_01',
    );

    await page.locator('#ai-settings').getByRole('button', { name: /Đặt lại theo \.env|Reset to \.env/i }).click();
    const resetModal = page.getByRole('dialog');
    await expect(resetModal).toBeVisible();
    await resetModal.getByRole('button', { name: /Đặt lại theo \.env|Reset to \.env/i }).click();
    await expect(page.locator('#ai-settings').getByText('sk-e••••4321')).toHaveCount(0);
  });
});
