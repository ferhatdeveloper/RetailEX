/**
 * Sepet genel indirimini satır tutarlarına oransal böler.
 * Restoran `closeBill` → `addSale` ile uyum: fatura başlığı + satır netleri raporlarla örtüşür.
 */
export function splitProportionalLineDiscount(
    lineGrosses: number[],
    headerDiscount: number,
): { discount: number; total: number }[] {
    const n = lineGrosses.length;
    const subtotal = lineGrosses.reduce((a, b) => a + b, 0);
    if (n === 0 || subtotal <= 0 || headerDiscount <= 0) {
        return lineGrosses.map((g) => ({ discount: 0, total: g }));
    }
    let allocated = 0;
    return lineGrosses.map((lineGross, idx) => {
        let lineDisc: number;
        if (idx === n - 1) {
            lineDisc = Math.max(0, headerDiscount - allocated);
        } else {
            lineDisc = Math.round(((headerDiscount * lineGross) / subtotal) * 100) / 100;
            allocated += lineDisc;
        }
        return {
            discount: lineDisc,
            total: Math.max(0, lineGross - lineDisc),
        };
    });
}
