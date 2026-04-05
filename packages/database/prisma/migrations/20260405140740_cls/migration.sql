/*
  Warnings:

  - The `revalidationRequired` column on the `extraction_validity` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "extraction_validity" DROP COLUMN "revalidationRequired",
ADD COLUMN     "revalidationRequired" BOOLEAN;
