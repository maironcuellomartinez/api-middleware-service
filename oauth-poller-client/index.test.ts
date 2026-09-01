import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWindow, pickDay, MIN_VALID_DATE } from './index';

const FLOOR = MIN_VALID_DATE.toISOString(); // '2026-07-16T08:00:00.000Z'
const FLOOR_DAY = new Date(Date.UTC(2026, 6, 16)); // 2026-07-16T00:00:00.000Z

test('buildWindow: el dia del corte arranca en MIN_VALID_DATE, no en 00:00', () => {
    const w = buildWindow(FLOOR_DAY);

    assert.equal(w.dateFrom, FLOOR);
    assert.equal(w.dateTo, '2026-07-16T23:59:59.999Z');
});

test('buildWindow: un dia posterior al del corte usa 00:00 a 23:59:59.999', () => {
    const day = new Date('2026-08-20T00:00:00.000Z');
    const w = buildWindow(day);

    assert.equal(w.dateFrom, '2026-08-20T00:00:00.000Z');
    assert.equal(w.dateTo, '2026-08-20T23:59:59.999Z');
});

test('pickDay: tickIndex=0 siempre arranca en el dia del corte', () => {
    const now = new Date('2026-09-01T12:00:00.000Z');
    const day = pickDay(now, 0);

    assert.equal(day.toISOString(), FLOOR_DAY.toISOString());
});

test('pickDay: cada tickIndex sucesivo avanza un dia calendario distinto', () => {
    const now = new Date('2026-09-01T12:00:00.000Z');

    const day0 = pickDay(now, 0);
    const day1 = pickDay(now, 1);
    const day2 = pickDay(now, 2);

    assert.equal(day1.getTime() - day0.getTime(), 24 * 60 * 60 * 1000);
    assert.equal(day2.getTime() - day1.getTime(), 24 * 60 * 60 * 1000);
});

test('pickDay: nunca devuelve un dia posterior a "now"', () => {
    const now = new Date('2026-07-20T12:00:00.000Z'); // 4 dias despues del corte
    for (let tick = 0; tick < 20; tick++) {
        const day = pickDay(now, tick);
        assert.ok(
            day.getTime() <= new Date('2026-07-20T00:00:00.000Z').getTime(),
            `dia=${day.toISOString()} no debe ser posterior a "now" (tick=${tick})`,
        );
    }
});

test('pickDay: da la vuelta al llegar a "hoy" y vuelve a empezar en el corte', () => {
    const now = new Date('2026-07-19T12:00:00.000Z'); // 3 dias despues del corte -> 4 dias posibles (16,17,18,19)
    const days = [0, 1, 2, 3, 4, 5].map((tick) => pickDay(now, tick).toISOString().slice(0, 10));

    assert.deepEqual(days, ['2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-16', '2026-07-17']);
});

test('reloj del sistema atrasado respecto al piso: pickDay siempre devuelve el dia del corte', () => {
    const now = new Date('2026-01-01T00:00:00.000Z'); // antes de MIN_VALID_DATE
    for (const tick of [0, 1, 5]) {
        assert.equal(pickDay(now, tick).toISOString(), FLOOR_DAY.toISOString());
    }
});
