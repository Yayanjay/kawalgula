-- CreateEnum
CREATE TYPE "TreatmentStatus" AS ENUM ('active', 'completed', 'dropped_out');

-- AlterTable
ALTER TABLE "patients" ADD COLUMN "treatment_status" "TreatmentStatus" NOT NULL DEFAULT 'active';
