# Bun.sql - Unified SQL API

Bun provides native SQL bindings supporting PostgreSQL, MySQL/MariaDB, and SQLite with a unified Promise-based API using tagged template literals. Zero external dependencies required.

## Table of Contents
- [Connection Setup](#connection-setup)
- [Tagged Template Queries](#tagged-template-queries)
- [Data Operations](#data-operations)
- [Transactions](#transactions)
- [Prepared Statements](#prepared-statements)
- [Bulk Operations](#bulk-operations)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)

---

## Connection Setup

### URL String Format

```typescript
import { sql, SQL } from "bun";

// PostgreSQL (default) - uses DATABASE_URL or POSTGRES_URL env var
const users = await sql`SELECT * FROM users`;

// Explicit PostgreSQL connection
const pg = new SQL("postgres://user:pass@localhost:5432/mydb");

// MySQL/MariaDB
const mysql = new SQL("mysql://user:pass@localhost:3306/mydb");
const mysql2 = new SQL("mysql2://user:pass@localhost:3306/mydb"); // mysql2 protocol works

// SQLite file-based
const sqlite = new SQL("sqlite://./data.db");

// SQLite in-memory
const memory = new SQL(":memory:");
const memory2 = new SQL("sqlite://:memory:");
```

### Configuration Object

```typescript
import { SQL } from "bun";

// PostgreSQL
const pg = new SQL({
  adapter: "postgres",
  hostname: "localhost",
  port: 5432,
  database: "myapp",
  username: "user",
  password: "secret",
  max: 20,           // Pool size
  idleTimeout: 30,   // Seconds before idle connection closes
  maxLifetime: 3600, // Max connection lifetime in seconds
  tls: true,         // Enable TLS
  bigint: true,      // Return BigInt for large integers
  prepare: true      // Use prepared statements (default)
});

// MySQL
const mysql = new SQL({
  adapter: "mysql",
  hostname: "localhost",
  port: 3306,
  database: "myapp",
  username: "dbuser",
  password: "secretpass"
});

// SQLite (requires explicit adapter for simple filenames)
const sqlite = new SQL({
  adapter: "sqlite",
  filename: "./data/app.db"
});

// Simple filename requires adapter specification
const db = new SQL("myapp.db", { adapter: "sqlite" });
```

### Environment Variables

Bun auto-detects connection from environment:

| Variable | Database |
|----------|----------|
| `DATABASE_URL` | Any (auto-detect) |
| `POSTGRES_URL`, `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | PostgreSQL |
| `MYSQL_URL`, `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` | MySQL |

---

## Tagged Template Queries

Tagged template literals provide safe parameter binding and prevent SQL injection. All values are automatically escaped and use prepared statements.

### Basic Queries

```typescript
import { sql } from "bun";

// Safe parameter binding - prevents SQL injection
const userId = 5;
const active = true;

const users = await sql`
  SELECT * FROM users
  WHERE id = ${userId}
  AND active = ${active}
  LIMIT ${10}
`;
// Returns: [{ id: 5, name: "Alice", email: "[email protected]", active: true }]

// Single row destructuring
const [user] = await sql`SELECT * FROM users WHERE id = ${id}`;
if (!user) throw new Error("Not found");
```

### Result Formats

```typescript
// Default: array of objects
const users = await sql`SELECT * FROM users`;

// Array of arrays (values only)
const rows = await sql`SELECT id, name FROM users`.values();
// [[1, "Alice"], [2, "Bob"]]

// Raw query (no prepared statement)
const raw = await sql`SELECT data FROM files`.raw();
```

### Dynamic Queries

```typescript
// Dynamic table/column names (use sql() helper)
const table = "users";
const column = "email";
await sql`SELECT * FROM ${sql(table)} WHERE ${sql(column)} = ${value}`;

// Dynamic IN clause
const ids = [1, 2, 3];
await sql`SELECT * FROM users WHERE id IN ${sql(ids)}`;

// Dynamic columns selection
const columns = ["id", "name", "email"];
await sql`SELECT ${sql(columns)} FROM users`;
```

---

## Data Operations

### INSERT

```typescript
// Single insert with RETURNING
const [user] = await sql`
  INSERT INTO users (name, email)
  VALUES (${"Alice"}, ${"[email protected]"})
  RETURNING *
`;

// Using object helper for cleaner syntax
const userData = { name: "Alice", email: "[email protected]" };
const [newUser] = await sql`
  INSERT INTO users ${sql(userData)}
  RETURNING *
`;

// Picking specific columns to insert
const userWithAge = { name: "Alice", email: "[email protected]", age: 25 };
await sql`INSERT INTO users ${sql(userWithAge, "name", "email")}`;
```

### UPDATE

```typescript
const [updated] = await sql`
  UPDATE users
  SET name = ${"Alice Smith"}, updated_at = NOW()
  WHERE id = ${userId}
  RETURNING *
`;
```

### DELETE

```typescript
await sql`DELETE FROM users WHERE id = ${userId}`;

// With RETURNING
const [deleted] = await sql`
  DELETE FROM users WHERE id = ${userId} RETURNING *
`;
```

---

## Transactions

### Basic Transaction with sql.begin

```typescript
// BEGIN is sent automatically, COMMIT on success, ROLLBACK on error
await sql.begin(async (tx) => {
  const [user] = await tx`
    INSERT INTO users (name) VALUES (${"Alice"}) RETURNING *
  `;

  await tx`
    INSERT INTO accounts (user_id, balance) VALUES (${user.id}, ${100})
  `;

  // Automatically commits if no error thrown
});
```

### Savepoints

Savepoints create intermediate checkpoints within a transaction for partial rollbacks.

```typescript
await sql.begin(async (tx) => {
  await tx`UPDATE accounts SET balance = balance - 100 WHERE id = ${from}`;

  // Savepoint allows partial rollback without affecting outer transaction
  try {
    await tx.savepoint(async (sp) => {
      await sp`UPDATE accounts SET balance = balance + 100 WHERE id = ${to}`;
      // If this fails, only the savepoint rolls back
    });
  } catch (error) {
    // Savepoint rolled back, but main transaction continues
    console.log("Transfer to recipient failed, trying alternative");
  }

  // Main transaction can still commit
});
```

### Transaction Options

```typescript
// Alternative method
await sql.transaction(async (tx) => {
  await tx`INSERT INTO orders (id) VALUES (${orderId})`;
}, {
  isolationLevel: "serializable" // Optional isolation level
});
```

### Distributed Transactions (PostgreSQL/MySQL)

```typescript
// PostgreSQL
await sql.beginDistributed("tx-123", async (tx) => {
  await tx`INSERT INTO orders (id) VALUES (${orderId})`;
});
await sql.commitDistributed("tx-123");

// MySQL (XA Transactions)
await mysql.beginDistributed("xa-123", async (tx) => {
  await tx`INSERT INTO inventory (id, qty) VALUES (${sku}, ${qty})`;
});
await mysql.commitDistributed("xa-123");
```

### Pipelining in Transactions

```typescript
// Return array of Promises for automatic Promise.all before COMMIT
await sql.begin(async (tx) => {
  return [
    tx`INSERT INTO logs (msg) VALUES (${"action1"})`,
    tx`INSERT INTO logs (msg) VALUES (${"action2"})`,
    tx`INSERT INTO logs (msg) VALUES (${"action3"})`
  ];
});
```

---

## Prepared Statements

Bun automatically caches and reuses prepared statements for performance and security.

### Automatic Prepared Statements

```typescript
// Every tagged template query uses prepared statements by default
const users = await sql`SELECT * FROM users WHERE id = ${userId}`;
```

### SQLite Manual Prepared Statements

```typescript
import { Database } from "bun:sqlite";

const db = new Database("app.db");

// Create reusable prepared statements
const insertUser = db.query(
  "INSERT INTO users (name, email) VALUES ($name, $email) RETURNING *"
);
const getUser = db.query("SELECT * FROM users WHERE id = ?");
const getAllUsers = db.query("SELECT * FROM users");

// Execute with parameters
const newUser = insertUser.get({ name: "Alice", email: "[email protected]" });
const user = getUser.get(1);        // Single result
const users = getAllUsers.all();    // All results
```

---

## Bulk Operations

### Bulk Insert

```typescript
const newUsers = [
  { name: "Alice", email: "[email protected]" },
  { name: "Bob", email: "[email protected]" },
  { name: "Charlie", email: "[email protected]" }
];

// Insert multiple rows efficiently
await sql`INSERT INTO users ${sql(newUsers)}`;

// With specific columns
await sql`INSERT INTO users ${sql(newUsers, "name", "email")}`;
```

### Bulk with Transactions

```typescript
await sql.begin(async (tx) => {
  // Pipeline bulk inserts
  return newUsers.map(user =>
    tx`INSERT INTO users ${tx(user)} RETURNING id`
  );
});
```

---

## Error Handling

### Database-Specific Errors

```typescript
import { SQL } from "bun";

try {
  await sql`INSERT INTO users (email) VALUES (${"duplicate@test.com"})`;
} catch (error) {
  // PostgreSQL errors
  if (error instanceof SQL.PostgresError) {
    console.log(error.code);    // "23505" (unique violation)
    console.log(error.detail);  // "Key (email)=... already exists"
    console.log(error.table);   // "users"
    console.log(error.constraint); // constraint name
  }

  // MySQL errors
  else if (error instanceof SQL.MySQLError) {
    console.log(error.code);     // 1062 (duplicate entry)
    console.log(error.sqlState); // "23000"
  }

  // SQLite errors
  else if (error instanceof SQL.SQLiteError) {
    console.log(error.code); // "SQLITE_CONSTRAINT"
  }

  // Generic SQL error check
  if (error instanceof SQL.SQLError) {
    console.log("Database error:", error.message);
  }
}
```

### Transaction Error Handling

```typescript
try {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO orders ...`;
    throw new Error("Something went wrong");
    // ROLLBACK is called automatically
  });
} catch (error) {
  // Transaction was rolled back
  console.error("Transaction failed:", error.message);
}
```

---

## Best Practices

### 1. Always Use Tagged Templates for User Input

```typescript
// GOOD - Safe from SQL injection
const user = await sql`SELECT * FROM users WHERE email = ${userEmail}`;

// BAD - Vulnerable to SQL injection
const user = await sql`SELECT * FROM users WHERE email = '${userEmail}'`;
```

### 2. Use Transactions for Related Operations

```typescript
// GOOD - Atomic operation
await sql.begin(async (tx) => {
  await tx`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${from}`;
  await tx`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${to}`;
});

// BAD - Not atomic, can leave inconsistent state
await sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${from}`;
await sql`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${to}`;
```

### 3. Close Connections Gracefully

```typescript
const db = new SQL(connectionString);

// Graceful shutdown
process.on("SIGTERM", async () => {
  await db.close();
  process.exit(0);
});

// Force close after timeout
await db.close({ timeout: 5 });
```

### 4. Use Connection Pooling Appropriately

```typescript
const db = new SQL({
  ...config,
  max: 20,           // Adjust based on workload
  idleTimeout: 30,   // Close idle connections
  maxLifetime: 3600  // Prevent stale connections
});
```

### 5. Reserve Connections for Sequential Operations

```typescript
const conn = await sql.reserve();
try {
  await conn`SELECT * FROM users`;
  await conn`SELECT * FROM orders`;
} finally {
  conn.release(); // Always release
}
```

---

## Database-Specific Features

### PostgreSQL

```typescript
// Array types
const [row] = await sql`
  SELECT ARRAY[1, 2, 3] as nums, ARRAY['a', 'b'] as letters
`;

// JSON/JSONB
await sql`
  INSERT INTO config (data) VALUES (${sql.json({ theme: "dark" })})
`;

// LISTEN/NOTIFY
await sql.listen("events", (payload) => {
  console.log("Received:", payload);
});
await sql`NOTIFY events, 'hello'`;
```

### MySQL

```typescript
// Last insert ID (no RETURNING support)
const result = await mysql`INSERT INTO users (name) VALUES (${"Alice"})`;
console.log(result.insertId);

// Multiple statements
await mysql.simple(`
  CREATE TABLE IF NOT EXISTS test (id INT);
  INSERT INTO test VALUES (1);
`);
```

### SQLite

```typescript
// WAL mode for better concurrency
await sqlite`PRAGMA journal_mode = WAL`;
await sqlite`PRAGMA foreign_keys = ON`;

// Last insert rowid
const result = await sqlite`INSERT INTO users (name) VALUES (${"Alice"})`;
console.log(result.lastInsertRowid);
```

---

## Type Conversion

| SQL Type | JavaScript Type |
|----------|----------------|
| INT, BIGINT | `number` (or `bigint` if > 53 bits or `bigint: true`) |
| DECIMAL, NUMERIC | `string` (precision preservation) |
| VARCHAR, TEXT | `string` |
| BOOLEAN | `boolean` |
| DATE, TIMESTAMP | `Date` |
| JSON, JSONB | Parsed object/array |
| BLOB, BYTEA | `Uint8Array` |
| ARRAY (Postgres) | JavaScript array |
