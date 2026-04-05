-- AlterTable
ALTER TABLE "extractions" ADD COLUMN     "detectionReason" TEXT,
ADD COLUMN     "isRequired" BOOLEAN;

-- CreateTable
CREATE TABLE "extraction_compliance" (
    "extractionId" TEXT NOT NULL,
    "issuingAuthority" TEXT,
    "regulationReference" TEXT,
    "imoModelCourse" TEXT,
    "recognizedAuthority" BOOLEAN,
    "limitations" TEXT,

    CONSTRAINT "extraction_compliance_pkey" PRIMARY KEY ("extractionId")
);

-- AddForeignKey
ALTER TABLE "extraction_compliance" ADD CONSTRAINT "extraction_compliance_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
