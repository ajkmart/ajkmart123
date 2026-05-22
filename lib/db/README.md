# @workspace/db

PostgreSQL database layer for AJKMart, built with **Drizzle ORM**. Provides the shared schema, typed query client, and migration tooling used by the API server.

## Overview

- **Database**: PostgreSQL (Neon serverless in production)
- **ORM**: Drizzle ORM with full TypeScript inference
- **Tables**: 105+ tables covering all platform domains
- **Migrations**: Drizzle Kit (`drizzle-kit push` for dev, `drizzle-kit generate` + `migrate` for production)

## Setup

Set `DATABASE_URL` in your environment before running any DB commands:

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

Then push the schema to your database:

```bash
pnpm --filter @workspace/db run db:push
```

## Schema Structure

All table definitions live in `lib/db/src/schema/`, one file per table:

```
lib/db/src/schema/
├── users.ts               # Core user accounts
├── orders.ts              # Customer orders
├── rides.ts               # Ride-hailing bookings
├── wallet_transactions.ts # Digital wallet ledger
├── products.ts            # Product catalogue
├── ...                    # 100+ more tables
└── index.ts               # Barrel re-export
```

Import tables and the query client from the package root:

```ts
import { db, usersTable } from "@workspace/db";
import { ordersTable, ridesTable } from "@workspace/db/schema";
```

## Migration Workflow

| Command | When to use |
|---|---|
| `pnpm --filter @workspace/db run db:push` | Dev — apply schema changes instantly, no SQL file |
| `pnpm --filter @workspace/db run db:generate` | Production — generate a versioned SQL migration file |
| `pnpm --filter @workspace/db run db:migrate` | Production — run pending migration files against the DB |
| `pnpm --filter @workspace/db run db:studio` | Open Drizzle Studio (visual DB browser) |

## Usage Example

```ts
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const user = await db
  .select()
  .from(usersTable)
  .where(eq(usersTable.id, userId))
  .limit(1);
```

## Table Categories

| Category | Tables | Key tables |
|---|---|---|
| **Auth** | 15+ | `users`, `auth_audit_log`, `otp_tokens`, `refresh_tokens`, `magic_link_tokens` |
| **Commerce** | 20+ | `products`, `orders`, `order_items`, `cart_snapshots`, `categories`, `flash_deals` |
| **Rides** | 10+ | `rides`, `ride_bids`, `live_locations`, `location_history`, `parcel_bookings` |
| **Wallet** | 8+ | `wallet_transactions`, `pending_withdrawals`, `payout_rules` |
| **Admin** | 12+ | `admin_accounts`, `admin_sessions`, `admin_action_audit_log`, `admin_role_presets` |
| **Content** | 10+ | `banners`, `faqs`, `promotions`, `popular_locations`, `campaigns` |
| **KYC/Compliance** | 8+ | `kyc_verifications`, `consent_log`, `data_export_logs`, `error_reports` |

## Foreign Key Conventions

- **`onDelete: "cascade"`** — used for owned data (e.g. a user's orders, sessions, wallet entries). Deleting the parent removes all children automatically.
- **`onDelete: "set null"`** — used for optional references (e.g. a product's vendor). Deleting the vendor nullifies the FK but keeps the product row.
- All `userId` columns reference `usersTable.id` with `onDelete: "cascade"` unless otherwise noted.
