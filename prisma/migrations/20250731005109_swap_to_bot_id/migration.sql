/*
  Warnings:

  - You are about to drop the column `recordingId` on the `Meeting` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Meeting" DROP COLUMN "recordingId",
ADD COLUMN     "botId" TEXT NOT NULL DEFAULT '';
