const assert = require('node:assert/strict');
const test = require('node:test');
const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');

function billedOrder(items, coupon = '') {
  const { subtotal, discount, tax, total } = pricing.computeTotals(items, coupon);
  return { id: 1, date: '21/11/2026', items, coupon, subtotal, discount, tax, total };
}

function mixedRateItems() {
  return [
    { id: 1, name: 'Rice', hsn: '1006', price: 500, qty: 2 },
    { id: 2, name: 'Ghee', hsn: '0405', price: 1000, qty: 1 }
  ];
}

test('invoice matches the persisted bill and its discounted GST breakdown', () => {
  const order = billedOrder(mixedRateItems(), 'SAVE10');
  const figures = invoice.computeInvoiceFigures(order);
  assert.equal(figures.total, 2007.25);
  assert.equal(figures.discount, 150);
  assert.equal(figures.tax, 157.25);
  assert.equal(figures.cgst, 78.63);
  assert.equal(figures.sgst, 78.62);
  assert.deepEqual(
    figures.rows.map(({ gstPercent, lineTax }) => ({ gstPercent, lineTax })),
    [{ gstPercent: 5, lineTax: 46.25 }, { gstPercent: 12, lineTax: 111 }]
  );
});

test('checkout caps SAVE10, apportions it by line, and taxes discounted amounts by HSN', () => {
  const { lines, ...totals } = pricing.computeTotals(mixedRateItems(), 'SAVE10');
  assert.deepEqual(totals, {
    subtotal: 2000, discount: 150, taxable: 1850,
    tax: 157.25, cgst: 78.63, sgst: 78.62, total: 2007.25
  });
  assert.deepEqual(
    lines.map(({ gstPercent, discount, taxable, tax }) => ({ gstPercent, discount, taxable, tax })),
    [
      { gstPercent: 5, discount: 75, taxable: 925, tax: 46.25 },
      { gstPercent: 12, discount: 75, taxable: 925, tax: 111 }
    ]
  );
});

test('printed invoice shows the billed total and discounted GST', () => {
  const order = billedOrder(mixedRateItems(), 'SAVE10');
  const html = invoice.render(order);
  assert.match(html, /<td class="r">5%<\/td><td class="r">₹46\.25<\/td>/);
  assert.match(html, /<td class="r">12%<\/td><td class="r">₹111\.00<\/td>/);
  assert.match(html, /CGST \+ SGST \(Total GST\)<\/td><td class="r">₹157\.25/);
  assert.match(html, /Invoice Total<\/td><td class="r">₹2007\.25/);
  assert.doesNotMatch(html, /Adjustment to recorded GST/);
});

test('invoice and checkout agree for a coupon-free line with an explicit whole-percent rate', () => {
  const order = billedOrder([{ name: 'Rice', price: 100, qty: 1, gstRate: 5 }]);
  const figures = invoice.computeInvoiceFigures(order);
  assert.equal(order.total, 105);
  assert.equal(figures.total, 105);
  assert.equal(figures.tax, 5);
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.doesNotMatch(invoice.render(order), /Adjustment to recorded GST/);
});

test('invoice applies explicit zero and fractional rates the same way as checkout', () => {
  for (const { gstRate, billedTax } of [
    { gstRate: 0, billedTax: 0 },
    { gstRate: 0.05, billedTax: 5 }
  ]) {
    const order = billedOrder([{ name: 'Item', price: 100, qty: 1, gstRate }]);
    assert.equal(order.tax, billedTax);
    assert.equal(invoice.computeInvoiceFigures(order).rows[0].lineTax, billedTax);
  }
});

test('invoice preserves a recorded zero discount even for a currently eligible coupon', () => {
  const items = [{ name: 'Item', price: 100, qty: 1 }];
  const order = { ...billedOrder(items), coupon: 'WELCOME' };
  assert.equal(pricing.computeTotals(items, order.coupon).discount, 5);
  const figures = invoice.computeInvoiceFigures(order);
  assert.equal(figures.discount, 0);
  assert.equal(figures.rows[0].lineTax, 18);
  assert.equal(figures.total, 118);
});

test('invoice sums rounded line GST the same way as checkout', () => {
  const order = billedOrder([
    { name: 'First item', price: 0.03, qty: 1 },
    { name: 'Second item', price: 0.03, qty: 1 }
  ]);
  const figures = invoice.computeInvoiceFigures(order);
  assert.equal(order.tax, 0.02);
  assert.equal(order.total, 0.08);
  assert.deepEqual(figures.rows.map(({ lineTax }) => lineTax), [0.01, 0.01]);
  assert.equal(figures.tax, 0.02);
  assert.equal(figures.total, 0.08);
});

test('reconciliation flags historical GST differences and the invoice explains both adjustments', () => {
  const mixedRate = billedOrder(mixedRateItems(), 'SAVE10');
  const matching = billedOrder([{ name: 'Tea', price: 100, qty: 1, hsn: '0902' }]);
  const taxOnly = { ...matching, id: 3, tax: 17 };
  const report = reports.getGstReconciliation({
    orders: [mixedRate, { ...matching, id: 2 }, taxOnly, { ...mixedRate, id: 4, status: 'cancelled' }]
  });

  assert.equal(report.totalChecked, 3);
  assert.equal(report.mismatchCount, 1);
  assert.equal(report.totalDelta, 0);
  assert.deepEqual(
    report.rows.map(({ orderId, ledgerTax, invoiceTax, delta, matched }) =>
      ({ orderId, ledgerTax, invoiceTax, delta, matched })),
    [
      { orderId: 1, ledgerTax: 157.25, invoiceTax: 157.25, delta: 0, matched: true },
      { orderId: 2, ledgerTax: 18, invoiceTax: 18, delta: 0, matched: true },
      { orderId: 3, ledgerTax: 17, invoiceTax: 18, delta: 0, matched: false }
    ]
  );
  const historicalInvoice = invoice.computeInvoiceFigures(taxOnly);
  assert.equal(historicalInvoice.rows[0].lineTax, 18);
  assert.equal(historicalInvoice.taxAdjustment, -1);
  assert.equal(historicalInvoice.totalAdjustment, 1);
  assert.match(invoice.render(taxOnly), /Adjustment to recorded GST<\/td><td class="r">-₹1\.00/);
  assert.match(invoice.render(taxOnly), /Adjustment to recorded total<\/td><td class="r">₹1\.00/);
});

test('reconciliation flags a recorded subtotal that differs from the invoice lines', () => {
  const order = {
    ...billedOrder([{ name: 'Tea', price: 100, qty: 1, hsn: '0902' }]),
    subtotal: 101,
    total: 119
  };
  const figures = invoice.computeInvoiceFigures(order);
  assert.equal(figures.rows[0].line, 100);
  assert.equal(figures.subtotal, 101);
  assert.equal(figures.total, 119);
  assert.match(invoice.render(order), /Adjustment to recorded subtotal<\/td><td class="r">₹1\.00/);
  const report = reports.getGstReconciliation({ orders: [order] });
  assert.equal(report.rows[0].matched, false);
  assert.equal(report.rows[0].delta, -1);
});
