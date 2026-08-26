import { expect, test } from '@playwright/test';

function futureDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 45);
  return date.toISOString().slice(0, 10);
}

test('builds, explores, refines, and cancels a launch plan without losing partial work', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
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
  await expect(page.getByText('Scoring evidence against the readiness rubric')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Building a reversible staged rollout/)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Plan' })).toBeVisible();
  await expect(page.getByLabel('Readiness 72 out of 100')).toBeVisible();
  await expect(page.getByText('Confirm rollout and rollback ownership')).toBeVisible();

  await page.getByRole('tab', { name: 'Risks' }).click();
  await expect(page.getByText('Reporting data drifts during rollout')).toBeVisible();
  await page.getByRole('tab', { name: 'Owners' }).click();
  await expect(page.getByText('Publish rollback thresholds and decision authority')).toBeVisible();
  await page.getByRole('tab', { name: 'Copy' }).click();
  await expect(page.getByText('Atlas pilot opens to engineering managers')).toBeVisible();
  await page.getByRole('tab', { name: 'Questions' }).click();

  await page
    .getByLabel('Answer: Who owns each staged rollout and the rollback decision?')
    .fill('The engineering lead owns rollout stages; the incident commander owns rollback.');
  await page.getByRole('button', { name: 'Use answer' }).click();
  await expect(page.getByText(/Updating the rollout path while preserving/)).toBeVisible();
  await page.getByRole('button', { name: /Cancel run/ }).first().click();

  await expect(page.getByText('The launch-planning run was cancelled.')).toBeVisible();
  await expect(page.getByText(/Updating the rollout path while preserving/)).toBeVisible();
  await expect(page.locator('nextjs-portal')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(`launch-desk-${testInfo.project.name}.png`),
    fullPage: true,
  });
});
