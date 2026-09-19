export async function openCamera(browser = window) {
  if (!browser.isSecureContext) {
    throw new Error('휴대폰 카메라는 HTTPS 보안 접속이 필요합니다. HTTPS 주소로 접속한 뒤 다시 시작해 주세요.')
  }
  const devices = browser.navigator.mediaDevices
  if (!devices?.getUserMedia) {
    throw new Error('카메라를 사용할 수 없습니다. Chrome 또는 Safari에서 직접 열어 주세요.')
  }
  try {
    return await devices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'user' } } })
  } catch (error) {
    if (error.name === 'OverconstrainedError') return devices.getUserMedia({ audio: false, video: true })
    throw error
  }
}

export function cameraError(error) {
  const messages = {
    NotAllowedError: '카메라 권한이 차단되어 있습니다. 브라우저의 사이트 설정과 휴대폰 설정에서 카메라를 허용한 뒤 다시 시작해 주세요.',
    NotFoundError: '사용할 수 있는 카메라를 찾지 못했습니다.',
    NotReadableError: '카메라를 사용 중인 다른 앱을 닫고 다시 시작해 주세요.',
    AbortError: '카메라 실행이 중단됐습니다. 다시 시작해 주세요.',
  }
  return messages[error.name] || error.message || '카메라를 시작하지 못했습니다.'
}
