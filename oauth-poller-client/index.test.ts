import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWindow, buildDailyRanges, buildSameDayRanges, MIN_VALID_DATE } from './index';

const FLOOR = MIN_VALID_DATE.toISOString(); // '2026-07-16T08:00:00.000Z'

test('caso normal: la ventana queda totalmente despues del piso', () => {
    const now = new Date('2026-09-01T10:00:00.000Z');
    const w = buildWindow(5, now); // 5 minutos atras

    assert.equal(w.dateFrom, '2026-09-01T09:55:00.000Z');
    assert.equal(w.dateTo, '2026-09-01T10:00:00.000Z');
});

test('ventana grande que cruzaria el piso: dateFrom se recorta al piso', () => {
    // "now" esta 1 hora despues del piso, pero la ventana pide 5 dias atras
    const now = new Date('2026-07-16T09:00:00.000Z');
    const w = buildWindow(5 * 24 * 60, now);

    assert.equal(w.dateFrom, FLOOR);
    assert.equal(w.dateTo, now.toISOString());
    assert.ok(w.dateFrom <= w.dateTo, 'dateFrom nunca debe ser posterior a dateTo');
});

test('reloj del sistema atrasado respecto al piso: toda la ventana colapsa al piso', () => {
    const now = new Date('2026-01-01T00:00:00.000Z'); // antes de MIN_VALID_DATE
    const w = buildWindow(10, now);

    assert.equal(w.dateFrom, FLOOR);
    assert.equal(w.dateTo, FLOOR);
});

test('dateFrom nunca es anterior a MIN_VALID_DATE en un barrido de ventanas', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const minutesBackSamples = [0, 1, 60, 60 * 24, 60 * 24 * 10, 60 * 24 * 365];

    for (const minutesBack of minutesBackSamples) {
        const w = buildWindow(minutesBack, now);
        assert.ok(
            w.dateFrom >= FLOOR,
            `dateFrom=${w.dateFrom} no debe ser menor al piso ${FLOOR} (minutesBack=${minutesBack})`,
        );
    }
});

test('buildDailyRanges: un rango por dia, del piso hasta "to", ultimo recortado', () => {
    const to = new Date('2026-07-19T05:00:00.000Z'); // ~3 dias despues del piso
    const ranges = buildDailyRanges(MIN_VALID_DATE, to);

    assert.equal(ranges.length, 3);
    assert.equal(ranges[0]!.dateFrom, FLOOR);
    assert.equal(ranges[0]!.dateTo, ranges[1]!.dateFrom);
    assert.equal(ranges[1]!.dateTo, ranges[2]!.dateFrom);
    assert.equal(ranges[2]!.dateTo, to.toISOString()); // el ultimo se recorta a "to", no completa 24h
    for (const r of ranges) {
        assert.ok(r.dateFrom < r.dateTo, `rango invalido: ${r.dateFrom} >= ${r.dateTo}`);
        assert.ok(r.dateFrom >= FLOOR, `dateFrom=${r.dateFrom} no debe ser menor al piso`);
    }
});

test('buildDailyRanges: "from" anterior al piso se recorta al piso', () => {
    const from = new Date('2020-01-01T00:00:00.000Z'); // muy anterior al piso
    const to = new Date('2026-07-17T08:00:00.000Z'); // 1 dia despues del piso
    const ranges = buildDailyRanges(from, to);

    assert.equal(ranges[0]!.dateFrom, FLOOR);
});

test('buildDailyRanges: "to" antes o igual que el piso no genera rangos', () => {
    const ranges = buildDailyRanges(MIN_VALID_DATE, MIN_VALID_DATE);
    assert.equal(ranges.length, 0);
});

test('buildSameDayRanges: antes del mediodia solo devuelve el rango completo del dia', () => {
    const now = new Date('2026-09-01T05:00:00.000Z'); // antes de las 12:00 UTC
    const ranges = buildSameDayRanges(now);

    assert.equal(ranges.length, 1);
    assert.equal(ranges[0]!.window.dateFrom, '2026-09-01T00:00:00.000Z');
    assert.equal(ranges[0]!.window.dateTo, now.toISOString());
});

test('buildSameDayRanges: despues del mediodia agrega manana/tarde, todo dentro del mismo dia', () => {
    const now = new Date('2026-09-01T15:00:00.000Z'); // despues de las 12:00 UTC
    const ranges = buildSameDayRanges(now);

    assert.equal(ranges.length, 3);
    for (const { window } of ranges) {
        assert.equal(window.dateFrom.slice(0, 10), '2026-09-01');
        assert.equal(window.dateTo.slice(0, 10), '2026-09-01'); // mismo dia, no cruza a otro
    }
});

test('buildSameDayRanges: "hoy" nunca queda antes del piso', () => {
    const now = new Date('2026-07-16T09:00:00.000Z'); // 1 hora despues del piso, mismo dia
    const ranges = buildSameDayRanges(now);

    for (const { window } of ranges) {
        assert.ok(window.dateFrom >= FLOOR, `dateFrom=${window.dateFrom} no debe ser menor al piso`);
    }
});
