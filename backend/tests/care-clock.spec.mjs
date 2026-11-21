import {test} from 'node:test';import assert from 'node:assert/strict';
import {careClock} from '../care-clock.mjs';import {careShiftState} from '../care-shifts.mjs';
test('the same instant follows the care location rather than the viewing device zone',()=>{
 const now=new Date('2026-11-21T12:00:00Z');
 assert.equal(careClock(now,'America/Mexico_City'),'2026-11-21T06:00');
 assert.equal(careClock(now,'America/Tijuana'),'2026-11-21T04:00');
 assert.match(careShiftState({start_local:'2026-11-21T00:00',end_local:'2026-11-21T05:00',care_zone:'America/Mexico_City'},now),/cierre pendiente/);
 assert.equal(careShiftState({start_local:'2026-11-21T00:00',end_local:'2026-11-21T05:00',care_zone:'America/Tijuana'},now),'En horario');
 assert.throws(()=>careClock(now,'not-a-zone'));
});
