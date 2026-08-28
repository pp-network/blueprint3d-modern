function isExtensionNoise(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'object') {
    const err = value as { message?: unknown; stack?: unknown }
    return isExtensionNoise(err.message) || isExtensionNoise(err.stack)
  }
  const text = String(value)
  return (
    text.includes('MetaMask') ||
    text.includes('Failed to connect to MetaMask') ||
    text.includes('chrome-extension://') ||
    text.includes('moz-extension://') ||
    text.includes('safari-web-extension://')
  )
}

export function installIgnoreExtensionErrors(): void {
  if (typeof window === 'undefined' || window.__ignoreExtensionErrorsInstalled) {
    return
  }
  window.__ignoreExtensionErrorsInstalled = true

  window.addEventListener(
    'error',
    (event) => {
      if (
        isExtensionNoise(event.error) ||
        isExtensionNoise(event.message) ||
        (typeof event.filename === 'string' && event.filename.includes('extension://'))
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    true
  )

  window.addEventListener(
    'unhandledrejection',
    (event) => {
      if (isExtensionNoise(event.reason)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    true
  )

  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    if (args.some(isExtensionNoise)) return
    original(...args)
  }
}

declare global {
  interface Window {
    __ignoreExtensionErrorsInstalled?: boolean
  }
}
