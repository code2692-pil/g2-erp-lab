-- Fixed fictional production sample master data. Existing rows are never updated or deleted.
IF DB_NAME() <> N'G2ERP_DEV_LOCAL_TEST'
    THROW 51000, 'This script may run only against G2ERP_DEV_LOCAL_TEST.', 1;

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'POC.MA_ITEM', N'U') IS NULL
       OR OBJECT_ID(N'POC.MST_PRODUCTION_LINE', N'U') IS NULL
       OR OBJECT_ID(N'POC.MST_PROCESS', N'U') IS NULL
       OR OBJECT_ID(N'POC.MST_EQUIPMENT', N'U') IS NULL
        THROW 51001, 'Required PoC item or production master tables are missing.', 1;

    DECLARE @items TABLE (CD_ITEM varchar(30) NOT NULL PRIMARY KEY, NM_ITEM nvarchar(100) NOT NULL, STND_ITEM nvarchar(100) NOT NULL, UNIT_ITEM varchar(10) NOT NULL, YN_USE char(1) NOT NULL);
    INSERT INTO @items VALUES
        ('ITEM-SMP-FG01', N'샘플 완제품 A', N'SMP-FG-A', 'EA', 'Y'),
        ('ITEM-SMP-FG02', N'샘플 완제품 B', N'SMP-FG-B', 'EA', 'Y'),
        ('ITEM-SMP-SF01', N'샘플 반제품 A', N'SMP-SF-A', 'EA', 'Y'),
        ('ITEM-SMP-SF02', N'샘플 반제품 B', N'SMP-SF-B', 'EA', 'Y'),
        ('ITEM-SMP-RM01', N'샘플 원재료 A', N'SMP-RM-A', 'KG', 'Y'),
        ('ITEM-SMP-RM02', N'샘플 원재료 B', N'SMP-RM-B', 'L', 'Y');

    DECLARE @lines TABLE (CD_LINE nvarchar(30) NOT NULL PRIMARY KEY, NM_LINE nvarchar(100) NOT NULL, YN_USE char(1) NOT NULL);
    INSERT INTO @lines VALUES
        (N'LINE-SMP-01', N'샘플 혼합라인', 'Y'),
        (N'LINE-SMP-02', N'샘플 조립라인', 'Y'),
        (N'LINE-SMP-03', N'샘플 포장라인', 'Y');

    DECLARE @processes TABLE (CD_PROC nvarchar(30) NOT NULL PRIMARY KEY, NM_PROC nvarchar(100) NOT NULL, NO_SEQ int NOT NULL, YN_USE char(1) NOT NULL);
    INSERT INTO @processes VALUES
        (N'PROC-SMP-01', N'자재준비', 10, 'Y'),
        (N'PROC-SMP-02', N'혼합', 20, 'Y'),
        (N'PROC-SMP-03', N'조립', 30, 'Y'),
        (N'PROC-SMP-04', N'중간검사', 40, 'Y'),
        (N'PROC-SMP-05', N'포장', 50, 'Y'),
        (N'PROC-SMP-06', N'라벨부착', 60, 'Y'),
        (N'PROC-SMP-07', N'최종검사', 70, 'Y'),
        (N'PROC-SMP-08', N'입고대기', 80, 'Y');

    DECLARE @equipment TABLE (CD_EQUIP nvarchar(30) NOT NULL PRIMARY KEY, NM_EQUIP nvarchar(100) NOT NULL, CD_LINE nvarchar(30) NOT NULL, YN_USE char(1) NOT NULL);
    INSERT INTO @equipment VALUES
        (N'EQ-SMP-01', N'샘플 혼합기 1호', N'LINE-SMP-01', 'Y'),
        (N'EQ-SMP-02', N'샘플 혼합기 2호', N'LINE-SMP-01', 'Y'),
        (N'EQ-SMP-03', N'샘플 조립기 1호', N'LINE-SMP-02', 'Y'),
        (N'EQ-SMP-04', N'샘플 조립기 2호', N'LINE-SMP-02', 'Y'),
        (N'EQ-SMP-05', N'샘플 검사기 1호', N'LINE-SMP-02', 'Y'),
        (N'EQ-SMP-06', N'샘플 검사기 2호', N'LINE-SMP-02', 'Y'),
        (N'EQ-SMP-07', N'샘플 포장기 1호', N'LINE-SMP-03', 'Y'),
        (N'EQ-SMP-08', N'샘플 포장기 2호', N'LINE-SMP-03', 'Y');

    IF EXISTS (
        SELECT 1 FROM @items AS expected
        INNER JOIN POC.MA_ITEM AS actual ON actual.CD_FIRM='1000' AND actual.CD_ITEM=expected.CD_ITEM
        WHERE actual.NM_ITEM<>expected.NM_ITEM OR actual.STND_ITEM<>expected.STND_ITEM OR actual.UNIT_ITEM<>expected.UNIT_ITEM OR actual.YN_USE<>expected.YN_USE
    ) THROW 51002, 'A fixed sample item key already exists with different content. No sample row was changed.', 1;

    IF EXISTS (
        SELECT 1 FROM @lines AS expected
        INNER JOIN POC.MST_PRODUCTION_LINE AS actual ON actual.CD_FIRM=N'1000' AND actual.CD_LINE=expected.CD_LINE
        WHERE actual.NM_LINE<>expected.NM_LINE OR actual.YN_USE<>expected.YN_USE
    ) THROW 51003, 'A fixed sample production-line key already exists with different content. No sample row was changed.', 1;

    IF EXISTS (
        SELECT 1 FROM @processes AS expected
        INNER JOIN POC.MST_PROCESS AS actual ON actual.CD_FIRM=N'1000' AND actual.CD_PROC=expected.CD_PROC
        WHERE actual.NM_PROC<>expected.NM_PROC OR actual.NO_SEQ<>expected.NO_SEQ OR actual.YN_USE<>expected.YN_USE
    ) THROW 51004, 'A fixed sample process key already exists with different content. No sample row was changed.', 1;

    IF EXISTS (
        SELECT 1 FROM @equipment AS expected
        INNER JOIN POC.MST_EQUIPMENT AS actual ON actual.CD_FIRM=N'1000' AND actual.CD_EQUIP=expected.CD_EQUIP
        WHERE actual.NM_EQUIP<>expected.NM_EQUIP OR actual.CD_LINE<>expected.CD_LINE OR actual.YN_USE<>expected.YN_USE
    ) THROW 51005, 'A fixed sample equipment key already exists with different content. No sample row was changed.', 1;

    INSERT INTO POC.MA_ITEM(CD_FIRM,CD_ITEM,NM_ITEM,STND_ITEM,UNIT_ITEM,YN_USE)
    SELECT '1000', expected.CD_ITEM, expected.NM_ITEM, expected.STND_ITEM, expected.UNIT_ITEM, expected.YN_USE
    FROM @items AS expected
    WHERE NOT EXISTS (SELECT 1 FROM POC.MA_ITEM AS actual WHERE actual.CD_FIRM='1000' AND actual.CD_ITEM=expected.CD_ITEM);

    INSERT INTO POC.MST_PRODUCTION_LINE(CD_FIRM,CD_LINE,NM_LINE,YN_USE,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD)
    SELECT N'1000', expected.CD_LINE, expected.NM_LINE, expected.YN_USE, N'SYSTEM', SYSUTCDATETIME(), N'SYSTEM', SYSUTCDATETIME()
    FROM @lines AS expected
    WHERE NOT EXISTS (SELECT 1 FROM POC.MST_PRODUCTION_LINE AS actual WHERE actual.CD_FIRM=N'1000' AND actual.CD_LINE=expected.CD_LINE);

    INSERT INTO POC.MST_PROCESS(CD_FIRM,CD_PROC,NM_PROC,NO_SEQ,YN_USE,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD)
    SELECT N'1000', expected.CD_PROC, expected.NM_PROC, expected.NO_SEQ, expected.YN_USE, N'SYSTEM', SYSUTCDATETIME(), N'SYSTEM', SYSUTCDATETIME()
    FROM @processes AS expected
    WHERE NOT EXISTS (SELECT 1 FROM POC.MST_PROCESS AS actual WHERE actual.CD_FIRM=N'1000' AND actual.CD_PROC=expected.CD_PROC);

    INSERT INTO POC.MST_EQUIPMENT(CD_FIRM,CD_EQUIP,NM_EQUIP,CD_LINE,YN_USE,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD)
    SELECT N'1000', expected.CD_EQUIP, expected.NM_EQUIP, expected.CD_LINE, expected.YN_USE, N'SYSTEM', SYSUTCDATETIME(), N'SYSTEM', SYSUTCDATETIME()
    FROM @equipment AS expected
    WHERE NOT EXISTS (SELECT 1 FROM POC.MST_EQUIPMENT AS actual WHERE actual.CD_FIRM=N'1000' AND actual.CD_EQUIP=expected.CD_EQUIP);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
