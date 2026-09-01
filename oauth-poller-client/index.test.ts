import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWindow, MIN_VALID_DATE } from './index';

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

test('ventana combinada: puede caer dentro del mismo dia', () => {
    // 15:00 UTC, 5 minutos atras -> mismo dia (2026-09-01)
    const now = new Date('2026-09-01T15:00:00.000Z');
    const w = buildWindow(5, now);

    assert.equal(w.dateFrom.slice(0, 10), '2026-09-01');
    assert.equal(w.dateTo.slice(0, 10), '2026-09-01');
});

test('ventana combinada: puede cruzar la medianoche hacia el dia anterior', () => {
    // 00:02 UTC, 5 minutos atras -> arranca 23:57 del dia anterior
    const now = new Date('2026-09-02T00:02:00.000Z');
    const w = buildWindow(5, now);

    assert.equal(w.dateFrom, '2026-09-01T23:57:00.000Z');
    assert.equal(w.dateTo, '2026-09-02T00:02:00.000Z');
    assert.notEqual(w.dateFrom.slice(0, 10), w.dateTo.slice(0, 10), 'debe cruzar a un dia distinto');
});
