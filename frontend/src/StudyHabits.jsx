import { useEffect, useState } from 'react'
import { dateKey, movePeriod } from './studyTime.js'
import { applyAcceptedPlan, applyTimetableEntries, habitWeek } from './taskAllocation.js'
import StudyTimetable, { requestTimetable } from './StudyTimetable.jsx'

export default function StudyHabits({ tasks, acceptedPlan, checks, onToggle, onTodayGoalsChange }) {
  const [selected, setSelected] = useState(() => dateKey(new Date()))
  const [timetableByDate, setTimetableByDate] = useState({})
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const taskDays = applyAcceptedPlan(habitWeek(selected, tasks), acceptedPlan, tasks)
  const weekStart = taskDays[0].key
  const weekEnd = taskDays[6].key
  const days = applyTimetableEntries(taskDays, timetableByDate)
  const day = days.find((item) => item.key === selected)
  const checked = (goal) => goal.fromSchedule ? goal.completed : Boolean(checks[goal.key])
  const completed = day.goals.filter(checked).length
  const weeklyCompleted = days.reduce((sum, item) => sum + item.goals.filter(checked).length, 0)
  const weeklyTotal = days.reduce((sum, item) => sum + item.goals.length, 0)
  const today = dateKey(new Date())
  const todayGoals = days.find((item) => item.key === today)?.goals
  const todayGoalsSignature = JSON.stringify((todayGoals || []).map((goal) => [goal.key, goal.minutes, Boolean(goal.fromSchedule), Boolean(goal.completed)]))

  useEffect(() => {
    if (todayGoals) onTodayGoalsChange?.({ date: today, goals: todayGoals })
  }, [today, todayGoalsSignature, onTodayGoalsChange])

  useEffect(() => {
    let active = true
    const keys = habitWeek(weekStart, []).map((item) => item.key)
    Promise.all(keys.map(async (key) => [key, await requestTimetable(key)]))
      .then((rows) => { if (active) { setTimetableByDate((current) => ({ ...current, ...Object.fromEntries(rows) })); setScheduleError('') } })
      .catch(() => { if (active) setScheduleError('이번 주 일정을 불러오지 못했습니다.') })
    return () => { active = false }
  }, [weekStart, weekEnd])

  const updateTimetable = (key, entries) => setTimetableByDate((current) => ({ ...current, [key]: entries }))
  async function toggleSchedule(goal) {
    const entries = timetableByDate[selected] || []
    const next = entries.map((entry) => entry.id === goal.task.id ? { ...entry, completed: !entry.completed } : entry)
    setScheduleBusy(true); setScheduleError('')
    try { updateTimetable(selected, await requestTimetable(selected, next)) }
    catch (error) { setScheduleError(error.message || '일정 완료 상태를 저장하지 못했습니다.') }
    finally { setScheduleBusy(false) }
  }

  return <section className="card habit-card" id="study-habits">
    <div className="card-title"><div><span>{days.some((item) => item.key === today) ? '이번 주' : '선택한 주'}</span><h2>학습 습관</h2></div><strong>{weeklyCompleted} / {weeklyTotal}개 완료</strong></div>
    <div className="habit-week-nav"><button type="button" aria-label="지난주 보기" onClick={() => setSelected(movePeriod(selected, 'week', -1))}>‹</button><span>{days[0].key.slice(5).replace('-', '.')} – {days[6].key.slice(5).replace('-', '.')}</span><button type="button" aria-label="다음 주 보기" onClick={() => setSelected(movePeriod(selected, 'week', 1))}>›</button></div>
    <div className="week-row habit-day-buttons">{days.map((item) => {
      const done = item.goals.filter(checked).length
      const progress = item.goals.length ? Math.round(done / item.goals.length * 100) : 0
      return <button type="button" key={item.key} aria-pressed={selected === item.key} aria-label={`${item.key} ${item.label}요일, ${item.goals.length}개 중 ${done}개 완료`} onClick={() => setSelected(item.key)}><span className="day-ring" style={{ background: `conic-gradient(#30d158 0 ${progress}%, #38383a ${progress}% 100%)` }}><i>{progress === 100 ? '✓' : item.label}</i></span><small>{item.date.getDate()}일</small></button>
    })}</div>
    <div className="habit-date-controls"><label><span className="chart-sr-only">학습 목표 날짜</span><input type="date" value={selected} onChange={(event) => { if (event.target.value) setSelected(event.target.value) }} /></label><button type="button" onClick={() => setSelected(today)}>오늘</button><button type="button" onClick={() => setSelected(movePeriod(today, 'day', 1))}>내일</button></div>
    <div className="weekly-goals">
      <div className="weekly-goals-title"><strong>{selected === today ? '오늘' : `${day.date.getMonth() + 1}월 ${day.date.getDate()}일 (${day.label})`}의 목표</strong><span>{completed} / {day.goals.length}개 · {day.goals.reduce((sum, goal) => sum + goal.minutes, 0)}분 계획</span></div>
      {day.goals.length ? <div className="daily-goals">{day.goals.map((goal) => <label key={goal.key} className={checked(goal) ? 'goal-done' : ''}><input type="checkbox" checked={checked(goal)} disabled={goal.fromSchedule && scheduleBusy} onChange={() => goal.fromSchedule ? toggleSchedule(goal) : onToggle(goal.key)} /><i className="goal-check" /><span><strong>{goal.task.subject} · {goal.task.title}</strong><small>{goal.fromCoach && 'AI 계획 · '}{goal.fromSchedule && `일정 ${goal.startTime}–${goal.endTime} · `}{goal.minutes}분{goal.startPage != null && ` · p. ${goal.startPage}~${goal.endPage}`}</small></span></label>)}</div> : <p>이 날짜에 배정된 공부가 없어요. 공부 관리에서 시작일과 목표일을 정해 추가해 보세요.</p>}
    </div>
    {scheduleError && <p className="focus-error" role="alert">{scheduleError}</p>}
    <StudyTimetable initialDate={selected} selectedDate={selected} embedded onEntriesChange={updateTimetable} />
    <p className="habit-plan-note">수락한 AI 계획은 해당 7일 동안 자동 배분을 대신합니다. 날짜별 체크는 각각 저장됩니다.</p>
  </section>
}
