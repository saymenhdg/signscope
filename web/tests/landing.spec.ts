import { expect, test } from '@playwright/test'

import { mockGuestSession } from './helpers/api-mocks'

test('landing page renders primary marketing content', async ({ page }) => {
  await mockGuestSession(page)
  await page.goto('/')

  await expect(page.getByRole('link', { name: 'SignSpeak AI' }).first()).toBeVisible()
  await expect(page.getByText('Sign language is a superpower.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Start Learning Free' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Join as Teacher' }).first()).toBeVisible()
  await expect(page.getByText('Three steps. One learning loop.')).toBeVisible()
})
