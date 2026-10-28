# Ecommerce API

An Express and TypeScript API for an ecommerce application, built with Prisma. It provides JWT-based authentication, account and password management, and endpoints for managing products, categories, image uploads and lots more.

## Setup

1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Run `npm run db:generate`.
4. Run `npm run db:migrate -- --name init`.
5. Run `npm run dev`.

Run tests with `npm test` and compile with `npm run build`.

To seed 20 sample users, run `npm run db:seed:users`. All seeded users share the password `Password123!`, and rerunning the command does not create duplicates.

To seed 200 sample products across 12 categories, first register a user, then run `npm run db:seed`. The command can be rerun safely without creating duplicate sample products.

After pulling database migration changes, apply pending migrations with `npm run db:deploy` before starting the API.
