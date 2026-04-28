// Web Notifications API helpers. Fires native system notifications when the
// page isn't focused. No service worker — only works while the tab is open
// (in foreground or as a backgrounded tab in the browser process).

export function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission  // 'default' | 'granted' | 'denied'
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

// Fire a notification if the page is hidden / unfocused and permission is granted.
// `tag` lets the OS replace prior notifications for the same chat instead of stacking.
export function notifyIfBackgrounded({ title, body, tag, icon, onClick }) {
  if (typeof Notification === 'undefined') return null
  if (Notification.permission !== 'granted') return null
  const isHidden = (typeof document !== 'undefined') && (document.hidden || !document.hasFocus())
  if (!isHidden) return null
  try {
    const n = new Notification(title, {
      body,
      tag,
      icon,
      silent: false,
    })
    n.onclick = () => {
      try { window.focus() } catch {}
      onClick && onClick()
      n.close()
    }
    return n
  } catch (e) {
    console.warn('notification failed:', e)
    return null
  }
}

// Strip *actions* and trim for a notification preview body.
export function stripForPreview(text, max = 140) {
  if (!text) return ''
  let s = text.replace(/\*[^*]+\*/g, '').replace(/\s+/g, ' ').trim()
  if (s.length > max) s = s.slice(0, max - 1) + '…'
  return s
}
