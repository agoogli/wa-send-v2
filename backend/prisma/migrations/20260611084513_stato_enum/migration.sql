/*
  Warnings:

  - The `stato` column on the `righe_messaggi` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "StatoMessaggio" AS ENUM ('IMPORTATO', 'PENDING', 'INVIATO', 'ERRORE');

-- AlterTable
ALTER TABLE "righe_messaggi" DROP COLUMN "stato",
ADD COLUMN     "stato" "StatoMessaggio" NOT NULL DEFAULT 'IMPORTATO';
