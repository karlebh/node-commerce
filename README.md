# Ecommerce API

An Express and TypeScript ecommerce API with a Laravel-inspired structure. The first domain slice contains users and products only.

## Setup

1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Run `npm run db:generate`.
4. Run `npm run db:migrate -- --name init`.
5. Run `npm run dev`.

Run tests with `npm test` and compile with `npm run build`.

## Endpoints

- `POST /api/users/register`
- `POST /api/users/login`
- `GET /api/users/me` with a Bearer token
- `GET /api/products?page=1&perPage=12&search=shoe`
- `GET /api/products/:slug`
- `POST /api/products` with a Bearer token
- `PATCH /api/products/:id` with a Bearer token
- `DELETE /api/products/:id` with a Bearer token (soft delete)

Prices are stored as integer minor units, for example `1999` means $19.99. Product write routes are authenticated; add roles/permissions when an admin domain is introduced.
