import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { aggregateSessions, dateKey, elapsedSeconds, formatDuration, movePeriod, pauseTimer, periodBuckets, timerIntervals } from './studyTime.js'
import { apiFetch } from './api.js'

const TIMER_KEY = 'study-rhythm-timer-v1'
const SUBJECTS_KEY = 'study-rhythm-timer-subjects-v1'
function restoreSubjects() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUBJECTS_KEY) || '[]')
    return Array.isArray(saved) ? [...new Set(saved.filter((item) => typeof item === 'string' && item.trim() && item.length <= 40).map((item) => item.trim()))] : []
  } catch { return [] }
}
function restoreTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null')
    if (saved && typeof saved.id === 'string' && typeof saved.subject === 'string' && Array.isArray(saved.intervals) && saved.intervals.every((interval) => Number.isFinite(Date.parse(interval.start)) && Number.isFinite(Date.parse(interval.end))) && (!saved.runningSince || Number.isFinite(Date.parse(saved.runningSince))) && (!saved.pausedAt || Number.isFinite(Date.parse(saved.pausedAt)))) return saved
  } catch { /* A fresh timer remains usable when storage is unavailable. */ }
  return null
}
function newId() {
  // randomUUID is unavailable on HTTP LAN addresses.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export default function StudyTimeChart({ tasks, subjects: managedSubjects = [], habitPanel, timerContainer, onTodayStudyChange, cameraTimerRequest = false, onCameraTimerHandled, sessionsRevision = 0 }) {
  const [mode, setMode] = useState('week')
  const [date, setDate] = useState(() => dateKey(new Date()))
  const [selected, setSelected] = useState('all')
  const [timer, setTimer] = useState(restoreTimer)
  const [subject, setSubject] = useState(() => managedSubjects[0] || '국어')
  const [sessions, setSessions] = useState([])
  const [customSubjects, setCustomSubjects] = useState(restoreSubjects)
  const [subjectDraft, setSubjectDraft] = useState('')
  const [subjectNotice, setSubjectNotice] = useState('')
  const [now, setNow] = useState(Date.now)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const [reload, setReload] = useState(0)
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    let active = true
    apiFetch('/api/study-sessions').then(async (response) => {
      if (!response.ok) throw new Error('기록을 불러오지 못했습니다.')
      const data = await response.json()
      if (active) { setSessions(data); setLoadError(''); setLoading(false) }
    }).catch(() => { if (active) { setLoadError('공부 기록을 불러오지 못했어요.'); setLoading(false) } })
    return () => { active = false }
  }, [reload, sessionsRevision])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function sync(event) {
      if (event.key === TIMER_KEY) setTimer(restoreTimer())
      if (event.key === SUBJECTS_KEY) setCustomSubjects(restoreSubjects())
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function persist(next) {
    setTimer(next)
    try {
      if (next) localStorage.setItem(TIMER_KEY, JSON.stringify(next))
      else localStorage.removeItem(TIMER_KEY)
    } catch { setError('브라우저에 타이머 상태를 보관하지 못했어요. 저장할 때까지 이 화면을 유지해 주세요.') }
  }

  function start() {
    if (saving.current || timer?.pendingSave || timer?.runningSince) return
    setError(''); setNotice('')
    const stamp = Date.now()
    setNow(stamp)
    if (timer) {
      const resumed = { ...timer, runningSince: new Date(stamp).toISOString() }
      delete resumed.pausedAt
      persist(resumed)
    } else {
      persist({ id: newId(), subject, intervals: [], runningSince: new Date(stamp).toISOString() })
    }
  }

  useEffect(() => {
    if (!cameraTimerRequest) return
    if (cameraTimerRequest === 'finish') {
      if (timer) finish()
    } else if (saving.current || timer?.pendingSave) {
      setError('카메라는 켜졌지만 이전 기록이 저장 대기 중이에요. 저장을 완료한 뒤 공부 시작을 눌러 주세요.')
    } else {
      start()
    }
    onCameraTimerHandled?.()
  }, [cameraTimerRequest, onCameraTimerHandled])

  function pause() {
    const stamp = Date.now()
    setNow(stamp)
    persist({ ...pauseTimer(timer, stamp), pausedAt: new Date(stamp).toISOString() })
    setNotice('일시정지했습니다. 10분 안에 이어서 공부하지 않으면 자동으로 저장됩니다.')
  }

  async function finish({ autoSave = false } = {}) {
    if (saving.current || !timer) return
    const stopped = pauseTimer(timer, Date.now())
    if (!stopped.intervals.length) { persist(null); return }
    persist({ ...stopped, pendingSave: true })
    saving.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await apiFetch('/api/study-sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: stopped.id, subject: stopped.subject, intervals: stopped.intervals }),
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error('저장하지 못했어요. 다시 저장해 주세요.')
      const saved = await response.json()
      setSessions((current) => [...current.filter((item) => item.id !== saved.id), saved])
      persist(null)
      setNotice(autoSave
        ? `10분 동안 일시정지되어 ${saved.subject} ${formatDuration(elapsedSeconds(saved.intervals))} 기록을 자동 저장했어요.`
        : `${saved.subject} ${formatDuration(elapsedSeconds(saved.intervals))} 기록을 저장했어요.`)
    } catch { setError('저장에 실패했어요. 측정 기록은 유지되니 다시 저장해 주세요.') }
    finally { saving.current = false; setBusy(false) }
  }

  useEffect(() => {
    if (!timer?.pausedAt || timer.runningSince || timer.pendingSave || saving.current) return
    const remaining = 10 * 60 * 1000 - (Date.now() - Date.parse(timer.pausedAt))
    if (remaining <= 0) {
      finish({ autoSave: true })
      return
    }
    const timeout = setTimeout(() => finish({ autoSave: true }), remaining)
    return () => clearTimeout(timeout)
  }, [timer])

  const timerSubjects = [...new Set([...managedSubjects, ...customSubjects, ...tasks.map((task) => task.subject), timer?.subject, subject].filter(Boolean))]
  const subjects = [...new Set([...managedSubjects, ...customSubjects, ...tasks.map((task) => task.subject), ...sessions.map((session) => session.subject), timer?.subject, subject].filter(Boolean))]
  function addSubject(event) {
    event.preventDefault()
    const name = subjectDraft.trim()
    if (!name) { setSubjectNotice('추가할 과목 이름을 입력해 주세요.'); return }
    if (name.length > 40) { setSubjectNotice('과목 이름은 40자 이내로 입력해 주세요.'); return }
    const alreadyExists = timerSubjects.includes(name)
    if (!alreadyExists) {
      const next = [...new Set([...restoreSubjects(), ...customSubjects, name])]
      try { localStorage.setItem(SUBJECTS_KEY, JSON.stringify(next)) }
      catch { setSubjectNotice('과목을 저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); return }
      setCustomSubjects(next)
    }
    if (!timer) setSubject(name)
    setSubjectDraft('')
    setSubjectNotice(timer ? `${name} 과목을 ${alreadyExists ? '목록에서 확인했어요' : '추가했어요'}. 현재 타이머를 종료한 뒤 선택할 수 있어요.` : `${name} 과목을 선택했어요. 공부를 시작해 보세요.`)
  }
  function removeSubject(name) {
    const next = customSubjects.filter((item) => item !== name)
    try { localStorage.setItem(SUBJECTS_KEY, JSON.stringify(next)) }
    catch { setSubjectNotice('과목을 삭제하지 못했어요. 다시 시도해 주세요.'); return }
    setCustomSubjects(next)
    if (subject === name) setSubject(managedSubjects[0] || '국어')
    setSubjectNotice(`${name} 과목을 직접 추가 목록에서 삭제했어요. 기존 공부 기록은 유지됩니다.`)
  }
  const activeIntervals = timerIntervals(timer, now)
  const liveSessions = timer ? [...sessions.filter((session) => session.id !== timer.id), { ...timer, intervals: activeIntervals }] : sessions
  const todayKey = dateKey(new Date(now))
  const todaySeconds = aggregateSessions(liveSessions, periodBuckets('day', todayKey)).reduce((sum, bucket) => sum + bucket.seconds, 0)
  useEffect(() => {
    onTodayStudyChange?.({ date: todayKey, seconds: loading || loadError ? null : todaySeconds })
  }, [todayKey, todaySeconds, loading, loadError, onTodayStudyChange])
  const buckets = aggregateSessions(liveSessions, periodBuckets(mode, date), selected)
  const total = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0)
  const maximum = Math.max(60, ...buckets.map((bucket) => bucket.seconds))
  const elapsed = Math.floor(elapsedSeconds(activeIntervals))
  const clock = [Math.floor(elapsed / 3600), Math.floor(elapsed % 3600 / 60), elapsed % 60].map((part) => String(part).padStart(2, '0')).join(':')
  const chosen = picked === null ? null : buckets[picked]
  const rangeLabel = mode === 'day' ? date : mode === 'month' ? date.slice(0, 7).replace('-', '년 ') + '월' : `${buckets[0].date} ~ ${buckets.at(-1).date.slice(5)}`

  const timerPanel = (
<div className={`study-timer ${timer?.runningSince ? 'running' : ''}`}>
      <div className="timer-heading"><strong><i />{timer?.pendingSave ? '저장 대기' : timer?.runningSince ? '지금 집중하고 있어요' : timer ? '잠시 쉬는 중' : '집중 타이머'}</strong><label><span className="chart-sr-only">타이머 과목 선택</span><select value={timer?.subject || subject} disabled={Boolean(timer)} onChange={(event) => setSubject(event.target.value)}>{timerSubjects.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <form className="timer-subject-form" onSubmit={addSubject}>
        <label htmlFor="timer-custom-subject">과목 직접 추가</label>
        <div><input id="timer-custom-subject" value={subjectDraft} maxLength={40} placeholder="예: 물리학, 일본어, 자격증 공부" onChange={(event) => { setSubjectDraft(event.target.value); setSubjectNotice('') }} /><button type="submit" disabled={busy}>추가</button></div>
        {subjectNotice && <p role="status">{subjectNotice}</p>}
      </form>
      {customSubjects.length > 0 && <ul className="timer-custom-subjects" aria-label="직접 추가한 과목">{customSubjects.map((name) => <li key={name}><span>{name}</span><button type="button" aria-label={`${name} 과목 삭제`} onClick={() => removeSubject(name)}>×</button></li>)}</ul>}
      <div className="timer-digits" role="timer" aria-label={`공부 시간 ${clock}`}>{clock}</div>
      <div className="timer-buttons">{timer && !timer?.pendingSave && <button type="button" className="timer-primary" onClick={timer?.runningSince ? pause : start} disabled={busy}>{timer?.runningSince ? '일시정지' : '이어서 공부'}</button>}{timer && <button type="button" onClick={() => finish()} disabled={busy}>{busy ? '저장 중…' : timer.pendingSave ? '다시 저장' : '종료하고 저장'}</button>}</div>
      <p>일시정지한 시간은 제외해요. 10분 동안 이어서 공부하지 않으면 기록을 자동 저장하고 0분으로 초기화합니다.</p>
      {error && <p role="alert" className="focus-error">{error}</p>}{notice && <p role="status" className="timer-notice">{notice}</p>}
    </div>
  )

  return <section className="card study-time-card" aria-labelledby="study-time-title">
    <div className="card-title"><div><span>나의 학습 기록</span><h2 id="study-time-title">공부 시간</h2></div><label className="chart-filter"><span className="chart-sr-only">그래프 과목 선택</span><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="all">전체 과목</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <div className="period-tabs" aria-label="그래프 기간">{[['day', '일별'], ['week', '주간별'], ['month', '월별']].map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { setMode(value); setPicked(null) }}>{label}</button>)}</div>
    <div className="period-navigation"><button type="button" aria-label="이전 기간" onClick={() => { setDate(movePeriod(date, mode, -1)); setPicked(null) }}>‹</button><strong>{rangeLabel}</strong><button type="button" aria-label="다음 기간" onClick={() => { setDate(movePeriod(date, mode, 1)); setPicked(null) }}>›</button></div>
    <div className="chart-date-controls"><label>기준 날짜 <input type="date" value={date} onChange={(event) => { if (event.target.value) { setDate(event.target.value); setPicked(null) } }} /></label><button type="button" onClick={() => { setDate(dateKey(new Date())); setPicked(null) }}>오늘</button></div>
    {loadError ? <p role="alert" className="focus-error">{loadError} <button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1) }}>다시 불러오기</button></p> : loading ? <p role="status">공부 기록을 불러오는 중…</p> : <>
      <div className="study-time-total"><strong>{formatDuration(total)}</strong><span>{timer ? '측정 중인 시간 포함' : '타이머로 기록한 시간'}</span></div>
      <div className="time-chart-scroll"><div className={`time-chart time-chart-${mode}`} aria-label={`${rangeLabel} 공부 시간 그래프`}>
        {buckets.map((bucket, index) => <button type="button" className={`time-column ${picked === index ? 'selected' : ''}`} key={bucket.start} onClick={() => setPicked(index)} aria-label={`${bucket.date} ${bucket.label}: ${formatDuration(bucket.seconds)}`} aria-pressed={picked === index}><span className="time-column-track"><i style={{ height: `${bucket.seconds / maximum * 100}%`, minHeight: bucket.seconds > 0 ? 3 : 0 }} /></span><span>{bucket.label}</span></button>)}
      </div></div>
      <p className="chart-selection" aria-live="polite">{chosen ? `${chosen.date} ${chosen.label} · ${formatDuration(chosen.seconds)}` : total ? '막대를 누르면 정확한 공부 시간을 볼 수 있어요.' : '이 기간에 측정한 공부 시간이 없어요. 아래 타이머로 시작해 보세요.'}</p>
    </>}
    {timerContainer ? createPortal(timerPanel, timerContainer) : timerPanel}
    <div className="timer-habits-layout habits-only">
    {habitPanel}
    </div>
    <p className="chart-note">날짜별 통계는 타이머 기록을 기준으로 해요. 기존 작업의 예상·완료 시간은 포함하지 않습니다. 일별은 시간대별, 주간·월별은 날짜별로 표시합니다.</p>
  </section>
}
