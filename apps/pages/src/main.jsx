import { createRoot } from 'react-dom/client'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/manrope/600.css'
import '@fontsource/manrope/800.css'
import '../../web/src/app/globals.css'
import './pages.css'
import App from './App.jsx'
import { configureApiTransport } from '../../web/src/components/api.js'
import { browserRequest } from './browser-api.mjs'

configureApiTransport(browserRequest)

document.addEventListener('click', async (event) => {
  const anchor = event.target.closest('a')
  if (!anchor) return
  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return
  event.preventDefault()
  if (anchor.getAttribute('aria-disabled') === 'true') return
  try {
    const response = await browserRequest(url.pathname + url.search)
    if (!response.ok) throw new Error((await response.json()).error)
    const blobUrl = URL.createObjectURL(await response.blob())
    const download = document.createElement('a')
    download.href = blobUrl
    download.download = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'project.txt'
    download.click()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  } catch (error) { window.alert(error.message) }
})

createRoot(document.getElementById('root')).render(<App />)
