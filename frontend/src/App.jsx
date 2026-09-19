import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import Onboarding from './Onboarding.jsx'
import StudyCoach from './StudyCoach.jsx'
import StudyTimeChart from './StudyTimeChart.jsx'
import StudyHabits from './StudyHabits.jsx'
import FocusView from './FocusView.jsx'
import TaskBookPicker from './TaskBookPicker.jsx'
import { applyAcceptedPlan, goalsForDate, periodDays, taskGoalKeysForDate, taskGoalKeysThroughDate, taskStart } from './taskAllocation.js'
import ExamProgress from './ExamProgress.jsx'
import { dailySaying, progressForGoals } from './dailyProgress.js'
import { formatDuration } from './studyTime.js'
import { openCamera, cameraError } from './camera.js'
import { startPoseSkeleton } from './poseSkeleton.js'
import { DrowsinessMonitor } from './drowsiness.js'
import { createWakeQuiz } from './wakeQuiz.js'
import WakeUpChallenge from './WakeUpChallenge.jsx'
import { apiFetch } from './api.js'

const SUBJECTS = ['국어', '수학', '영어', '한국사', '탐구', '기타']
const GRADE_SUBJECTS = ['국어', '수학', '영어', '한국사', '통합과학', '통합사회']
async function apiRequest(url, options) {
  const response = await apiFetch(url, options)
  const text = await response.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = null }
  if (!response.ok) throw new Error(payload?.detail || '요청을 처리하지 못했습니다.')
  return payload
}

function todayString() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function newStudySessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function TabIcon({ name }) {
  const paths = {
    dashboard: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
    focus: <><rect x="3" y="6" width="14" height="12" rx="3" /><path d="m17 10 4-2v8l-4-2M8 3h4" /></>,
    tasks: <><rect x="5" y="4" width="15" height="17" rx="3" /><path d="M9 3v3m6-3v3M9 11h7m-7 5h5" /></>,
    coach: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /></>,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
  }
  return <svg className="tab-icon" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [profile, setProfile] = useState(undefined)
  const [tasks, setTasks] = useState([])
  const [acceptedCoachPlan, setAcceptedCoachPlan] = useState({ goals: [] })
  const [todayStudy, setTodayStudy] = useState({ date: todayString(), seconds: null })
  const [todayHabitGoals, setTodayHabitGoals] = useState(null)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskStartDate, setTaskStartDate] = useState(todayString)
  const [taskTargetDate, setTaskTargetDate] = useState(todayString)
  const [taskBook, setTaskBook] = useState(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskStartPage, setTaskStartPage] = useState('')
  const [taskEndPage, setTaskEndPage] = useState('')
  const [showGoalEditor, setShowGoalEditor] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)
  const [focusActive, setFocusActive] = useState(false)
  const [focusError, setFocusError] = useState('')
  const [cameraStarting, setCameraStarting] = useState(false)
  const cameraPendingRef = useRef(false)
  const cameraTimerLinkedRef = useRef(false)
  const focusDirectRecordRef = useRef(false)
  const focusSubjectRef = useRef('집중 학습')
  const focusStartedAtRef = useRef(null)
  const [focusStartedAt, setFocusStartedAt] = useState(null)
  const [focusElapsedSeconds, setFocusElapsedSeconds] = useState(0)
  const [cameraTimerRequest, setCameraTimerRequest] = useState(null)
  const [studySessionsRevision, setStudySessionsRevision] = useState(0)
  const [timerContainer, setTimerContainer] = useState(null)
  const [dailyChecks, setDailyChecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('study-rhythm-daily-checks') || '{}') } catch { return {} }
  })
  const videoRef = useRef(null)
  const skeletonCanvasRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const [skeletonState, setSkeletonState] = useState('idle')
  const [drowsinessState, setDrowsinessState] = useState({ state: 'idle', suspiciousMs: 0 })
  const [drowsinessCount, setDrowsinessCount] = useState(0)
  const [wakeQuiz, setWakeQuiz] = useState(null)
  const drowsinessMonitorRef = useRef(new DrowsinessMonitor())
  const alarmActiveRef = useRef(false)
  const audioContextRef = useRef(null)
  const alarmIntervalRef = useRef(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [admissionSearch, setAdmissionSearch] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const syncTodayHabitGoals = useCallback((value) => setTodayHabitGoals(value), [])

  useEffect(() => {
    Promise.all([apiRequest('/api/profile'), apiRequest('/api/tasks'), apiRequest('/api/coach/plan/accepted')])
      .then(([savedProfile, savedTasks, savedCoachPlan]) => { setProfile(savedProfile); setTasks(savedTasks); setAcceptedCoachPlan(savedCoachPlan) })
      .catch((error) => { setProfile(null); setMessage(error.message) })
  }, [])

  useEffect(() => {
    if (focusActive && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current
    }
  }, [focusActive, tab])

  useEffect(() => {
    if (!focusActive || !videoRef.current || !skeletonCanvasRef.current) {
      setSkeletonState('idle')
      return
    }
    let cancelled = false
    let stopSkeleton
    startPoseSkeleton(videoRef.current, skeletonCanvasRef.current, (state) => {
      if (!cancelled) setSkeletonState(state)
    }, (landmarks, timestamp) => {
      if (cancelled || alarmActiveRef.current) return
      const result = drowsinessMonitorRef.current.update(landmarks, timestamp)
      setDrowsinessState(result)
      if (result.alarm) {
        setDrowsinessCount((count) => count + 1)
        alarmActiveRef.current = true
        setWakeQuiz(createWakeQuiz())
        startAlarmSound()
      }
    }).then((stop) => {
      if (cancelled) stop()
      else stopSkeleton = stop
    }).catch(() => {
      if (!cancelled) setSkeletonState('error')
    })
    return () => {
      cancelled = true
      stopSkeleton?.()
    }
  }, [focusActive, tab])

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    stopAlarmSound()
  }, [])

  const prepareAlarmAudio = () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    audioContextRef.current.resume?.()
  }

  const alarmBeep = () => {
    const context = audioContextRef.current
    if (!context) return
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const startedAt = context.currentTime
    oscillator.type = 'square'
    gain.gain.setValueAtTime(0.0001, startedAt)
    ;[0, 0.18, 0.36].forEach((offset) => {
      const pulseAt = startedAt + offset
      oscillator.frequency.setValueAtTime(720, pulseAt)
      oscillator.frequency.exponentialRampToValueAtTime(1180, pulseAt + 0.12)
      gain.gain.setValueAtTime(0.0001, pulseAt)
      gain.gain.exponentialRampToValueAtTime(0.32, pulseAt + 0.015)
      gain.gain.setValueAtTime(0.32, pulseAt + 0.11)
      gain.gain.exponentialRampToValueAtTime(0.0001, pulseAt + 0.15)
    })
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(startedAt)
    oscillator.stop(startedAt + 0.54)
  }

  const startAlarmSound = () => {
    if (alarmIntervalRef.current) return
    audioContextRef.current?.resume?.()
    alarmBeep()
    alarmIntervalRef.current = window.setInterval(alarmBeep, 650)
  }

  const stopAlarmSound = () => {
    if (alarmIntervalRef.current) window.clearInterval(alarmIntervalRef.current)
    alarmIntervalRef.current = null
  }

  const solveWakeChallenge = () => {
    stopAlarmSound()
    setWakeQuiz(null)
    alarmActiveRef.current = false
    drowsinessMonitorRef.current.reset()
    setDrowsinessState({ state: 'calibrating', suspiciousMs: 0 })
    setMessage('기상 문제를 모두 맞혔습니다. 자세를 바로 하고 집중을 이어가세요.')
  }



  const createTask = async (event) => {
    event.preventDefault()
    const payload = Object.fromEntries(new FormData(event.currentTarget))
    payload.estimated_minutes = Number(payload.estimated_minutes)
    payload.start_page = payload.start_page ? Number(payload.start_page) : null
    payload.end_page = payload.end_page ? Number(payload.end_page) : null
    setBusy(true)
    try {
      const task = await apiRequest('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      setTasks((current) => [...current, task]); setShowTaskForm(false); setTaskBook(null); setTaskTitle(''); setTaskStartPage(''); setTaskEndPage(''); setMessage('학습 작업을 추가하고 시작일부터 목표일까지 날짜별 페이지 계획을 배분했습니다.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }

  const applyCoachPlan = (accepted) => {
    setAcceptedCoachPlan(accepted)
    setTab('dashboard')
    setMessage('AI 학습 계획을 적용했습니다. 이번 주 학습 습관에서 오늘의 목표를 확인하세요.')
  }

  const selectTaskBook = (book) => {
    setTaskBook(book)
    if (!book) {
      setTaskTitle(''); setTaskStartPage(''); setTaskEndPage('')
      return
    }
    const pages = Number.parseInt(String(book.pages ?? '').replace(/[^0-9]/g, ''), 10)
    setTaskTitle((book.title || '').slice(0, 120))
    setTaskStartPage(Number.isFinite(pages) && pages > 0 ? '1' : '')
    setTaskEndPage(Number.isFinite(pages) && pages > 0 ? String(pages) : '')
  }

  const patchTask = async (taskId, update) => {
    try {
      const task = await apiRequest(`/api/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) })
      setTasks((current) => current.map((item) => item.id === task.id ? task : item))
      return task
    } catch (error) {
      setMessage(error.message)
      return null
    }
  }

  const setTaskCompletion = async (taskId, completed) => {
    const saved = await patchTask(taskId, { completed, ...(completed ? {} : { completed_minutes: 0 }) })
    if (!saved) return
    const goalKeys = completed
      ? taskGoalKeysThroughDate(tasks, acceptedCoachPlan, taskId, todayString())
      : taskGoalKeysForDate(tasks, acceptedCoachPlan, taskId, todayString())
    if (goalKeys.length) {
      setDailyChecks((current) => {
        const next = { ...current }
        goalKeys.forEach((key) => {
          if (completed) next[key] = true
          else delete next[key]
        })
        localStorage.setItem('study-rhythm-daily-checks', JSON.stringify(next))
        return next
      })
    }
    setMessage(completed
      ? `공부 작업을 완료했습니다.${goalKeys.length ? ' 홈의 오늘 목표에도 반영했습니다.' : ''}`
      : `공부 작업을 되돌렸습니다.${goalKeys.length ? ' 홈의 오늘 목표 체크도 해제했습니다.' : ''}`)
  }

  const recordPartial = (task) => {
    const value = window.prompt(`지금까지 실제로 공부한 시간을 입력해 주세요. (전체 ${task.estimated_minutes}분)`, task.completed_minutes || 0)
    if (value === null) return
    const minutes = Number(value)
    if (!Number.isFinite(minutes) || minutes < 0) return setMessage('올바른 시간을 입력해 주세요.')
    patchTask(task.id, { completed_minutes: Math.min(minutes, task.estimated_minutes) })
  }

  const removeTask = async (task) => {
    if (!window.confirm(`‘${task.title}’ 작업을 삭제할까요?`)) return
    try { await apiRequest(`/api/tasks/${task.id}`, { method: 'DELETE' }); setTasks((current) => current.filter((item) => item.id !== task.id)) }
    catch (error) { setMessage(error.message) }
  }

  const saveGoal = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const updatedProfile = {
      ...profile,
      goal_type: form.get('goal_type'),
      goal_description: form.get('goal_description'),
      target_date: form.get('target_date') || null,
      hope_university: form.get('hope_university'),
      hope_department: form.get('hope_department'),
      current_subject_grades: Object.fromEntries(GRADE_SUBJECTS.map((subject) => [subject, form.get(`current_grade_${subject}`) || ''])),
      required_subject_grades: Object.fromEntries(GRADE_SUBJECTS.map((subject) => [subject, form.get(`required_grade_${subject}`) || ''])),
    }
    setBusy(true)
    try {
      const saved = await apiRequest('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile),
      })
      setProfile(saved)
      setShowGoalEditor(false)
      setMessage('나의 목표를 저장했습니다.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }

  const searchAdmissions = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const result = await apiRequest(`/api/admissions/search?university=${encodeURIComponent(form.get('admission_university'))}&department=${encodeURIComponent(form.get('admission_department'))}`)
      setAdmissionSearch(result.results)
    } catch (error) { setMessage(error.message) }
  }

  const saveFocusRecord = async (startedAt, endedAt, subject) => {
    if (startedAt === null || endedAt <= startedAt) return false
    await apiRequest('/api/study-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newStudySessionId(),
        subject: subject || '집중 학습',
        intervals: [{ start: new Date(startedAt).toISOString(), end: new Date(endedAt).toISOString() }],
      }),
    })
    setStudySessionsRevision((value) => value + 1)
    return true
  }

  const finishDirectFocusRecord = async (startedAt, endedAt, subject, automatic = false) => {
    try {
      const saved = await saveFocusRecord(startedAt, endedAt, subject)
      const seconds = startedAt === null ? 0 : Math.max(0, Math.floor((endedAt - startedAt) / 1000))
      setMessage(saved
        ? `${subject || '집중 학습'} 집중 시간 ${formatDuration(seconds)}을 나의 학습 기록에 저장했습니다.`
        : '저장할 집중 시간이 없습니다.')
    } catch (error) {
      setMessage(`${automatic ? '카메라는 종료되었지만 ' : ''}집중 시간을 저장하지 못했습니다. ${error.message}`)
    }
  }

  const beginCameraSession = async (withTimer, subject = '집중 학습') => {
    setFocusError('')
    if (cameraPendingRef.current || cameraStreamRef.current) return
    cameraPendingRef.current = true
    setCameraStarting(true)
    prepareAlarmAudio()
    try {
      const stream = await openCamera()
      cameraStreamRef.current = stream
      cameraTimerLinkedRef.current = withTimer
      focusDirectRecordRef.current = !withTimer
      focusSubjectRef.current = subject
      drowsinessMonitorRef.current.reset()
      setDrowsinessState({ state: 'calibrating', suspiciousMs: 0 })
      setDrowsinessCount(0)
      const startedAt = Date.now()
      focusStartedAtRef.current = startedAt
      setFocusStartedAt(startedAt)
      setFocusElapsedSeconds(0)
      setFocusActive(true)
      if (withTimer) setCameraTimerRequest('start')
      stream.getTracks().forEach((track) => track.addEventListener('ended', () => {
        const endedAt = Date.now()
        const startedAt = focusStartedAtRef.current
        const saveDirectly = focusDirectRecordRef.current
        focusDirectRecordRef.current = false
        cameraStreamRef.current = null
        setFocusActive(false)
        if (startedAt !== null) setFocusElapsedSeconds(Math.max(0, Math.floor((endedAt - startedAt) / 1000)))
        focusStartedAtRef.current = null
        setFocusStartedAt(null)
        if (withTimer) setCameraTimerRequest('finish')
        cameraTimerLinkedRef.current = false
        if (saveDirectly) finishDirectFocusRecord(startedAt, endedAt, focusSubjectRef.current, true)
        else setMessage('카메라가 꺼져 타이머도 종료하고 기록을 저장합니다.')
      }, { once: true }))
      setMessage(withTimer ? '집중 세션을 시작했습니다. 카메라와 타이머가 함께 작동합니다.' : '집중 촬영을 시작했습니다.')
    } catch (error) {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
      focusDirectRecordRef.current = false
      setFocusError(cameraError(error))
    } finally {
      cameraPendingRef.current = false
      setCameraStarting(false)
    }
  }

  const startFocusSession = () => beginCameraSession(true)
  const startFocusView = (subject) => beginCameraSession(false, subject)

  const stopFocusSession = () => {
    const withTimer = cameraTimerLinkedRef.current
    const endedAt = Date.now()
    const startedAt = focusStartedAtRef.current
    const saveDirectly = focusDirectRecordRef.current
    focusDirectRecordRef.current = false
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    cameraTimerLinkedRef.current = false
    setFocusActive(false)
    if (startedAt !== null) setFocusElapsedSeconds(Math.max(0, Math.floor((endedAt - startedAt) / 1000)))
    focusStartedAtRef.current = null
    setFocusStartedAt(null)
    drowsinessMonitorRef.current.reset()
    setDrowsinessState({ state: 'idle', suspiciousMs: 0 })
    if (withTimer) setCameraTimerRequest('finish')
    if (saveDirectly) finishDirectFocusRecord(startedAt, endedAt, focusSubjectRef.current)
    else setMessage('집중 세션을 종료했습니다. 카메라를 끄고 타이머 기록을 저장합니다.')
  }

  const stopCameraOnly = () => {
    const endedAt = Date.now()
    const startedAt = focusStartedAtRef.current
    const saveDirectly = focusDirectRecordRef.current
    focusDirectRecordRef.current = false
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setFocusActive(false)
    if (startedAt !== null) setFocusElapsedSeconds(Math.max(0, Math.floor((endedAt - startedAt) / 1000)))
    focusStartedAtRef.current = null
    setFocusStartedAt(null)
    drowsinessMonitorRef.current.reset()
    setDrowsinessState({ state: 'idle', suspiciousMs: 0 })
    if (saveDirectly) finishDirectFocusRecord(startedAt, endedAt, focusSubjectRef.current)
    else setMessage('카메라만 껐습니다. 타이머는 계속 기록 중입니다.')
  }

  if (profile === undefined) return <main className="loading-screen">기본 설정을 불러오는 중…</main>
  if (showOnboarding || (profile === null && !onboardingDismissed)) return <Onboarding
    initialProfile={profile}
    onComplete={(saved) => { setProfile(saved); setShowOnboarding(false); setOnboardingDismissed(false) }}
    onClose={() => { setShowOnboarding(false); setOnboardingDismissed(true) }}
  />
  if (profile === null) return <main className="onboarding-shell"><section className="question-card setup-paused"><span className="coach-name">오름</span><h1>준비되면 시작해요</h1><p>학습 목표와 생활 리듬을 설정하면 나만의 계획을 만들 수 있어요.</p><button type="button" onClick={() => setShowOnboarding(true)}>기본 설정 시작</button></section></main>

  const today = todayString()
  const initialTodayGoals = applyAcceptedPlan([{ key: today, goals: goalsForDate(tasks, today) }], acceptedCoachPlan, tasks)[0].goals
  const progressGoals = todayHabitGoals?.date === today ? todayHabitGoals.goals : initialTodayGoals
  const daily = progressForGoals(progressGoals, dailyChecks)
  const progress = daily.percent
  const activeTasks = tasks.filter((task) => !task.completed)
  const completedTasks = tasks.filter((task) => task.completed)
  const taskPlanDays = taskStartDate && taskTargetDate ? periodDays(taskStartDate, taskTargetDate) : 0
  const taskPageCount = taskStartPage && taskEndPage && Number(taskEndPage) >= Number(taskStartPage) ? Number(taskEndPage) - Number(taskStartPage) + 1 : 0
  const toggleDailyGoal = (key) => setDailyChecks((current) => {
    const next = { ...current, [key]: !current[key] }
    if (next[key] === false) delete next[key]
    localStorage.setItem('study-rhythm-daily-checks', JSON.stringify(next))
    return next
  })
  const postureLabel = drowsinessState.state === 'calibrating' ? '기준 자세 학습 중' : drowsinessState.state === 'suspected' ? `졸음 의심 ${Math.min(10, Math.floor(drowsinessState.suspiciousMs / 1000) + 1)}초 / 10초` : focusActive ? '정상' : '대기'
  const focusGoals = applyAcceptedPlan([{ key: today, date: new Date(`${today}T12:00:00`), goals: goalsForDate(tasks, today) }], acceptedCoachPlan, tasks)[0].goals
  return <main className="app-shell">
    {wakeQuiz && <WakeUpChallenge quiz={wakeQuiz} onSolved={solveWakeChallenge} />}
    <header className="topbar"><div className="brand"><span>오</span><div><strong>오름</strong><small>수능 목표 플래너</small></div></div></header>
    <nav className="app-tabs" aria-label="주 메뉴">{[['dashboard','홈'],['focus','집중 화면'],['tasks','공부 관리'],['coach','AI 학습 코치'],['settings','기본 설정']].map(([id, label]) => <button type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined} key={id}><TabIcon name={id} /><span className="tab-label">{label}</span>{id === 'tasks' && activeTasks.length ? <span>{activeTasks.length}</span> : ''}</button>)}</nav>
    {message && <div className="app-message">{message}</div>}

    {tab === 'focus' && <FocusView active={focusActive} starting={cameraStarting} focusStartedAt={focusStartedAt} focusElapsedSeconds={focusElapsedSeconds} videoRef={videoRef} canvasRef={skeletonCanvasRef} postureLabel={postureLabel} skeletonState={skeletonState} drowsinessCount={drowsinessCount} goals={focusGoals} checks={dailyChecks} today={today} error={focusError} onStart={startFocusView} onStop={stopFocusSession} />}

    {tab === 'dashboard' && <><div className="dashboard-top"><div className="dashboard-heading"><p>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p><h1>안녕하세요,<br />오늘도 좋은 하루예요! <span className="greeting-wave">👋</span></h1><span>작은 꾸준함이 큰 변화를 만들어요.</span></div><div className="focus-tools card"><section className="focus-card" id="focus-session"><div className="card-title"><div><span>집중 세션</span><h2>자세 코치</h2></div><i className={`status-dot ${focusActive ? 'active' : ''}`} /></div><div className={`camera-placeholder ${focusActive ? 'camera-active' : ''}`}>{focusActive ? <><video ref={videoRef} autoPlay muted playsInline aria-label="자세 코치 카메라 화면" /><canvas ref={skeletonCanvasRef} className="skeleton-overlay" aria-hidden="true" /></> : <><div className="person-icon">◯<span>╱│╲</span></div><p>집중 세션은 함께 시작하고, 카메라만 따로 끌 수도 있습니다.</p></>}</div>{focusError && <p className="focus-error">{focusError}</p>}{skeletonState === 'error' && <p className="focus-error">스켈레톤을 불러오지 못했습니다. 카메라를 다시 시작해 주세요.</p>}<div className={`drowsiness-status ${drowsinessState.state === 'suspected' ? 'is-suspected' : ''}`}><span>졸음 감지</span><b>{postureLabel}</b></div><div className="monitor-options"><span>카메라 <b>{focusActive ? '실행 중' : '대기'}</b></span><span>스켈레톤 <b>{skeletonState === 'active' ? '인식 중' : skeletonState === 'loading' ? '준비 중' : skeletonState === 'error' ? '오류' : '대기'}</b></span></div><div className="focus-session-actions"><button className="focus-button" type="button" disabled={cameraStarting} onClick={focusActive ? stopFocusSession : startFocusSession}>{cameraStarting ? '카메라 권한 확인 중…' : focusActive ? '집중 세션 종료·저장' : '카메라·타이머 시작'}</button>{focusActive && <button className="camera-only-button" type="button" onClick={stopCameraOnly}>카메라만 끄기</button>}</div><small className="privacy">자세 인식과 졸음 추정은 이 브라우저 안에서만 처리되며 영상은 저장되지 않습니다.</small></section><div className="focus-timer-slot" ref={setTimerContainer} /></div></div><StudyTimeChart timerContainer={timerContainer} cameraTimerRequest={cameraTimerRequest} onCameraTimerHandled={() => setCameraTimerRequest(null)} sessionsRevision={studySessionsRevision} onTodayStudyChange={setTodayStudy} tasks={tasks} subjects={profile.managed_subjects} habitPanel={<StudyHabits tasks={tasks} acceptedPlan={acceptedCoachPlan} checks={dailyChecks} onToggle={toggleDailyGoal} onTodayGoalsChange={syncTodayHabitGoals} />} /><section className="daily-highlight" aria-label="학습 진행 현황">
        <div className="highlight-top"><span>오늘의 학습 목표</span><strong>{progress}<span>%</span></strong></div>
        <div className="highlight-progress" role="progressbar" aria-label="오늘 학습 목표 달성률" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>
        <span className="highlight-saying-label">오늘의 격언</span>
        <h2 className="highlight-saying">“{dailySaying(today)}”</h2>
        <p>{daily.total ? `오늘 목표 ${daily.completed} / ${daily.total}개 완료 · 완료한 계획 ${formatDuration(daily.seconds)}${progress === 100 ? ' · 오늘 목표 달성!' : ''}` : '오늘 배정된 목표가 없어요. 시작일과 목표일을 정해 공부할 일을 추가하세요.'}</p>
        <small className="highlight-daily-note">{todayStudy.date === today && todayStudy.seconds !== null && `오늘 타이머 실측 ${formatDuration(todayStudy.seconds)} · `}오늘 목표의 체크·해제에 맞춰 진행률이 바뀝니다. 날짜가 바뀌면 새 목표로 시작해요.</small>
        <button type="button" onClick={() => setTab('tasks')}>나의 할 일 보기 <span>›</span></button>
      </section>
      <details className="goal-disclosure"><summary>나의 목표와 성적 <span>시험 성적 보기</span></summary><ExamProgress profile={profile} /></details></>}

    {tab === 'tasks' && <><div className="tab-heading"><div><span>STUDY INBOX</span><h1>공부 관리</h1><p>해야 할 공부를 등록하고 실제 진행량을 기록하세요.</p></div><button type="button" onClick={() => setShowTaskForm(true)}>＋ 공부할 일 추가</button></div>
    {showTaskForm && <section className="card task-form-card"><div className="card-title"><div><span>새 작업</span><h2>공부할 일 추가</h2></div><button type="button" onClick={() => setShowTaskForm(false)}>닫기</button></div><form className="task-form" onSubmit={createTask}>
      <TaskBookPicker selectedBook={taskBook} onSelect={selectTaskBook} />
      {taskBook && <><input type="hidden" name="book_isbn13" value={taskBook.isbn13 || ''} /><input type="hidden" name="book_publisher" value={(taskBook.publisher || '').slice(0, 120)} /><input type="hidden" name="book_cover" value={(taskBook.cover || '').slice(0, 500)} /></>}
      <label>과목<select name="subject" defaultValue={profile.managed_subjects[0] || '국어'}>{SUBJECTS.map((subject) => <option key={subject}>{subject}</option>)}</select></label>
      <label className="wide">공부할 내용<input name="title" required maxLength="120" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="예: 미적분 기출문제 2단원" /></label>
      <label>전체 예상 공부시간 (분)<input name="estimated_minutes" type="number" required min="10" max="60000" step="10" defaultValue="50" /></label>
      <label>시작일<input name="start_date" type="date" required value={taskStartDate} onChange={(event) => { setTaskStartDate(event.target.value); if (event.target.value > taskTargetDate) setTaskTargetDate(event.target.value) }} /></label>
      <label>목표일<input name="target_date" type="date" required min={taskStartDate} value={taskTargetDate} onChange={(event) => setTaskTargetDate(event.target.value)} /></label>
      <p className="task-allocation-preview">{taskPlanDays > 0 ? `${taskStartDate}부터 ${taskTargetDate}까지 ${taskPlanDays}일에 공부시간${taskPageCount ? `과 총 ${taskPageCount}쪽(하루 약 ${Math.ceil(taskPageCount / taskPlanDays)}쪽)` : '과 입력한 페이지'}을 자동 배분합니다.` : '시작일과 목표일을 선택해 주세요.'} 저장 후 학습 습관에서 날짜별 계획을 확인하세요.</p>
      <label>우선순위<select name="priority" defaultValue="보통"><option>높음</option><option>보통</option><option>낮음</option></select></label>
      <label>시작 페이지<input name="start_page" type="number" min="1" value={taskStartPage} onChange={(event) => setTaskStartPage(event.target.value)} placeholder="예: 20" /></label>
      <label>끝 페이지<input name="end_page" type="number" min="1" value={taskEndPage} onChange={(event) => setTaskEndPage(event.target.value)} placeholder="예: 80" /></label>
      <label className="wide">메모<input name="notes" maxLength="1000" placeholder="교재, 범위 또는 완료 기준" /></label><button type="submit" disabled={busy}>{busy ? '저장 중…' : '작업 추가'}</button>
    </form></section>}
    <section className="card task-list-card"><div className="card-title"><div><span>학습 작업</span><h2>해야 할 공부</h2></div><strong>{activeTasks.length}개 남음</strong></div>
      {!activeTasks.length && <div className="empty-tasks"><strong>등록된 공부가 없습니다.</strong><p>공부할 일을 추가하면 오늘 계획에 자동으로 배치합니다.</p><button type="button" onClick={() => setShowTaskForm(true)}>첫 작업 추가</button></div>}
      <div className="task-list">{activeTasks.map((task) => <article className="task-item" key={task.id}><i /><div><span>{task.subject} · {task.priority}</span><strong>{task.title}</strong><small>{taskStart(task)} ~ {task.target_date} · {periodDays(taskStart(task), task.target_date)}일 자동 계획</small>{task.book_isbn13 && <div className="task-book-reference">{task.book_cover && <img src={task.book_cover} alt="" />}<small>{task.book_publisher || '출판사 정보 없음'} · ISBN13 {task.book_isbn13}{task.start_page && task.end_page ? ` · ${task.start_page}~${task.end_page}쪽` : ''}</small></div>}{task.notes && <p>{task.notes}</p>}</div><div className="task-actions"><button type="button" onClick={() => recordPartial(task)}>일부 완료</button><button type="button" className="complete" onClick={() => setTaskCompletion(task.id, true)}>완료</button><button type="button" className="delete" onClick={() => removeTask(task)}>삭제</button></div></article>)}</div>
      {completedTasks.length > 0 && <details className="completed-list"><summary>완료한 작업 {completedTasks.length}개</summary>{completedTasks.map((task) => <div key={task.id}><span>✓ {task.subject}</span><strong>{task.title}</strong><button type="button" onClick={() => setTaskCompletion(task.id, false)}>되돌리기</button></div>)}</details>}
    </section></>}

    <div hidden={tab !== 'coach'}><StudyCoach profile={profile} onSettings={() => setTab('settings')} onPlanAccepted={applyCoachPlan} /></div>

    {tab === 'settings' && <><div className="tab-heading"><div><span>MY RHYTHM</span><h1>기본 설정</h1><p>질문에서 정한 목표와 학습 리듬을 확인하세요.</p></div><button type="button" onClick={() => setShowOnboarding(true)}>대화형 질문 다시하기</button></div>
      <section className="card goal-settings"><div className="card-title"><div><span>나의 목표</span><h2>목표 수정</h2></div><button type="button" onClick={() => setShowGoalEditor((visible) => !visible)}>{showGoalEditor ? '닫기' : '목표 바꾸기'}</button></div>
        {!showGoalEditor ? <div className="goal-preview"><strong>{profile.hope_university || '희망 대학을 입력해 주세요'}{profile.hope_department && ` · ${profile.hope_department}`}</strong><span>{profile.goal_type} · {profile.target_date || '목표일 미정'}</span></div> : <form className="goal-form" onSubmit={saveGoal}><label>목표 종류<select name="goal_type" defaultValue={profile.goal_type}>{['수능 준비', '모의고사 준비', '내신 시험 준비', '특정 과목 향상', '공부 습관 만들기'].map((goal) => <option key={goal}>{goal}</option>)}</select></label><label className="wide">구체적인 목표<input name="goal_description" required minLength="1" maxLength="300" defaultValue={profile.goal_description} /></label><label>목표일 (선택)<input name="target_date" type="date" defaultValue={profile.target_date || ''} /></label><label>희망 대학<input name="hope_university" maxLength="120" defaultValue={profile.hope_university || ''} placeholder="예: 서울대학교" /></label><label>희망 학과<input name="hope_department" maxLength="120" defaultValue={profile.hope_department || ''} placeholder="예: 컴퓨터공학부" /></label><div className="grade-edit-table"><div className="grade-edit-row grade-edit-head"><span>과목</span><span>현재 성적</span><span>필요 수능 등급</span></div>{GRADE_SUBJECTS.map((subject) => <div className="grade-edit-row" key={subject}><strong>{subject}</strong><input name={`current_grade_${subject}`} defaultValue={profile.current_subject_grades?.[subject] || ''} placeholder="-" /><input name={`required_grade_${subject}`} defaultValue={profile.required_subject_grades?.[subject] || ''} placeholder="-" /></div>)}</div><button type="submit" disabled={busy}>{busy ? '저장 중…' : '목표 저장'}</button></form>}
      </section>
      <section className="card admission-search"><div className="card-title"><div><span>입시 참고 정보</span><h2>전년도 합격선 검색</h2></div></div><form onSubmit={searchAdmissions} className="admission-form"><input name="admission_university" required placeholder="학교명 (예: 서울과학기술대학교)" /><input name="admission_department" required placeholder="학과명 (예: 컴퓨터공학과)" /><button type="submit">검색</button></form>{admissionSearch && (admissionSearch.length ? admissionSearch.map((result) => <div className="admission-result" key={`${result.university}-${result.department}-${result.year}`}><strong>{result.university} · {result.department}</strong><span>{result.year}학년도 {result.selection}</span><b>최종등록자 70% cut 백분위 평균 {result.percentile_average}</b><b>대학별 환산점수 {result.converted_score} / {result.total_score}</b><a href={result.source_url} target="_blank" rel="noreferrer">어디가 원문 확인</a></div>) : <p className="admission-empty">등록된 자료가 없습니다. 대학별 입학처와 어디가의 해당 연도 자료를 확인해 주세요.</p>)}</section><section className="card settings-summary"><div><span>관리 과목</span><strong>{profile.managed_subjects.join(', ')}</strong><p>취약 과목: {profile.difficult_subjects.join(', ') || '없음'}</p></div><div><span>평일 학습</span><strong>{profile.weekday_study_start.slice(0,5)}~{profile.weekday_study_end.slice(0,5)}</strong><p>수면 {profile.sleep_time.slice(0,5)}~{profile.wake_time.slice(0,5)}</p></div><div><span>학습 방식</span><strong>{profile.focus_minutes}분 집중 + {profile.break_minutes}분 휴식</strong><p>{profile.learning_preferences?.join(', ') || '학습 선호 미설정'} · 계획 강도 {profile.plan_intensity}%</p></div></section></>}
  </main>
}

export default App
