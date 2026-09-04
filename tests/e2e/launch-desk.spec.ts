import { expect, test, type Page } from '@playwright/test';

function futureDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 45);
  return date.toISOString().slice(0, 10);
}

async function activateTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tab', { name });
  await tab.focus();
  await page.keyboard.press('Enter');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

test('builds, explores, refines, and cancels a launch plan without losing partial work', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/Launch Desk/i);
  await expect(
    page.getByRole('heading', { name: 'Plan the launch. Find the gaps.' }),
  ).toBeVisible();

  await page.getByLabel('Product brief').fill(
    'Launch Atlas, a shared engineering delivery reporting workspace with a staged internal pilot.',
  );
  await page.getByLabel('Audience').fill('Engineering managers and technical program leads');
  await page.getByLabel('Launch date').fill(futureDate());
  await page
    .getByLabel('Constraints')
    .fill('No downtime. SOC 2 controls apply. Roll out in stages with a documented rollback.');
  await page.getByLabel('Assets').setInputFiles('tests/fixtures/launch-brief.txt');
  await expect(page.getByText('launch-brief.txt')).toBeVisible();

  await page.getByRole('button', { name: 'Build launch plan' }).click();
  await expect(page.getByText('Launch tasks prioritized')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Launch readiness scored')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Plan' })).toBeVisible();
  await expect(page.getByLabel('Readiness 72 out of 100')).toBeVisible();
  await expect(page.getByText('Confirm rollout and rollback ownership')).toBeVisible();

  await activateTab(page, 'Risks');
  await expect(page.getByText('Reporting data drifts during rollout')).toBeVisible();
  await activateTab(page, 'Owners');
  await expect(page.getByText('Publish rollback thresholds and decision authority')).toBeVisible();
  await activateTab(page, 'Copy');
  await expect(page.getByText('Atlas pilot opens to engineering managers')).toBeVisible();
  await activateTab(page, 'Questions');

  await page
    .getByLabel('Answer: Who owns each staged rollout and the rollback decision?')
    .fill('The engineering lead owns rollout stages; the incident commander owns rollback.');
  await page.getByRole('button', { name: 'Use answer' }).click();
  await expect(page.getByText('Rechecking readiness with the new owner evidence')).toBeVisible();
  await page.getByRole('button', { name: /Cancel run/ }).first().click();

  await expect(page.getByText('The launch-planning run was cancelled.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Questions' })).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByLabel('Answer: Who owns each staged rollout and the rollback decision?'),
  ).toHaveValue('The engineering lead owns rollout stages; the incident commander owns rollback.');
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(`launch-desk-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
