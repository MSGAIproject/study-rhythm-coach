import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizedScores, scoreGap } from '../src/examScores.js'

test('grades and percentiles improve in opposite directions, missing is not zero', () => {
  assert.equal(scoreGap(4, 2, 'grade'), 2)
  assert.equal(scoreGap(2, 4, 'grade'), 0)
  assert.equal(scoreGap(67.5, 85, 'percentile'), 17.5)
  assert.equal(scoreGap(0, 85, 'percentile'), 85)
  assert.equal(scoreGap(null, 2, 'grade'), null)
  assert.equal(scoreGap('', 2, 'grade'), null)
  assert.equal(scoreGap(3, null, 'grade'), null)
})

test('blank fields stay missing and zero raw scores are retained', () => {
  const result = normalizedScores({'국어': {grade:'3', raw:'0', percentile:''}, '수학': {grade:''}})
  assert.equal(result.국어.raw, 0)
  assert.equal(result.국어.grade, 3)
  assert.equal(result.국어.percentile, null)
  assert.equal(result.수학, undefined)
})
