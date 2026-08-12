# Database Directory Structure

This directory contains all database-related files for the application.

## Directory Layout

- **`migrations/`**: Contains the schema migration files. These are run in order to update the database schema.
  - Naming convention: `XXX_description.sql` (where XXX is a sequential number).
  
- **`queries/`**: Contains read-only and debug queries. These are safe to run and do not modify data.
  - Example: `TEST_PERIOD_QUERY.sql`, `check_period_status.sql`

- **`scripts/`**: Contains maintenance, repair, and data mitigation scripts. These may modify data and should be run with caution.
  - Example: `fix_periods.sql`, `emergency_period_fix.sql`

- **`init/`**: Initialization scripts for new environments.

- **`backups/`**: Database dumps and backup files.

## Usage

When creating new database changes:
1. Create a new migration file in `migrations/` with the next available number.
2. If checking data issues, add your query to `queries/`.
3. If fixing data issues, add your script to `scripts/`.
