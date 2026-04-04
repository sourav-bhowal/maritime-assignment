/*
  Warnings:

  - The `fitnessResult` column on the `extraction_medical` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `drugTestResult` column on the `extraction_medical` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `documentType` column on the `extractions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `category` column on the `extractions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `applicableRole` column on the `extractions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `confidence` column on the `extractions` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('COC', 'COP_BT', 'COP_PSCRB', 'COP_AFF', 'COP_MEFA', 'COP_MECA', 'COP_SSO', 'COP_SDSD', 'ECDIS_GENERIC', 'ECDIS_TYPE', 'SIRB', 'PASSPORT', 'PEME', 'DRUG_TEST', 'YELLOW_FEVER', 'ERM', 'MARPOL', 'SULPHUR_CAP', 'BALLAST_WATER', 'HATCH_COVER', 'BRM_SSBT', 'TRAIN_TRAINER', 'HAZMAT', 'FLAG_STATE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('IDENTITY', 'CERTIFICATION', 'STCW_ENDORSEMENT', 'MEDICAL', 'TRAINING', 'FLAG_STATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicableRole" AS ENUM ('DECK', 'ENGINE', 'BOTH', 'N/A');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "FitnessResult" AS ENUM ('FIT', 'UNFIT', 'N/A');

-- CreateEnum
CREATE TYPE "DrugTestResult" AS ENUM ('NEGATIVE', 'POSITIVE', 'N/A');

-- AlterTable
ALTER TABLE "extraction_medical" DROP COLUMN "fitnessResult",
ADD COLUMN     "fitnessResult" "FitnessResult",
DROP COLUMN "drugTestResult",
ADD COLUMN     "drugTestResult" "DrugTestResult";

-- AlterTable
ALTER TABLE "extractions" DROP COLUMN "documentType",
ADD COLUMN     "documentType" "DocumentType",
DROP COLUMN "category",
ADD COLUMN     "category" "DocumentCategory",
DROP COLUMN "applicableRole",
ADD COLUMN     "applicableRole" "ApplicableRole",
DROP COLUMN "confidence",
ADD COLUMN     "confidence" "Confidence";

-- CreateIndex
CREATE INDEX "extractions_documentType_idx" ON "extractions"("documentType");
