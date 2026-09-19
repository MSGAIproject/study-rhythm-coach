import test from 'node:test'
import assert from 'node:assert/strict'
import { dailyProgress, dailySaying, progressForGoals } from '../src/dailyProgress.js'
const tasks = [
  {id:'a',start_date:'2026-09-13',target_date:'2026-09-14',estimated_minutes:120},
  {id:'b',start_date:'2026-09-13',target_date:'2026-09-14',estimated_minutes:60},
]
test('checking and unchecking today goals matches the habit checklist',()=>{
  const checks={}
  assert.equal(dailyProgress(tasks,checks,'2026-09-13').percent,0)
  checks['a:2026-09-13']=true
  assert.equal(dailyProgress(tasks,checks,'2026-09-13').percent,50)
  assert.equal(dailyProgress(tasks,checks,'2026-09-13').seconds,3600)
  checks['b:2026-09-13']=true
  assert.equal(dailyProgress(tasks,checks,'2026-09-13').percent,100)
  delete checks['a:2026-09-13']
  assert.equal(dailyProgress(tasks,checks,'2026-09-13').percent,50)
  checks['b:2026-09-13']=false
  assert.equal(dailyProgress(tasks,checks,'2026-09-13').percent,0)
})
test('other dates and removed tasks do not change today progress',()=>{
  const checks={'a:2026-09-13':true,'b:2026-09-14':true,'deleted:2026-09-13':true}
  assert.equal(dailyProgress(tasks,checks,'2026-09-13').percent,50)
  assert.equal(dailyProgress(tasks,checks,'2026-09-14').percent,50)
  assert.equal(dailyProgress(tasks,{'a:2026-09-13':true},'2026-09-14').percent,0)
  assert.equal(dailyProgress([],checks,'2026-09-13').percent,0)
  assert.equal(dailySaying('2026-09-13'),dailySaying('2026-09-13'))
  assert.notEqual(dailySaying('2026-09-13'),dailySaying('2026-09-14'))
})
test('all visible habit goals count toward the home progress',()=>{
  const goals=[
    {key:'task:today',minutes:30},
    {key:'coach:today',minutes:50,fromCoach:true},
    {key:'schedule:today',minutes:60,fromSchedule:true,completed:false},
  ]
  assert.equal(progressForGoals(goals,{'task:today':true}).percent,33)
  assert.equal(progressForGoals(goals,{'task:today':true,'coach:today':true}).percent,67)
  goals[2].completed=true
  assert.equal(progressForGoals(goals,{'task:today':true,'coach:today':true}).percent,100)
})
