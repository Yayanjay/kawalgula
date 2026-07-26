-- CreateEnum
CREATE TYPE "BlastStatus" AS ENUM ('draft', 'sending', 'sent', 'cancelled');

-- CreateEnum
CREATE TYPE "BlastRecipientStatus" AS ENUM ('pending', 'sent', 'failed');

-- AlterEnum
ALTER TYPE "OutboundKind" ADD VALUE 'blast';

-- CreateTable
CREATE TABLE "blasts" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "media_url" TEXT,
    "media_type" TEXT,
    "status" "BlastStatus" NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blast_recipients" (
    "id" TEXT NOT NULL,
    "blast_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "patient_name" TEXT NOT NULL,
    "wa_number" TEXT NOT NULL,
    "status" "BlastRecipientStatus" NOT NULL DEFAULT 'pending',
    "waha_message_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blast_recipients_blast_id_idx" ON "blast_recipients"("blast_id");

-- CreateIndex
CREATE INDEX "blast_recipients_patient_id_idx" ON "blast_recipients"("patient_id");

-- AddForeignKey
ALTER TABLE "blasts" ADD CONSTRAINT "blasts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_recipients" ADD CONSTRAINT "blast_recipients_blast_id_fkey" FOREIGN KEY ("blast_id") REFERENCES "blasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blast_recipients" ADD CONSTRAINT "blast_recipients_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
