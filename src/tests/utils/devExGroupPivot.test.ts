import { describe, expect, it } from 'vitest';
import { aggregateDevExGroupPivot, toDevExPivotChartPoints } from '../../utils/devExGroupPivot';

describe('devExGroupPivot', () => {
  it('gruplara göre adet ve metrik toplar', () => {
    const rows = [
      { cat: 'A', qty: 2, amt: 10 },
      { cat: 'A', qty: 3, amt: 20 },
      { cat: 'B', qty: 1, amt: 5 },
    ];
    const pivot = aggregateDevExGroupPivot(
      rows,
      (r) => r.cat,
      [
        { id: 'qty', getValue: (r) => r.qty },
        { id: 'amt', getValue: (r) => r.amt },
      ],
    );
    expect(pivot).toHaveLength(2);
    const a = pivot.find((p) => p.label === 'A');
    const b = pivot.find((p) => p.label === 'B');
    expect(a?.count).toBe(2);
    expect(a?.values.qty).toBe(5);
    expect(a?.values.amt).toBe(30);
    expect(b?.count).toBe(1);
    expect(b?.values.qty).toBe(1);
  });

  it('grafik noktalarına name/count yazar', () => {
    const points = toDevExPivotChartPoints([
      { key: 'X', label: 'X', count: 2, values: { qty: 4 } },
    ]);
    expect(points[0]).toMatchObject({ name: 'X', count: 2, qty: 4 });
  });
});
