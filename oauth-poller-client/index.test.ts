import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWindow, MIN_VALID_DATE } from './index';

const FLOOR = MIN_VALID_DATE.toISOString(); // '2026-07-16T08:00:00.000Z'

test('caso normal: dateFrom = ahora - N dias, dateTo = fin del dia actual', () => {
    const now = new Date('2026-09-01T10:00:00.000Z');
    const w = buildWindow(1, now); // 1 dia atras

    assert.equal(w.dateFrom, '2026-08-31T10:00:00.000Z');
    assert.equal(w.dateTo, '2026-09-01T23:59:59.999Z');
});

test('ventana grande que cruzaria el piso: dateFrom se recorta al piso', () => {
    // "now" esta 1 hora despues del piso, pero la ventana pide 60 dias atras
    const now = new Date('2026-07-16T09:00:00.000Z');
    const w = buildWindow(60, now);

    assert.equal(w.dateFrom, FLOOR);
    assert.equal(w.dateTo, '2026-07-16T23:59:59.999Z'); // fin del dia de "now"
    assert.ok(w.dateFrom <= w.dateTo, 'dateFrom nunca debe ser posterior a dateTo');
});

test('reloj del sistema atrasado respecto al piso: dateFrom colapsa al piso, dateTo es fin del dia del piso', () => {
    const now = new Date('2026-01-01T00:00:00.000Z'); // antes de MIN_VALID_DATE
    const w = buildWindow(1, now);

    assert.equal(w.dateFrom, FLOOR);
    assert.equal(w.dateTo, '2026-07-16T23:59:59.999Z');
});

test('dateFrom nunca es anterior a MIN_VALID_DATE en un barrido de ventanas', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const daysBackSamples = [0, 1, 7, 30, 365];

    for (const daysBack of daysBackSamples) {
        const w = buildWindow(daysBack, now);
        assert.ok(
            w.dateFrom >= FLOOR,
            `dateFrom=${w.dateFrom} no debe ser menor al piso ${FLOOR} (daysBack=${daysBack})`,
        );
    }
});

test('dateTo siempre es el fin del dia de "now", sin importar daysBack', () => {
    const now = new Date('2026-09-01T15:00:00.000Z');
    for (const daysBack of [0, 1, 7, 30]) {
        const w = buildWindow(daysBack, now);
        assert.equal(w.dateTo, '2026-09-01T23:59:59.999Z');
    }
});

test('daysBack=0: dateFrom queda en el mismo dia que dateTo', () => {
    const now = new Date('2026-09-01T15:00:00.000Z');
    const w = buildWindow(0, now);

    assert.equal(w.dateFrom, now.toISOString());
    assert.equal(w.dateFrom.slice(0, 10), w.dateTo.slice(0, 10));
});

test('daysBack>=1: dateFrom queda en un dia anterior a dateTo', () => {
    const now = new Date('2026-09-05T15:00:00.000Z');
    const w = buildWindow(3, now);

    assert.equal(w.dateFrom, '2026-09-02T15:00:00.000Z');
    assert.equal(w.dateTo, '2026-09-05T23:59:59.999Z');
    assert.notEqual(w.dateFrom.slice(0, 10), w.dateTo.slice(0, 10));
});
