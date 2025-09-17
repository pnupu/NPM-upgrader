# React Router v5 Demo App

This demo intentionally uses React Router v5-only patterns that break in v6:

- Switch + exact
- Redirect (from/to)
- Route component and render props
- useHistory + history.push/goBack
- withRouter HOC
- ProtectedRoute using render + Redirect

## Scripts

- `pnpm install` or `npm install`
- `npm run dev` – start Vite dev server
- `npm run typecheck` – run TypeScript (no emit)
- `npm test` – run Jest + RTL tests

## Structure

See `src/App.tsx`, `src/components/ProtectedRoute.tsx`, and `tests/app.spec.tsx` for the v5 patterns and acceptance tests.


