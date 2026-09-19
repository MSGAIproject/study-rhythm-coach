import test from 'node:test'
import assert from 'node:assert/strict'
import { DrowsinessMonitor, headHeightRatio } from '../src/drowsiness.js'
import { checkWakeQuiz, createWakeQuiz } from '../src/wakeQuiz.js'

function pose(noseY) {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1, presence: 1 }))
  landmarks[0] = { x: 0.5, y: noseY, visibility: 1, presence: 1 }
  landmarks[11] = { x: 0.3, y: 0.6, visibility: 1, presence: 1 }
  landmarks[12] = { x: 0.7, y: 0.6, visibility: 1, presence: 1 }
  return landmarks
}

test('head height is normalized by shoulder width', () => {
  assert.equal(headHeightRatio(pose(0.2)), 1)
  assert.equal(headHeightRatio(null), null)
})

test('alarm requires ten continuous seconds of a dropped head', () => {
  const monitor = new DrowsinessMonitor({ calibrationSamples: 3, thresholdMs: 10000, recoveryMs: 500 })
  monitor.update(pose(0.2), 0)
  monitor.update(pose(0.2), 100)
  monitor.update(pose(0.2), 200)
  assert.equal(monitor.update(pose(0.4), 1000).state, 'suspected')
  assert.equal(monitor.update(pose(0.4), 10999).alarm, false)
  assert.equal(monitor.update(pose(0.4), 11000).alarm, true)
  assert.equal(monitor.update(pose(0.4), 12000).alarm, false)
})

test('brief normal posture only resets suspicion after recovery window', () => {
  const monitor = new DrowsinessMonitor({ calibrationSamples: 1, recoveryMs: 500 })
  monitor.update(pose(0.2), 0)
  monitor.update(pose(0.4), 1000)
  assert.equal(monitor.update(pose(0.2), 1200).state, 'suspected')
  assert.equal(monitor.update(pose(0.2), 1700).state, 'awake')
})

test('wake quiz has three questions and only all correct answers pass', () => {
  const quiz = createWakeQuiz(() => 0)
  assert.equal(quiz.length, 3)
  const answers = Object.fromEntries(quiz.map((question) => [question.id, question.answer]))
  assert.equal(checkWakeQuiz(quiz, answers), true)
  answers['math-add'] = 'wrong'
  assert.equal(checkWakeQuiz(quiz, answers), false)
})
