-- Execute from master only after manually confirming the target is localhost. Never drops a database.
IF DB_ID(N'G2ERP_DEV_LOCAL_TEST') IS NULL CREATE DATABASE G2ERP_DEV_LOCAL_TEST;
