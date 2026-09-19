const REQUIRED_VISIBILITY = 0.45

function visible(point) {
  return point && (point.visibility ?? 1) >= REQUIRED_VISIBILITY && (point.presence ?? 1) >= REQUIRED_VISIBILITY
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

export function headHeightRatio(landmarks) {
  const nose = landmarks?.[0]
  const leftShoulder = landmarks?.[11]
  const rightShoulder = landmarks?.[12]
  if (![nose, leftShoulder, rightShoulder].every(visible)) return null
  const shoulderWidth = distance(leftShoulder, rightShoulder)
  if (shoulderWidth < 0.04) return null
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2
  return (shoulderY - nose.y) / shoulderWidth
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export class DrowsinessMonitor {
  constructor({ calibrationSamples = 20, thresholdMs = 10000, recoveryMs = 700 } = {}) {
    this.calibrationSamples = calibrationSamples
    this.thresholdMs = thresholdMs
    this.recoveryMs = recoveryMs
    this.reset()
  }

  reset() {
    this.samples = []
    this.baseline = null
    this.suspiciousSince = null
    this.recoveredSince = null
    this.alarmed = false
  }

  update(landmarks, timestamp = performance.now()) {
    const ratio = headHeightRatio(landmarks)
    if (this.baseline === null) {
      if (ratio !== null && ratio > 0.3) this.samples.push(ratio)
      if (this.samples.length >= this.calibrationSamples) this.baseline = median(this.samples)
      return { state: 'calibrating', suspiciousMs: 0, alarm: false }
    }

    // The head has moved substantially closer to the shoulder line. Missing head
    // landmarks are ignored because leaving the camera is not proof of sleep.
    const suspicious = ratio !== null && ratio < Math.max(0.28, this.baseline * 0.68)
    if (suspicious) {
      this.recoveredSince = null
      if (this.suspiciousSince === null) this.suspiciousSince = timestamp
    } else if (this.suspiciousSince !== null) {
      if (this.recoveredSince === null) this.recoveredSince = timestamp
      if (timestamp - this.recoveredSince >= this.recoveryMs) {
        this.suspiciousSince = null
        this.recoveredSince = null
      }
    }

    const suspiciousMs = this.suspiciousSince === null ? 0 : timestamp - this.suspiciousSince
    const alarm = !this.alarmed && suspiciousMs >= this.thresholdMs
    if (alarm) this.alarmed = true
    return { state: this.suspiciousSince === null ? 'awake' : 'suspected', suspiciousMs, alarm }
  }
}
