-- Fixed fictional work-order sample data. Existing rows are never updated or deleted.
IF DB_NAME() <> N'G2ERP_DEV_LOCAL_TEST'
    THROW 51000, 'This script may run only against G2ERP_DEV_LOCAL_TEST.', 1;

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'POC.PRT_WO', N'U') IS NULL OR OBJECT_ID(N'POC.PRT_WOPROC', N'U') IS NULL
        THROW 51001, 'Required work-order tables are missing.', 1;

    DECLARE @headers TABLE (
        NO_WO nvarchar(30) NOT NULL PRIMARY KEY, DT_WO date NOT NULL, CD_ITEM varchar(30) NOT NULL, QT_WO decimal(18,4) NOT NULL, QT_RESULT decimal(18,4) NOT NULL,
        DT_PLAN_START date NOT NULL, DT_PLAN_END date NOT NULL, CD_LINE nvarchar(30) NOT NULL, ST_WO nvarchar(20) NOT NULL, YN_URGENT char(1) NOT NULL, DC_RMK nvarchar(500) NOT NULL
    );
    INSERT INTO @headers VALUES
        (N'WO-SAMPLE-0001', '2026-08-03', 'ITEM-SMP-FG01', 120, 0,   '2026-08-04', '2026-08-06', N'LINE-SMP-02', N'미확정', 'N', N'샘플 조립 시작 전'),
        (N'WO-SAMPLE-0002', '2026-08-04', 'ITEM-SMP-SF01', 80,  0,   '2026-08-05', '2026-08-06', N'LINE-SMP-01', N'확정',   'N', N'샘플 혼합 확정'),
        (N'WO-SAMPLE-0003', '2026-08-05', 'ITEM-SMP-FG02', 60,  20,  '2026-08-06', '2026-08-08', N'LINE-SMP-02', N'진행',   'N', N'샘플 중간 실적 반영'),
        (N'WO-SAMPLE-0004', '2026-08-06', 'ITEM-SMP-SF02', 100, 100, '2026-08-06', '2026-08-07', N'LINE-SMP-01', N'완료',   'N', N'샘플 혼합 완료'),
        (N'WO-SAMPLE-0005', '2026-08-07', 'ITEM-SMP-FG01', 40,  0,   '2026-08-07', '2026-08-09', N'LINE-SMP-02', N'확정',   'Y', N'긴급 납품 대응'),
        (N'WO-SAMPLE-0006', '2026-08-08', 'ITEM-SMP-FG02', 30,  30,  '2026-08-08', '2026-08-09', N'LINE-SMP-03', N'진행',   'N', N'월말 실적 등록');

    DECLARE @processLines TABLE (
        NO_WO nvarchar(30) NOT NULL, NO_PROC int NOT NULL, CD_PROC nvarchar(30) NOT NULL, CD_EQUIP nvarchar(30) NOT NULL,
        QT_PLAN decimal(18,4) NOT NULL, QT_RESULT decimal(18,4) NOT NULL, TM_PLAN_START datetime2(3) NOT NULL, TM_PLAN_END datetime2(3) NOT NULL,
        ST_PROC nvarchar(20) NOT NULL, DC_RMK nvarchar(500) NOT NULL, PRIMARY KEY(NO_WO,NO_PROC)
    );
    INSERT INTO @processLines VALUES
        (N'WO-SAMPLE-0001', 10, N'PROC-SMP-03', N'EQ-SMP-03', 120, 0,   '2026-08-04T08:00:00', '2026-08-04T12:00:00', N'대기', N''),
        (N'WO-SAMPLE-0001', 20, N'PROC-SMP-04', N'EQ-SMP-05', 120, 0,   '2026-08-05T09:00:00', '2026-08-05T11:00:00', N'대기', N''),
        (N'WO-SAMPLE-0001', 30, N'PROC-SMP-07', N'EQ-SMP-06', 120, 0,   '2026-08-06T13:00:00', '2026-08-06T15:00:00', N'대기', N''),
        (N'WO-SAMPLE-0002', 10, N'PROC-SMP-01', N'EQ-SMP-01', 80,  0,   '2026-08-05T08:00:00', '2026-08-05T10:00:00', N'대기', N''),
        (N'WO-SAMPLE-0002', 20, N'PROC-SMP-02', N'EQ-SMP-02', 80,  0,   '2026-08-06T08:00:00', '2026-08-06T12:00:00', N'대기', N''),
        (N'WO-SAMPLE-0003', 10, N'PROC-SMP-03', N'EQ-SMP-03', 60,  20,  '2026-08-06T08:00:00', '2026-08-06T12:00:00', N'진행', N''),
        (N'WO-SAMPLE-0003', 20, N'PROC-SMP-03', N'EQ-SMP-04', 60,  20,  '2026-08-06T13:00:00', '2026-08-06T16:00:00', N'진행', N''),
        (N'WO-SAMPLE-0003', 30, N'PROC-SMP-04', N'EQ-SMP-05', 60,  0,   '2026-08-07T09:00:00', '2026-08-07T11:00:00', N'대기', N''),
        (N'WO-SAMPLE-0003', 40, N'PROC-SMP-07', N'EQ-SMP-06', 60,  0,   '2026-08-08T13:00:00', '2026-08-08T15:00:00', N'대기', N''),
        (N'WO-SAMPLE-0004', 10, N'PROC-SMP-01', N'EQ-SMP-01', 100, 100, '2026-08-06T08:00:00', '2026-08-06T10:00:00', N'완료', N''),
        (N'WO-SAMPLE-0004', 20, N'PROC-SMP-02', N'EQ-SMP-02', 100, 100, '2026-08-06T10:30:00', '2026-08-07T14:00:00', N'완료', N''),
        (N'WO-SAMPLE-0005', 10, N'PROC-SMP-03', N'EQ-SMP-04', 40,  0,   '2026-08-07T08:00:00', '2026-08-07T11:00:00', N'대기', N'긴급 우선 배정'),
        (N'WO-SAMPLE-0005', 20, N'PROC-SMP-03', N'EQ-SMP-03', 40,  0,   '2026-08-07T13:00:00', '2026-08-07T16:00:00', N'대기', N''),
        (N'WO-SAMPLE-0005', 30, N'PROC-SMP-04', N'EQ-SMP-05', 40,  0,   '2026-08-08T08:00:00', '2026-08-08T10:00:00', N'대기', N''),
        (N'WO-SAMPLE-0005', 40, N'PROC-SMP-07', N'EQ-SMP-06', 40,  0,   '2026-08-09T09:00:00', '2026-08-09T11:00:00', N'대기', N''),
        (N'WO-SAMPLE-0006', 10, N'PROC-SMP-05', N'EQ-SMP-07', 30,  30,  '2026-08-08T08:00:00', '2026-08-08T10:00:00', N'완료', N''),
        (N'WO-SAMPLE-0006', 20, N'PROC-SMP-06', N'EQ-SMP-08', 30,  30,  '2026-08-08T10:30:00', '2026-08-08T12:00:00', N'완료', N''),
        (N'WO-SAMPLE-0006', 30, N'PROC-SMP-08', N'EQ-SMP-08', 30,  30,  '2026-08-09T09:00:00', '2026-08-09T10:00:00', N'완료', N'입고 처리 대기');

    IF EXISTS (
        SELECT 1 FROM @headers AS expected
        LEFT JOIN POC.MA_ITEM AS item ON item.CD_FIRM='1000' AND item.CD_ITEM=expected.CD_ITEM AND item.YN_USE='Y'
        LEFT JOIN POC.MST_PRODUCTION_LINE AS line ON line.CD_FIRM=N'1000' AND line.CD_LINE=expected.CD_LINE AND line.YN_USE='Y'
        WHERE item.CD_ITEM IS NULL OR line.CD_LINE IS NULL
    ) THROW 51002, 'A sample work-order item or production line prerequisite is missing or inactive.', 1;

    IF EXISTS (
        SELECT 1 FROM @processLines AS expected
        INNER JOIN @headers AS header ON header.NO_WO=expected.NO_WO
        LEFT JOIN POC.MST_PROCESS AS processMaster ON processMaster.CD_FIRM=N'1000' AND processMaster.CD_PROC=expected.CD_PROC AND processMaster.YN_USE='Y'
        LEFT JOIN POC.MST_EQUIPMENT AS equipment ON equipment.CD_FIRM=N'1000' AND equipment.CD_EQUIP=expected.CD_EQUIP AND equipment.YN_USE='Y'
        WHERE processMaster.CD_PROC IS NULL OR equipment.CD_EQUIP IS NULL OR equipment.CD_LINE<>header.CD_LINE
    ) THROW 51003, 'A sample work-order process or equipment prerequisite is missing, inactive, or assigned to a different production line.', 1;

    IF EXISTS (
        SELECT 1 FROM @headers AS expected
        INNER JOIN POC.PRT_WO AS actual ON actual.CD_FIRM=N'1000' AND actual.NO_WO=expected.NO_WO
        INNER JOIN POC.MA_ITEM AS item ON item.CD_FIRM='1000' AND item.CD_ITEM=expected.CD_ITEM
        INNER JOIN POC.MST_PRODUCTION_LINE AS line ON line.CD_FIRM=N'1000' AND line.CD_LINE=expected.CD_LINE
        WHERE actual.DT_WO<>expected.DT_WO OR actual.CD_ITEM<>expected.CD_ITEM OR ISNULL(actual.NM_ITEM,N'')<>item.NM_ITEM OR ISNULL(actual.STND_ITEM,N'')<>item.STND_ITEM
           OR ISNULL(actual.UNIT_ITEM,N'')<>item.UNIT_ITEM OR actual.QT_WO<>expected.QT_WO OR actual.QT_RESULT<>expected.QT_RESULT
           OR actual.DT_PLAN_START<>expected.DT_PLAN_START OR actual.DT_PLAN_END<>expected.DT_PLAN_END OR actual.CD_LINE<>expected.CD_LINE
           OR ISNULL(actual.NM_LINE,N'')<>line.NM_LINE OR actual.ST_WO<>expected.ST_WO OR actual.YN_URGENT<>expected.YN_URGENT OR ISNULL(actual.DC_RMK,N'')<>expected.DC_RMK
    ) THROW 51004, 'A fixed sample work-order key already exists with different content. No sample row was changed.', 1;

    IF EXISTS (
        SELECT 1 FROM @processLines AS expected
        INNER JOIN POC.PRT_WOPROC AS actual ON actual.CD_FIRM=N'1000' AND actual.NO_WO=expected.NO_WO AND actual.NO_PROC=expected.NO_PROC
        INNER JOIN POC.MST_PROCESS AS processMaster ON processMaster.CD_FIRM=N'1000' AND processMaster.CD_PROC=expected.CD_PROC
        INNER JOIN POC.MST_EQUIPMENT AS equipment ON equipment.CD_FIRM=N'1000' AND equipment.CD_EQUIP=expected.CD_EQUIP
        WHERE actual.CD_PROC<>expected.CD_PROC OR actual.NM_PROC<>processMaster.NM_PROC OR ISNULL(actual.CD_EQUIP,N'')<>expected.CD_EQUIP
           OR ISNULL(actual.NM_EQUIP,N'')<>equipment.NM_EQUIP OR actual.QT_PLAN<>expected.QT_PLAN OR actual.QT_RESULT<>expected.QT_RESULT
           OR actual.TM_PLAN_START<>expected.TM_PLAN_START OR actual.TM_PLAN_END<>expected.TM_PLAN_END OR actual.ST_PROC<>expected.ST_PROC OR ISNULL(actual.DC_RMK,N'')<>expected.DC_RMK
    ) THROW 51005, 'A fixed sample work-order process key already exists with different content. No sample row was changed.', 1;

    INSERT INTO POC.PRT_WO(CD_FIRM,NO_WO,DT_WO,CD_ITEM,NM_ITEM,STND_ITEM,UNIT_ITEM,QT_WO,QT_RESULT,DT_PLAN_START,DT_PLAN_END,CD_LINE,NM_LINE,ST_WO,YN_URGENT,DC_RMK,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD)
    SELECT N'1000', expected.NO_WO, expected.DT_WO, expected.CD_ITEM, item.NM_ITEM, item.STND_ITEM, item.UNIT_ITEM, expected.QT_WO, expected.QT_RESULT,
           expected.DT_PLAN_START, expected.DT_PLAN_END, expected.CD_LINE, line.NM_LINE, expected.ST_WO, expected.YN_URGENT, expected.DC_RMK,
           N'SYSTEM', SYSUTCDATETIME(), N'SYSTEM', SYSUTCDATETIME()
    FROM @headers AS expected
    INNER JOIN POC.MA_ITEM AS item ON item.CD_FIRM='1000' AND item.CD_ITEM=expected.CD_ITEM
    INNER JOIN POC.MST_PRODUCTION_LINE AS line ON line.CD_FIRM=N'1000' AND line.CD_LINE=expected.CD_LINE
    WHERE NOT EXISTS (SELECT 1 FROM POC.PRT_WO AS actual WHERE actual.CD_FIRM=N'1000' AND actual.NO_WO=expected.NO_WO);

    INSERT INTO POC.PRT_WOPROC(CD_FIRM,NO_WO,NO_PROC,CD_PROC,NM_PROC,CD_EQUIP,NM_EQUIP,QT_PLAN,QT_RESULT,TM_PLAN_START,TM_PLAN_END,ST_PROC,DC_RMK,CD_USER_REG,TM_REG,CD_USER_AMD,TM_AMD)
    SELECT N'1000', expected.NO_WO, expected.NO_PROC, expected.CD_PROC, processMaster.NM_PROC, expected.CD_EQUIP, equipment.NM_EQUIP,
           expected.QT_PLAN, expected.QT_RESULT, expected.TM_PLAN_START, expected.TM_PLAN_END, expected.ST_PROC, expected.DC_RMK,
           N'SYSTEM', SYSUTCDATETIME(), N'SYSTEM', SYSUTCDATETIME()
    FROM @processLines AS expected
    INNER JOIN POC.MST_PROCESS AS processMaster ON processMaster.CD_FIRM=N'1000' AND processMaster.CD_PROC=expected.CD_PROC
    INNER JOIN POC.MST_EQUIPMENT AS equipment ON equipment.CD_FIRM=N'1000' AND equipment.CD_EQUIP=expected.CD_EQUIP
    WHERE NOT EXISTS (SELECT 1 FROM POC.PRT_WOPROC AS actual WHERE actual.CD_FIRM=N'1000' AND actual.NO_WO=expected.NO_WO AND actual.NO_PROC=expected.NO_PROC);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
