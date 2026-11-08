import { expect, test } from '@playwright/test'
import { bootInstalledLiangxiang, openPanel } from './helpers.ts'

test('an activated wallet shows an explicit upgrade instruction and disables voting', async ({ page }, testInfo) => {
  const url=process.env.LIANGXIANG_COMPAT_FIXTURE_URL
  test.skip(url===undefined,'Requires the separate loopback compatibility fixture')
  if(!url||new URL(url).hostname!=='127.0.0.1')throw new Error('Requires the isolated loopback compatibility fixture')
  await bootInstalledLiangxiang(page)
  const panel=await openPanel(page)
  expect((await page.request.post(`${url}/test/activate`)).ok()).toBe(true)
  expect((await page.request.post('/liangxiang/api/refresh')).ok()).toBe(true)
  const hint='请升级至梁相2.0.0及以上版本'
  await expect.poll(()=>page.request.get('/liangxiang/api/state').then(r=>r.json()).then(s=>s.authorityReason)).toBe(hint)
  await expect(panel).toContainText(hint)
  await expect(panel).not.toContainText('无法连接天庭：'+hint)
  const buttons=panel.locator('[data-liangxiang-region="vote"] button')
  await expect(buttons).toHaveCount(2)
  for(const button of await buttons.all())await expect(button).toBeDisabled()
  await expect(page.locator('[data-liangxiang-welcome]')).toHaveCount(0)
  await panel.screenshot({path:testInfo.outputPath('upgrade-instruction.png')})
})
