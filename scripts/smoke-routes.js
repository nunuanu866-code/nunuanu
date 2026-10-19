import puppeteer from 'puppeteer'

const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '')
const routes = ['/', '/booking', '/my', '/admin.html']
const viewports = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
]

const browser = await puppeteer.launch({ headless: true })
const failures = []

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage()
      const errors = []

      page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`)
      })

      await page.setViewport(viewport)
      const response = await page.goto(`${baseUrl}${route}`, {
        waitUntil: 'networkidle2',
        timeout: 30_000,
      })
      await new Promise((resolve) => setTimeout(resolve, 500))

      const status = response?.status() ?? 0
      const bodyText = await page.$eval('body', (body) => body.innerText)
      const hasRenderError = /화면 렌더 중 오류|관리자 화면 오류|Application error/i.test(bodyText)

      if (status < 200 || status >= 400 || hasRenderError || errors.length) {
        failures.push({ viewport: viewport.name, route, status, hasRenderError, errors })
      }

      console.log(`${viewport.name.padEnd(7)} ${String(status).padEnd(3)} ${route}`)
      await page.close()
    }
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2))
  process.exitCode = 1
}
