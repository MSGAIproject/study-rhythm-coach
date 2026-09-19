import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAcceptedPlan, applyTimetableEntries, goalsForDate, habitWeek, taskGoalKeysForDate, taskStart } from '../src/taskAllocation.js'

const task = {id:'A', subject:'수학',title:'기출', start_date:'2026-09-28',target_date:'2026-10-02', estimated_minutes:103,start_page:11,end_page:33,created_at:'2026-09-13T01:00:00Z'}
test('full period allocation preserves time/pages across weeks and months', () => {
  const dates=['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02']
  const goals=dates.flatMap((date)=>goalsForDate([task],date))
  assert.equal(goals.reduce((sum,goal)=>sum+goal.minutes,0),103)
  assert.equal(goals[0].startPage,11)
  assert.equal(goals.at(-1).endPage,33)
  goals.slice(1).forEach((goal,index)=>assert.equal(goal.startPage,goals[index].endPage+1))
  assert.deepEqual(goalsForDate([task],'2026-09-27'),[])
  assert.deepEqual(goalsForDate([task],'2026-10-03'),[])
})
test('time-only tasks, single-day tasks and old records have stable allocations',()=>{
  const timeOnly={...task,start_page:null,end_page:null}
  assert.equal(goalsForDate([timeOnly],'2026-09-28')[0].minutes,20)
  assert.equal(goalsForDate([{...timeOnly,target_date:timeOnly.start_date}],timeOnly.start_date)[0].minutes,103)
  assert.equal(taskStart({...task,start_date:null}),'2026-09-13')
  assert.equal(goalsForDate([task],'2026-09-29')[0].key,'A:2026-09-29')
  assert.equal(habitWeek('2026-10-01',[task])[0].key,'2026-09-28')
})
test('few pages do not create duplicates or lose pages',()=>{
  const small={...task,start_page:1,end_page:2}
  const goals=habitWeek('2026-09-28',[small]).flatMap(day=>day.goals)
  assert.equal(goals.filter(goal=>goal.startPage!==null).length,2)
  assert.equal(goals.reduce((sum,goal)=>sum+(goal.startPage===null?0:goal.endPage-goal.startPage+1),0),2)
})
test('accepted AI plan replaces automatic goals for referenced tasks during its seven days',()=>{
  const days=habitWeek('2026-09-28',[task])
  const accepted=applyAcceptedPlan(days,{
    plan_start_date:'2026-09-28',plan_end_date:'2026-10-04',goals:[
      {id:'PLAN-1-1',date:'2026-09-28',subject:'수학',title:'기출 집중',minutes:50,source_task_id:'A',start_page:11,end_page:15},
      {id:'PLAN-1-2',date:'2026-09-30',subject:'영어',title:'단어 복습',minutes:20,source_task_id:null,start_page:null,end_page:null},
    ],
  })
  assert.deepEqual(days[0].goals.map(goal=>goal.key),['A:2026-09-28'])
  assert.deepEqual(accepted[0].goals.map(goal=>goal.key),['coach:PLAN-1-1'])
  assert.equal(accepted[1].goals.length,0)
  assert.equal(accepted[2].goals[0].task.title,'단어 복습')
  assert.equal(accepted[2].goals[0].fromCoach,true)
})
test('task completion can find today automatic and accepted AI goals by task id',()=>{
  assert.deepEqual(taskGoalKeysForDate([task], {}, 'A', '2026-09-28'), ['A:2026-09-28'])
  const accepted={
    plan_start_date:'2026-09-28',plan_end_date:'2026-10-04',goals:[
      {id:'PLAN-1-1',date:'2026-09-28',subject:'수학',title:'기출 1회',minutes:30,source_task_id:'A'},
      {id:'PLAN-1-2',date:'2026-09-28',subject:'수학',title:'기출 오답',minutes:20,source_task_id:'A'},
      {id:'PLAN-1-3',date:'2026-09-28',subject:'영어',title:'단어',minutes:20,source_task_id:null},
    ],
  }
  assert.deepEqual(taskGoalKeysForDate([task], accepted, 'A', '2026-09-28'), ['coach:PLAN-1-1', 'coach:PLAN-1-2'])
  assert.deepEqual(taskGoalKeysForDate([task], accepted, 'UNKNOWN', '2026-09-28'), [])
})
test('completion preserves past plans and removes plans after the completion date',()=>{
  const completed={
    ...task, completed:true,
    planning_events:[{action:'completed',event_date:'2026-09-29'}],
  }
  assert.deepEqual(goalsForDate([completed],'2026-09-28').map(goal=>[goal.minutes,goal.startPage,goal.endPage]), [[20,11,14]])
  assert.deepEqual(goalsForDate([completed],'2026-09-29').map(goal=>[goal.minutes,goal.startPage,goal.endPage]), [[21,15,19]])
  assert.deepEqual(goalsForDate([completed],'2026-09-30'), [])
  assert.deepEqual(goalsForDate([completed],'2026-10-02'), [])
})
test('resume replans only the remaining work from the resume date',()=>{
  const resumed={
    ...task, completed:false,
    planning_events:[
      {action:'completed',event_date:'2026-09-29'},
      {action:'resumed',event_date:'2026-10-01'},
    ],
  }
  assert.deepEqual(goalsForDate([resumed],'2026-09-30'), [])
  assert.deepEqual(goalsForDate([resumed],'2026-10-01').map(goal=>[goal.minutes,goal.startPage,goal.endPage]), [[31,20,26]])
  assert.deepEqual(goalsForDate([resumed],'2026-10-02').map(goal=>[goal.minutes,goal.startPage,goal.endPage]), [[31,27,33]])
})
test('same-day resume resets that day and does not duplicate its allocation',()=>{
  const resumed={
    ...task, completed:false,
    planning_events:[
      {action:'completed',event_date:'2026-09-29'},
      {action:'resumed',event_date:'2026-09-29'},
    ],
  }
  const goals=['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'].flatMap(date=>goalsForDate([resumed],date))
  assert.equal(goals.reduce((sum,goal)=>sum+goal.minutes,0),103)
  assert.equal(goals.reduce((sum,goal)=>sum+(goal.startPage == null ? 0 : goal.endPage-goal.startPage+1),0),23)
  assert.equal(goals.filter(goal=>goal.key==='A:2026-09-29').length,1)
})
test('accepted AI goals sourced from a completed task are removed after completion',()=>{
  const completed={...task,completed:true,planning_events:[{action:'completed',event_date:'2026-09-29'}]}
  const accepted={plan_start_date:'2026-09-28',plan_end_date:'2026-10-04',goals:[
    {id:'PAST',date:'2026-09-29',subject:'수학',title:'기출',minutes:20,source_task_id:'A'},
    {id:'FUTURE',date:'2026-09-30',subject:'수학',title:'기출',minutes:20,source_task_id:'A'},
    {id:'GENERAL',date:'2026-09-30',subject:'영어',title:'단어',minutes:20,source_task_id:null},
  ]}
  const days=applyAcceptedPlan(habitWeek('2026-09-28',[completed]),accepted,[completed])
  assert.deepEqual(days[1].goals.map(goal=>goal.key),['coach:PAST'])
  assert.deepEqual(days[2].goals.map(goal=>goal.key),['coach:GENERAL'])
})
test('timetable entries become dated habit goals with their duration and completion',()=>{
  const days=habitWeek('2026-09-28',[])
  const merged=applyTimetableEntries(days,{'2026-09-28':[
    {id:'plan-1',subject:'수학',title:'오답 복습',start_time:'23:00:00',end_time:'24:00:00',completed:true},
  ]})
  assert.equal(merged[0].goals[0].key,'schedule:2026-09-28:plan-1')
  assert.equal(merged[0].goals[0].minutes,60)
  assert.equal(merged[0].goals[0].completed,true)
  assert.equal(merged[1].goals.length,0)
})
