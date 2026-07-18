-- Work-order PoC schema. This script never alters or drops an existing object.
IF DB_NAME() <> N'G2ERP_DEV_LOCAL_TEST'
    THROW 51000, 'This script may run only against G2ERP_DEV_LOCAL_TEST.', 1;

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'POC.MST_PRODUCTION_LINE', N'U') IS NULL
        CREATE TABLE POC.MST_PRODUCTION_LINE
        (
            CD_FIRM nvarchar(10) NOT NULL,
            CD_LINE nvarchar(30) NOT NULL,
            NM_LINE nvarchar(100) NOT NULL,
            YN_USE char(1) NOT NULL CONSTRAINT CK_MST_PRODUCTION_LINE_USE CHECK (YN_USE IN ('Y', 'N')),
            CD_USER_REG nvarchar(50) NOT NULL,
            TM_REG datetime2(3) NOT NULL,
            CD_USER_AMD nvarchar(50) NOT NULL,
            TM_AMD datetime2(3) NOT NULL,
            CONSTRAINT PK_MST_PRODUCTION_LINE PRIMARY KEY (CD_FIRM, CD_LINE)
        );

    IF OBJECT_ID(N'POC.MST_PROCESS', N'U') IS NULL
        CREATE TABLE POC.MST_PROCESS
        (
            CD_FIRM nvarchar(10) NOT NULL,
            CD_PROC nvarchar(30) NOT NULL,
            NM_PROC nvarchar(100) NOT NULL,
            NO_SEQ int NOT NULL,
            YN_USE char(1) NOT NULL CONSTRAINT CK_MST_PROCESS_USE CHECK (YN_USE IN ('Y', 'N')),
            CD_USER_REG nvarchar(50) NOT NULL,
            TM_REG datetime2(3) NOT NULL,
            CD_USER_AMD nvarchar(50) NOT NULL,
            TM_AMD datetime2(3) NOT NULL,
            CONSTRAINT PK_MST_PROCESS PRIMARY KEY (CD_FIRM, CD_PROC)
        );

    IF OBJECT_ID(N'POC.MST_EQUIPMENT', N'U') IS NULL
        CREATE TABLE POC.MST_EQUIPMENT
        (
            CD_FIRM nvarchar(10) NOT NULL,
            CD_EQUIP nvarchar(30) NOT NULL,
            NM_EQUIP nvarchar(100) NOT NULL,
            CD_LINE nvarchar(30) NOT NULL,
            YN_USE char(1) NOT NULL CONSTRAINT CK_MST_EQUIPMENT_USE CHECK (YN_USE IN ('Y', 'N')),
            CD_USER_REG nvarchar(50) NOT NULL,
            TM_REG datetime2(3) NOT NULL,
            CD_USER_AMD nvarchar(50) NOT NULL,
            TM_AMD datetime2(3) NOT NULL,
            CONSTRAINT PK_MST_EQUIPMENT PRIMARY KEY (CD_FIRM, CD_EQUIP),
            CONSTRAINT FK_MST_EQUIPMENT_LINE FOREIGN KEY (CD_FIRM, CD_LINE) REFERENCES POC.MST_PRODUCTION_LINE (CD_FIRM, CD_LINE)
        );

    IF OBJECT_ID(N'POC.PRT_WO', N'U') IS NULL
        CREATE TABLE POC.PRT_WO
        (
            CD_FIRM nvarchar(10) NOT NULL,
            NO_WO nvarchar(30) NOT NULL,
            DT_WO date NOT NULL,
            CD_ITEM nvarchar(30) NOT NULL,
            NM_ITEM nvarchar(100) NOT NULL,
            STND_ITEM nvarchar(100) NULL,
            UNIT_ITEM nvarchar(20) NULL,
            QT_WO decimal(18,4) NOT NULL,
            QT_RESULT decimal(18,4) NOT NULL CONSTRAINT DF_PRT_WO_QT_RESULT DEFAULT (0),
            DT_PLAN_START date NOT NULL,
            DT_PLAN_END date NOT NULL,
            CD_LINE nvarchar(30) NOT NULL,
            NM_LINE nvarchar(100) NOT NULL,
            ST_WO nvarchar(20) NOT NULL,
            YN_URGENT char(1) NOT NULL CONSTRAINT DF_PRT_WO_YN_URGENT DEFAULT ('N'),
            DC_RMK nvarchar(500) NULL,
            CD_USER_REG nvarchar(50) NOT NULL,
            TM_REG datetime2(3) NOT NULL,
            CD_USER_AMD nvarchar(50) NOT NULL,
            TM_AMD datetime2(3) NOT NULL,
            CONSTRAINT PK_PRT_WO PRIMARY KEY (CD_FIRM, NO_WO),
            CONSTRAINT FK_PRT_WO_LINE FOREIGN KEY (CD_FIRM, CD_LINE) REFERENCES POC.MST_PRODUCTION_LINE (CD_FIRM, CD_LINE)
        );

    IF OBJECT_ID(N'POC.PRT_WOPROC', N'U') IS NULL
        CREATE TABLE POC.PRT_WOPROC
        (
            CD_FIRM nvarchar(10) NOT NULL,
            NO_WO nvarchar(30) NOT NULL,
            NO_PROC int NOT NULL,
            CD_PROC nvarchar(30) NOT NULL,
            NM_PROC nvarchar(100) NOT NULL,
            CD_EQUIP nvarchar(30) NULL,
            NM_EQUIP nvarchar(100) NULL,
            QT_PLAN decimal(18,4) NOT NULL,
            QT_RESULT decimal(18,4) NOT NULL CONSTRAINT DF_PRT_WOPROC_QT_RESULT DEFAULT (0),
            TM_PLAN_START datetime2(3) NOT NULL,
            TM_PLAN_END datetime2(3) NOT NULL,
            ST_PROC nvarchar(20) NOT NULL,
            DC_RMK nvarchar(500) NULL,
            CD_USER_REG nvarchar(50) NOT NULL,
            TM_REG datetime2(3) NOT NULL,
            CD_USER_AMD nvarchar(50) NOT NULL,
            TM_AMD datetime2(3) NOT NULL,
            CONSTRAINT PK_PRT_WOPROC PRIMARY KEY (CD_FIRM, NO_WO, NO_PROC),
            CONSTRAINT FK_PRT_WOPROC_WO FOREIGN KEY (CD_FIRM, NO_WO) REFERENCES POC.PRT_WO (CD_FIRM, NO_WO),
            CONSTRAINT FK_PRT_WOPROC_PROCESS FOREIGN KEY (CD_FIRM, CD_PROC) REFERENCES POC.MST_PROCESS (CD_FIRM, CD_PROC),
            CONSTRAINT FK_PRT_WOPROC_EQUIPMENT FOREIGN KEY (CD_FIRM, CD_EQUIP) REFERENCES POC.MST_EQUIPMENT (CD_FIRM, CD_EQUIP)
        );

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'POC.PRT_WO') AND name = N'IX_PRT_WO_SEARCH')
        CREATE INDEX IX_PRT_WO_SEARCH ON POC.PRT_WO (CD_FIRM, DT_WO, ST_WO, CD_LINE, YN_URGENT);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'POC.PRT_WOPROC') AND name = N'IX_PRT_WOPROC_PROCESS')
        CREATE INDEX IX_PRT_WOPROC_PROCESS ON POC.PRT_WOPROC (CD_FIRM, CD_PROC, CD_EQUIP);

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
