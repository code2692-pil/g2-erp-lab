-- Read-only validation for the fixed fictional production sample data.
IF DB_NAME() <> N'G2ERP_DEV_LOCAL_TEST'
    THROW 51000, 'This script may run only against G2ERP_DEV_LOCAL_TEST.', 1;

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF (SELECT COUNT(*) FROM POC.MA_ITEM WHERE CD_FIRM='1000' AND CD_ITEM IN ('ITEM-SMP-FG01','ITEM-SMP-FG02','ITEM-SMP-SF01','ITEM-SMP-SF02','ITEM-SMP-RM01','ITEM-SMP-RM02') AND YN_USE='Y') <> 6
        THROW 51001, 'Fixed sample item validation failed.', 1;
    IF (SELECT COUNT(*) FROM POC.MST_PRODUCTION_LINE WHERE CD_FIRM=N'1000' AND CD_LINE IN (N'LINE-SMP-01',N'LINE-SMP-02',N'LINE-SMP-03') AND YN_USE='Y') <> 3
        THROW 51002, 'Fixed sample production-line validation failed.', 1;
    IF (SELECT COUNT(*) FROM POC.MST_PROCESS WHERE CD_FIRM=N'1000' AND CD_PROC LIKE N'PROC-SMP-%' AND YN_USE='Y') <> 8
        THROW 51003, 'Fixed sample process validation failed.', 1;
    IF (SELECT COUNT(*) FROM POC.MST_EQUIPMENT WHERE CD_FIRM=N'1000' AND CD_EQUIP LIKE N'EQ-SMP-%' AND YN_USE='Y') <> 8
        THROW 51004, 'Fixed sample equipment validation failed.', 1;
    IF (SELECT COUNT(*) FROM POC.PRT_WO WHERE CD_FIRM=N'1000' AND NO_WO IN (N'WO-SAMPLE-0001',N'WO-SAMPLE-0002',N'WO-SAMPLE-0003',N'WO-SAMPLE-0004',N'WO-SAMPLE-0005',N'WO-SAMPLE-0006')) <> 6
        THROW 51005, 'Fixed sample work-order header validation failed.', 1;
    IF (SELECT COUNT(*) FROM POC.PRT_WOPROC WHERE CD_FIRM=N'1000' AND NO_WO IN (N'WO-SAMPLE-0001',N'WO-SAMPLE-0002',N'WO-SAMPLE-0003',N'WO-SAMPLE-0004',N'WO-SAMPLE-0005',N'WO-SAMPLE-0006')) <> 18
        THROW 51006, 'Fixed sample work-order process validation failed.', 1;

    IF EXISTS (
        SELECT 1 FROM POC.MST_EQUIPMENT AS equipment
        LEFT JOIN POC.MST_PRODUCTION_LINE AS line ON line.CD_FIRM=equipment.CD_FIRM AND line.CD_LINE=equipment.CD_LINE
        WHERE equipment.CD_FIRM=N'1000' AND equipment.CD_EQUIP LIKE N'EQ-SMP-%' AND line.CD_LINE IS NULL
    ) THROW 51007, 'A fixed sample equipment row references a missing production line.', 1;

    IF EXISTS (
        SELECT 1 FROM POC.PRT_WO AS header
        LEFT JOIN POC.MA_ITEM AS item ON item.CD_FIRM=header.CD_FIRM AND item.CD_ITEM=header.CD_ITEM
        LEFT JOIN POC.MST_PRODUCTION_LINE AS line ON line.CD_FIRM=header.CD_FIRM AND line.CD_LINE=header.CD_LINE
        WHERE header.CD_FIRM=N'1000' AND header.NO_WO LIKE N'WO-SAMPLE-%' AND (item.CD_ITEM IS NULL OR line.CD_LINE IS NULL)
    ) THROW 51008, 'A fixed sample work-order header references a missing item or production line.', 1;

    IF EXISTS (
        SELECT 1 FROM POC.PRT_WOPROC AS processLine
        LEFT JOIN POC.MST_PROCESS AS processMaster ON processMaster.CD_FIRM=processLine.CD_FIRM AND processMaster.CD_PROC=processLine.CD_PROC
        LEFT JOIN POC.MST_EQUIPMENT AS equipment ON equipment.CD_FIRM=processLine.CD_FIRM AND equipment.CD_EQUIP=processLine.CD_EQUIP
        WHERE processLine.CD_FIRM=N'1000' AND processLine.NO_WO LIKE N'WO-SAMPLE-%' AND (processMaster.CD_PROC IS NULL OR equipment.CD_EQUIP IS NULL)
    ) THROW 51009, 'A fixed sample work-order process references a missing process or equipment.', 1;

    IF EXISTS (
        SELECT 1 FROM POC.PRT_WO AS header
        INNER JOIN POC.PRT_WOPROC AS processLine ON processLine.CD_FIRM=header.CD_FIRM AND processLine.NO_WO=header.NO_WO
        INNER JOIN POC.MST_EQUIPMENT AS equipment ON equipment.CD_FIRM=processLine.CD_FIRM AND equipment.CD_EQUIP=processLine.CD_EQUIP
        WHERE header.CD_FIRM=N'1000' AND header.NO_WO LIKE N'WO-SAMPLE-%' AND equipment.CD_LINE<>header.CD_LINE
    ) THROW 51010, 'A fixed sample work-order process equipment is assigned to a different production line.', 1;

    IF EXISTS (
        SELECT 1 FROM POC.PRT_WO AS header
        INNER JOIN POC.PRT_WOPROC AS processLine ON processLine.CD_FIRM=header.CD_FIRM AND processLine.NO_WO=header.NO_WO
        WHERE header.CD_FIRM=N'1000' AND header.NO_WO LIKE N'WO-SAMPLE-%'
          AND (header.QT_WO<=0 OR header.QT_RESULT<0 OR header.DT_PLAN_START>header.DT_PLAN_END OR processLine.QT_PLAN<=0 OR processLine.QT_RESULT<0 OR processLine.TM_PLAN_START>processLine.TM_PLAN_END)
    ) THROW 51011, 'A fixed sample work-order quantity or schedule is invalid.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
