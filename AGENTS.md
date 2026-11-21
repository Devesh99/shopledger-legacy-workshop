# ShopLedger

ShopLedger is an internal wholesale and retail billing app with inventory tracking, GST invoices, and khata (customer credit). It runs on Node.js with Express 4 and body-parser. The browser UI uses plain HTML, CSS, and JavaScript. The app reads and writes a local JSON file.

## Module map

- `server.js` serves the browser UI, mounts the API under `/api`, and serves printable HTML invoices.
- `public/` contains the billing desk, order register, khata desk, and stock and GST reconciliation views.
- `routes/products.js` lists products and coupons. `routes/orders.js` lists, retrieves, creates, and cancels orders. `routes/customers.js` lists customer accounts and records settlements. `routes/reports.js` handles cart pricing preview, reports, and database export.
- `lib/orders.js`, `lib/inventory.js`, and `lib/ledger.js` handle order records, stock, and khata balances.
- `lib/pricing.js`, `lib/coupons.js`, and `lib/tax.js` calculate checkout totals. `lib/invoice.js` computes and renders printable invoices. `lib/reports.js` builds dashboard and reconciliation figures.
- `lib/store.js` reads and writes `data/db.json` and appends audit entries. `lib/dates.js` handles date formatting and normalization. `config.js` holds the port, shop details, and tax, inventory, and coupon settings.

## Commands

- `npm start` runs `node server.js`. The default port is 3000. Set `PORT` to override it.
- `npm test` currently prints `Error: no test specified` and exits with status 1.

## Rules

- Write characterization tests before changing behavior.
- Change only the module the ticket is about.
- Tests must never read or write `data/db.json`.
- Add no dependencies.
