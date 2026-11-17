import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWord, scheduleReview, validateBackup, safeUrl} from '../extension/core.js';

test('normalizes selected words without accepting phrases or URLs', () => {
  assert.equal(normalizeWord(' “Remember!” '), 'remember');
  assert.equal(normalizeWord('well-being'), 'well-being');
  assert.equal(normalizeWord('don’t'), "don't");
  for (const input of ['two words', 'https://evil.test', '123', '', '<img>', 'x'.repeat(81)])
    assert.throws(() => normalizeWord(input));
});

test('remembered grades progress on exact day intervals', () => {
  let record = {word:'remember', repetitions:0};
  for (const [index, days] of [1,3,7,14,30,60,60].entries()) {
    record = scheduleReview(record, 'remembered', 1000);
    assert.equal(record.dueAt, 1000 + days * 86400000);
    assert.equal(record.repetitions, index+1);
  }
});

test('forgotten resets streak and unsure preserves it', () => {
  const r = {word:'remember', repetitions:3};
  assert.equal(scheduleReview(r,'forgotten',1000).dueAt,601000);
  assert.equal(scheduleReview(r,'forgotten',1000).repetitions,0);
  assert.equal(scheduleReview(r,'unsure',1000).dueAt,86401000);
  assert.equal(scheduleReview(r,'unsure',1000).repetitions,3);
  assert.throws(() => scheduleReview(r,'invalid',1000));
  assert.equal(r.repetitions,3);
});

test('backups reject malformed records before import', () => {
  const r = {word:'remember',lookup:{word:'remember',meanings:[]},context:{sentence:'Remember this.'},note:'',translation:'记住',repetitions:0,intervalDays:0,dueAt:1000,createdAt:1000,lastReviewedAt:null};
  assert.equal(validateBackup({version:1,words:[r]})[0].translation,'记住');
  for (const data of [{version:2,words:[r]},{version:1,words:[{...r,dueAt:'soon'}]},{version:1,words:[{...r,repetitions:-1}]},{version:1,words:[{...r,lookup:{meanings:'bad'}}]},{version:1,words:Array(5001).fill(r)}])
    assert.throws(() => validateBackup(data));
});

test('unsafe and non-HTTP URLs never become external links', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,test'), '');
  assert.equal(safeUrl('https://en.wiktionary.org/wiki/remember'),'https://en.wiktionary.org/wiki/remember');
});

test('backup retains the latest grade for a reviewed word',()=>{
 const base={word:'remember',lookup:{word:'remember',meanings:[]},context:{},note:'',translation:'记住',repetitions:0,intervalDays:0,dueAt:1000,createdAt:1000,lastReviewedAt:null};
 const reviewed=scheduleReview(base,'forgotten',2000);
 assert.equal(reviewed.lastGrade,'forgotten');
 assert.equal(validateBackup({version:1,words:[reviewed]})[0].lastGrade,'forgotten');
});
