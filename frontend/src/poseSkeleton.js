const CONNECTIONS = [
  [0, 11], [0, 12], [11, 12],
  [11, 13], [13, 15], [15, 17], [15, 19], [15, 21],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
]

let detectorPromise
let openCvPromise

async function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = import('@mediapipe/tasks-vision').then(async ({ FilesetResolver, PoseLandmarker }) => {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe')
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.55,
        minPosePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      })
    })
  }
  return detectorPromise
}

async function loadOpenCv() {
  if (!openCvPromise) {
    openCvPromise = import('@techstark/opencv-js').then(async (module) => {
      const candidate = module.default
      if (candidate instanceof Promise) return candidate
      if (candidate.Mat) return candidate
      await new Promise((resolve) => { candidate.onRuntimeInitialized = resolve })
      return candidate
    })
  }
  return openCvPromise
}

function visible(landmark) {
  return landmark && (landmark.visibility ?? 1) >= 0.45 && (landmark.presence ?? 1) >= 0.45
}

function drawSkeleton(cv, canvas, landmarks, width, height) {
  const overlay = cv.Mat.zeros(height, width, cv.CV_8UC4)
  const lineColor = new cv.Scalar(10, 132, 255, 235)
  const pointColor = new cv.Scalar(105, 214, 138, 255)
  const points = landmarks.map((landmark) => new cv.Point(
    Math.round(landmark.x * width),
    Math.round(landmark.y * height),
  ))

  for (const [start, end] of CONNECTIONS) {
    if (visible(landmarks[start]) && visible(landmarks[end])) {
      cv.line(overlay, points[start], points[end], lineColor, Math.max(2, Math.round(width / 220)), cv.LINE_AA)
    }
  }
  landmarks.forEach((landmark, index) => {
    if (visible(landmark) && (index === 0 || index >= 11)) {
      cv.circle(overlay, points[index], Math.max(3, Math.round(width / 150)), pointColor, -1, cv.LINE_AA)
    }
  })
  cv.imshow(canvas, overlay)
  overlay.delete()
}

export async function startPoseSkeleton(video, canvas, onState, onPose) {
  onState?.('loading')
  const [detector, cv] = await Promise.all([loadDetector(), loadOpenCv()])
  let stopped = false
  let animationFrame = 0
  let lastDetection = 0
  let lastVideoTime = -1

  onState?.('active')
  function frame(timestamp) {
    if (stopped) return
    animationFrame = requestAnimationFrame(frame)
    if (video.readyState < 2 || timestamp - lastDetection < 100 || video.currentTime === lastVideoTime) return
    lastDetection = timestamp
    lastVideoTime = video.currentTime
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    const result = detector.detectForVideo(video, timestamp)
    const landmarks = result.landmarks?.[0]
    onPose?.(landmarks || null, timestamp)
    if (landmarks) drawSkeleton(cv, canvas, landmarks, width, height)
    else canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }
  animationFrame = requestAnimationFrame(frame)

  return () => {
    stopped = true
    cancelAnimationFrame(animationFrame)
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
  }
}
