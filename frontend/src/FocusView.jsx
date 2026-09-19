import { useEffect, useMemo, useState } from 'react'
import { requestTimetable } from './StudyTimetable.jsx'

function studyRange(goal) {
  if (goal.fromSchedule) return `${goal.subject} · ${goal.title} · ${goal.startTime}–${goal.endTime}`
  const pages = goal.startPage != null ? ` · p.${goal.startPage}~${goal.endPage}` : ''
  return `${goal.task.subject} · ${goal.task.title}${pages} · ${goal.minutes}분`
}

export default function FocusView({
  active, starting, videoRef, canvasRef, postureLabel, skeletonState, drowsinessCount,
  focusStartedAt, focusElapsedSeconds, goals, checks, today, error, onStart, onStop,
}) {
  const [now, setNow] = useState(() => new Date())
  const [scheduleEntries, setScheduleEntries] = useState([])
  const [selectedKey, setSelectedKey] = useState('')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let mounted = true
    requestTimetable(today).then((entries) => { if (mounted) setScheduleEntries(entries) }).catch(() => {
      if (mounted) setScheduleEntries([])
    })
    return () => { mounted = false }
  }, [today])

  const options = useMemo(() => [
    ...goals.map((goal) => ({
      key: goal.key,
      label: studyRange(goal),
      subject: goal.fromSchedule ? goal.subject : goal.task.subject,
      done: Boolean(checks[goal.key]),
    })),
    ...scheduleEntries.map((entry) => ({
      key: `schedule:${today}:${entry.id}`,
      label: `${entry.subject} · ${entry.title} · ${entry.start_time.slice(0, 5)}–${entry.end_time.slice(0, 5)}`,
      subject: entry.subject,
      done: entry.completed,
    })),
  ], [goals, checks, scheduleEntries, today])

  useEffect(() => {
    if (options.some((item) => item.key === selectedKey)) return
    setSelectedKey(options.find((item) => !item.done)?.key || options[0]?.key || '')
  }, [options, selectedKey])

  const clock = new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(now)
  const elapsedSeconds = active && focusStartedAt
    ? Math.max(0, Math.floor((now.getTime() - focusStartedAt) / 1000))
    : focusElapsedSeconds
  const focusTime = [Math.floor(elapsedSeconds / 3600), Math.floor(elapsedSeconds % 3600 / 60), elapsedSeconds % 60]
    .map((part) => String(part).padStart(2, '0')).join(':')

  return <section className="focus-view" aria-labelledby="focus-view-title">
    <div className="tab-heading focus-view-heading"><div><span>FOCUS VIEW</span><h1 id="focus-view-title">집중 화면</h1><p>현재 모습과 집중 시간, 공부 범위, 졸음 감지 횟수를 한 화면에서 확인하세요.</p></div></div>
    <div className={`focus-view-stage ${active ? 'is-active' : ''}`}>
      <video ref={videoRef} autoPlay muted playsInline aria-label="집중 화면 카메라 영상" />
      <canvas ref={canvasRef} className="focus-view-skeleton" aria-hidden="true" />
      {!active && <div className="focus-view-empty"><div className="person-icon">◯<span>╱│╲</span></div><strong>촬영을 시작하면 현재 모습이 표시됩니다.</strong><p>영상은 저장되지 않고 이 브라우저 안에서만 처리됩니다.</p></div>}
      <nav className="focus-view-nav" aria-label="집중 상태">
        <div className="focus-view-stat"><span>현재 시간</span><strong>{clock}</strong></div>
        <label className="focus-view-range"><span>공부해야 할 범위</span><select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} disabled={active || !options.length}>{options.length ? options.map((item) => <option value={item.key} key={item.key}>{item.done ? '완료 · ' : ''}{item.label}</option>) : <option value="">오늘 등록된 목표가 없습니다</option>}</select></label>
        <div className="focus-view-stat"><span>집중 시간</span><strong>{focusTime}</strong></div>
        <div className="focus-view-stat"><span>졸음 감지</span><strong aria-live="polite">{drowsinessCount}회</strong></div>
      </nav>
      <div className="focus-view-status"><i className={active ? 'active' : ''} /><span>{active ? postureLabel : '카메라 대기'}</span><small>{skeletonState === 'active' ? '스켈레톤 인식 중' : skeletonState === 'loading' ? '인식 준비 중' : skeletonState === 'error' ? '인식 오류' : '인식 대기'}</small></div>
    </div>
    {error && <p className="focus-error" role="alert">{error}</p>}
    <div className="focus-view-actions"><button type="button" onClick={active ? onStop : () => onStart(options.find((item) => item.key === selectedKey)?.subject || '집중 학습')} disabled={starting}>{starting ? '카메라 준비 중…' : active ? '집중 촬영 종료·기록 저장' : '집중 촬영 시작'}</button></div>
  </section>
}
