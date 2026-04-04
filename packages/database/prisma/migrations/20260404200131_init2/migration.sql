/*
  Warnings:

  - You are about to drop the `Extraction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExtractionField` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExtractionFlag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExtractionMedical` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExtractionValidity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Job` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Validation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Extraction" DROP CONSTRAINT "Extraction_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "ExtractionField" DROP CONSTRAINT "ExtractionField_extractionId_fkey";

-- DropForeignKey
ALTER TABLE "ExtractionFlag" DROP CONSTRAINT "ExtractionFlag_extractionId_fkey";

-- DropForeignKey
ALTER TABLE "ExtractionMedical" DROP CONSTRAINT "ExtractionMedical_extractionId_fkey";

-- DropForeignKey
ALTER TABLE "ExtractionValidity" DROP CONSTRAINT "ExtractionValidity_extractionId_fkey";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_extractionId_fkey";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "Validation" DROP CONSTRAINT "Validation_sessionId_fkey";

-- DropTable
DROP TABLE "Extraction";

-- DropTable
DROP TABLE "ExtractionField";

-- DropTable
DROP TABLE "ExtractionFlag";

-- DropTable
DROP TABLE "ExtractionMedical";

-- DropTable
DROP TABLE "ExtractionValidity";

-- DropTable
DROP TABLE "Job";

-- DropTable
DROP TABLE "Session";

-- DropTable
DROP TABLE "Validation";

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extractions" (
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

    CONSTRAINT "extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_fields" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "importance" "ExtractionFieldImportance" NOT NULL,
    "status" "ExtractionFieldStatus" NOT NULL,

    CONSTRAINT "extraction_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_validity" (
    "extractionId" TEXT NOT NULL,
    "dateOfIssue" TIMESTAMP(3),
    "dateOfExpiry" TIMESTAMP(3),
    "isExpired" BOOLEAN,
    "daysUntilExpiry" INTEGER,
    "revalidationRequired" BOOLEAN,

    CONSTRAINT "extraction_validity_pkey" PRIMARY KEY ("extractionId")
);

-- CreateTable
CREATE TABLE "extraction_medical" (
    "extractionId" TEXT NOT NULL,
    "fitnessResult" TEXT,
    "drugTestResult" TEXT,
    "restrictions" TEXT,
    "specialNotes" TEXT,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "extraction_medical_pkey" PRIMARY KEY ("extractionId")
);

-- CreateTable
CREATE TABLE "extraction_flags" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "severity" "ExtractionFlagSeverity" NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "extraction_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
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

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "overallStatus" "ValidationStatus",
    "overallScore" INTEGER,
    "summary" TEXT,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extractions_sessionId_idx" ON "extractions"("sessionId");

-- CreateIndex
CREATE INDEX "extractions_documentType_idx" ON "extractions"("documentType");

-- CreateIndex
CREATE INDEX "extractions_isExpired_idx" ON "extractions"("isExpired");

-- CreateIndex
CREATE UNIQUE INDEX "extractions_sessionId_fileHash_key" ON "extractions"("sessionId", "fileHash");

-- CreateIndex
CREATE INDEX "extraction_fields_extractionId_idx" ON "extraction_fields"("extractionId");

-- CreateIndex
CREATE INDEX "extraction_fields_key_idx" ON "extraction_fields"("key");

-- CreateIndex
CREATE INDEX "extraction_flags_extractionId_idx" ON "extraction_flags"("extractionId");

-- CreateIndex
CREATE INDEX "extraction_flags_severity_idx" ON "extraction_flags"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_extractionId_key" ON "jobs"("extractionId");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_sessionId_idx" ON "jobs"("sessionId");

-- CreateIndex
CREATE INDEX "validations_sessionId_idx" ON "validations"("sessionId");

-- AddForeignKey
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_fields" ADD CONSTRAINT "extraction_fields_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_validity" ADD CONSTRAINT "extraction_validity_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_medical" ADD CONSTRAINT "extraction_medical_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_flags" ADD CONSTRAINT "extraction_flags_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validations" ADD CONSTRAINT "validations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
