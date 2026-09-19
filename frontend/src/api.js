const CLIENT_KEY = 'study-rhythm-client-id-v1'

function createClientId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function clientId() {
  let value = localStorage.getItem(CLIENT_KEY)
  if (!value) {
    value = createClientId()
    localStorage.setItem(CLIENT_KEY, value)
  }
  return value
}

export function apiFetch(input, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('X-Client-ID', clientId())
  return fetch(input, { ...init, headers })
}
