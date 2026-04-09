-- Auto-run by the official postgres image on first volume init.
-- Creates the dedicated database that integration tests TRUNCATE between
-- runs (testutil.ResetSchema). Safe to leave around — never touched in dev.
CREATE DATABASE phaeton_test;
GRANT ALL PRIVILEGES ON DATABASE phaeton_test TO phaeton;
