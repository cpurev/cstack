#!/usr/bin/env python3
"""Run one read-only SQL query against a Postgres database and print compact TSV.

Read-only is enforced here, not by convention:
  - only a single SELECT / WITH / EXPLAIN / TABLE / VALUES / SHOW statement is accepted
  - known side-effecting functions are refused (pg_terminate_backend, set_config, dblink, ...)
  - the query runs inside BEGIN TRANSACTION READ ONLY, which Postgres itself enforces
  - statement_timeout and lock_timeout are set on the connection
  - output is capped (rows and cell width) so results stay cheap to read

Usage:
  q.py "SELECT count(*) FROM job WHERE date_added > now() - interval '1 day'"
  q.py --schema talent_profile          # columns of one table
  q.py --check "DELETE FROM x"          # validate only, no connection
Options: --rows N (default 50), --timeout SECONDS (default 15), --url-env NAME

The connection URL comes from --url-env, else $ITS_PROD_DB_URL, else $DATABASE_URL.
A SQLAlchemy-style URL (postgresql+asyncpg://) is accepted. The password is never printed.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys

ALLOWED_FIRST_WORDS = {"select", "with", "explain", "table", "values", "show"}
FORBIDDEN_WORDS = re.compile(
    r"\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|vacuum|"
    r"reindex|cluster|refresh|lock|call|commit|rollback|savepoint|notify)\b",
    re.IGNORECASE,
)
FORBIDDEN_FUNCTIONS = re.compile(
    r"\b(pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|set_config|"
    r"dblink\w*|lo_\w+|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|"
    r"pg_advisory\w*|pg_try_advisory\w*|nextval|setval|pg_sleep\w*|pg_switch_wal|"
    r"pg_create\w*|pg_drop\w*|pg_promote|txid_current|pg_current_xact_id)\s*\(",
    re.IGNORECASE,
)


def strip_sql_noise(sql: str) -> str:
    """Remove comments and string literals so keyword checks only see SQL structure."""
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    sql = re.sub(r"\$(\w*)\$.*?\$\1\$", "''", sql, flags=re.DOTALL)
    sql = re.sub(r"'(?:[^']|'')*'", "''", sql)
    sql = re.sub(r'"(?:[^"]|"")*"', "ident", sql)
    return sql


def check_sql(sql: str) -> str | None:
    """Return an error message if the SQL is not an allowed read-only statement."""
    bare = strip_sql_noise(sql).strip().rstrip(";").strip()
    if not bare:
        return "empty query"
    if ";" in bare:
        return "only one statement per call"
    first = bare.split(None, 1)[0].lower()
    if first not in ALLOWED_FIRST_WORDS:
        return f"statement must start with one of {sorted(ALLOWED_FIRST_WORDS)}, got {first!r}"
    if first == "explain" and re.search(r"\banalyze\b", bare, re.IGNORECASE):
        return "EXPLAIN ANALYZE executes the query; use plain EXPLAIN"
    body = bare if first != "explain" else re.sub(r"^explain\s*(\([^)]*\))?", "", bare, flags=re.I)
    if m := FORBIDDEN_WORDS.search(body):
        return f"forbidden keyword {m.group(1).upper()!r}"
    if m := FORBIDDEN_FUNCTIONS.search(bare):
        return f"forbidden function {m.group(1)!r}"
    if re.search(r"\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b", bare, re.I):
        return "row locks (FOR UPDATE/SHARE) are not allowed"
    return None


def resolve_url(url_env: str | None) -> str:
    names = [url_env] if url_env else ["ITS_PROD_DB_URL", "DATABASE_URL"]
    for name in names:
        if name and os.environ.get(name):
            return re.sub(r"^postgres(ql)?\+\w+://", "postgresql://", os.environ[name])
    sys.exit(f"no database URL: set one of {names} (or pass --url-env NAME)")


def mask(url: str) -> str:
    return re.sub(r"://[^@/]*@", "://***@", url)


def fmt(value: object, width: int) -> str:
    text = "NULL" if value is None else str(value).replace("\t", " ").replace("\n", "\\n")
    return text if len(text) <= width else text[: width - 1] + "…"


async def run(sql: str, url: str, rows: int, timeout: float, width: int) -> None:
    import asyncpg

    conn = await asyncpg.connect(
        url,
        timeout=10,
        server_settings={
            "default_transaction_read_only": "on",
            "statement_timeout": str(int(timeout * 1000)),
            "lock_timeout": "2000",
            "idle_in_transaction_session_timeout": str(int(timeout * 2000)),
            "application_name": "its-prod",
        },
    )
    try:
        async with conn.transaction(readonly=True, isolation="repeatable_read"):
            stmt = await conn.prepare(sql)
            cols = [a.name for a in stmt.get_attributes()]
            records = await stmt.fetch(timeout=timeout)
    finally:
        await conn.close()

    print("\t".join(cols))
    for rec in records[:rows]:
        print("\t".join(fmt(v, width) for v in rec))
    extra = len(records) - rows
    print(f"-- {len(records)} row(s)" + (f", showing first {rows}" if extra > 0 else ""))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("sql", nargs="?")
    p.add_argument("--schema", metavar="TABLE", help="list the columns of a table")
    p.add_argument("--check", action="store_true", help="validate the SQL without connecting")
    p.add_argument("--rows", type=int, default=50)
    p.add_argument("--timeout", type=float, default=15.0)
    p.add_argument("--width", type=int, default=80, help="max characters per cell")
    p.add_argument("--url-env", help="env var holding the database URL")
    args = p.parse_args()

    if args.schema:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?", args.schema):
            sys.exit("bad table name")
        schema, _, table = args.schema.rpartition(".")
        sql = (
            "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
            f"WHERE table_name = '{table}' AND table_schema = '{schema or 'public'}' "
            "ORDER BY ordinal_position"
        )
        args.rows = max(args.rows, 500)
    elif args.sql:
        sql = args.sql
    else:
        sys.exit("pass a SQL string or --schema TABLE")

    if error := check_sql(sql):
        sys.exit(f"refused: {error}")
    if args.check:
        print("ok: read-only statement")
        return

    url = resolve_url(args.url_env)
    try:
        asyncio.run(run(sql.strip().rstrip(";"), url, args.rows, args.timeout, args.width))
    except Exception as exc:  # report the database error without a traceback
        sys.exit(f"error ({mask(url)}): {type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
