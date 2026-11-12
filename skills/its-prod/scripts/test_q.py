"""Read-only enforcement must not regress. Run: python3 -m unittest skills/its-prod/scripts/test_q.py"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
from q import check_sql  # noqa: E402

REFUSED = [
    "DELETE FROM job",
    "WITH gone AS (DELETE FROM job RETURNING id) SELECT count(*) FROM gone",
    "SELECT 1; DROP TABLE job",
    "SELECT pg_sleep(10)",
    "SELECT set_config('statement_timeout', '0', false)",
    "SELECT pg_terminate_backend(123)",
    "SELECT nextval('job_id_seq')",
    "SELECT * FROM job FOR UPDATE",
    "EXPLAIN ANALYZE SELECT * FROM job",
    "EXPLAIN DELETE FROM job",
    "COPY job TO '/tmp/x'",
    "BEGIN",
    "",
    "-- only a comment",
]

ALLOWED = [
    "SELECT count(*) FROM job WHERE date_added > now() - interval '1 day'",
    "SELECT 1;",
    "WITH recent AS (SELECT id FROM job LIMIT 5) SELECT * FROM recent",
    "EXPLAIN SELECT * FROM job",
    "SELECT * FROM job WHERE note = 'please delete; drop table'",
    "SELECT updated_at, created_by FROM job",
    "SELECT 1 -- delete this later",
    'SELECT "delete" FROM job',
]


class CheckSql(unittest.TestCase):
    def test_refused(self):
        for sql in REFUSED:
            with self.subTest(sql=sql):
                self.assertIsNotNone(check_sql(sql))

    def test_allowed(self):
        for sql in ALLOWED:
            with self.subTest(sql=sql):
                self.assertIsNone(check_sql(sql))


if __name__ == "__main__":
    unittest.main()
