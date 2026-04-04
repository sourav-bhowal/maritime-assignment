/*
  Warnings:

  - The values [N/A] on the enum `ApplicableRole` will be removed. If these variants are still used in the database, this will fail.
  - The values [N/A] on the enum `DrugTestResult` will be removed. If these variants are still used in the database, this will fail.
  - The values [N/A] on the enum `FitnessResult` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ApplicableRole_new" AS ENUM ('DECK', 'ENGINE', 'BOTH', 'NA');
ALTER TABLE "extractions" ALTER COLUMN "applicableRole" TYPE "ApplicableRole_new" USING ("applicableRole"::text::"ApplicableRole_new");
ALTER TYPE "ApplicableRole" RENAME TO "ApplicableRole_old";
ALTER TYPE "ApplicableRole_new" RENAME TO "ApplicableRole";
DROP TYPE "public"."ApplicableRole_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "DrugTestResult_new" AS ENUM ('NEGATIVE', 'POSITIVE', 'NA');
ALTER TABLE "extraction_medical" ALTER COLUMN "drugTestResult" TYPE "DrugTestResult_new" USING ("drugTestResult"::text::"DrugTestResult_new");
ALTER TYPE "DrugTestResult" RENAME TO "DrugTestResult_old";
ALTER TYPE "DrugTestResult_new" RENAME TO "DrugTestResult";
DROP TYPE "public"."DrugTestResult_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "FitnessResult_new" AS ENUM ('FIT', 'UNFIT', 'NA');
ALTER TABLE "extraction_medical" ALTER COLUMN "fitnessResult" TYPE "FitnessResult_new" USING ("fitnessResult"::text::"FitnessResult_new");
ALTER TYPE "FitnessResult" RENAME TO "FitnessResult_old";
ALTER TYPE "FitnessResult_new" RENAME TO "FitnessResult";
DROP TYPE "public"."FitnessResult_old";
COMMIT;
