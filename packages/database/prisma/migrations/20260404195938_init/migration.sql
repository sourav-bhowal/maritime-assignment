-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExtractionFieldImportance" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ExtractionFieldStatus" AS ENUM ('OK', 'EXPIRED', 'WARNING', 'MISSING');

-- CreateEnum
CREATE TYPE "ExtractionFlagSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('APPROVED', 'CONDITIONAL', 'REJECTED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extraction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "documentType" TEXT,
    "documentName" TEXT,
    "category" TEXT,
    "applicableRole" TEXT,
    "confidence" TEXT,
    "holderName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "passportNumber" TEXT,
    "sirbNumber" TEXT,
    "summary" TEXT,
    "isExpired" BOOLEAN NOT NULL DEFAULT false,
    "processingTimeMs" INTEGER,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'COMPLETE',
    "rawLlmResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionField" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "importance" "ExtractionFieldImportance" NOT NULL,
    "status" "ExtractionFieldStatus" NOT NULL,

    CONSTRAINT "ExtractionField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionValidity" (
    "extractionId" TEXT NOT NULL,
    "dateOfIssue" TIMESTAMP(3),
    "dateOfExpiry" TIMESTAMP(3),
    "isExpired" BOOLEAN,
    "daysUntilExpiry" INTEGER,
    "revalidationRequired" BOOLEAN,

    CONSTRAINT "ExtractionValidity_pkey" PRIMARY KEY ("extractionId")
);

-- CreateTable
CREATE TABLE "ExtractionMedical" (
    "extractionId" TEXT NOT NULL,
    "fitnessResult" TEXT,
    "drugTestResult" TEXT,
    "restrictions" TEXT,
    "specialNotes" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "ExtractionMedical_pkey" PRIMARY KEY ("extractionId")
);

-- CreateTable
CREATE TABLE "ExtractionFlag" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "severity" "ExtractionFlagSeverity" NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "ExtractionFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "extractionId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Validation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "overallStatus" "ValidationStatus",
    "overallScore" INTEGER,
    "summary" TEXT,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Validation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Extraction_sessionId_idx" ON "Extraction"("sessionId");

-- CreateIndex
CREATE INDEX "Extraction_documentType_idx" ON "Extraction"("documentType");

-- CreateIndex
CREATE INDEX "Extraction_isExpired_idx" ON "Extraction"("isExpired");

-- CreateIndex
CREATE UNIQUE INDEX "Extraction_sessionId_fileHash_key" ON "Extraction"("sessionId", "fileHash");

-- CreateIndex
CREATE INDEX "ExtractionField_extractionId_idx" ON "ExtractionField"("extractionId");

-- CreateIndex
CREATE INDEX "ExtractionField_key_idx" ON "ExtractionField"("key");

-- CreateIndex
CREATE INDEX "ExtractionFlag_extractionId_idx" ON "ExtractionFlag"("extractionId");

-- CreateIndex
CREATE INDEX "ExtractionFlag_severity_idx" ON "ExtractionFlag"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "Job_extractionId_key" ON "Job"("extractionId");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_sessionId_idx" ON "Job"("sessionId");

-- CreateIndex
CREATE INDEX "Validation_sessionId_idx" ON "Validation"("sessionId");

-- AddForeignKey
ALTER TABLE "Extraction" ADD CONSTRAINT "Extraction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionField" ADD CONSTRAINT "ExtractionField_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "Extraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionValidity" ADD CONSTRAINT "ExtractionValidity_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "Extraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionMedical" ADD CONSTRAINT "ExtractionMedical_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "Extraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionFlag" ADD CONSTRAINT "ExtractionFlag_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "Extraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "Extraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Validation" ADD CONSTRAINT "Validation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
