-- CreateEnum
CREATE TYPE "ChatParty" AS ENUM ('CUSTOMER', 'RIDER', 'VENDOR', 'ADMIN');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryArrivedAt" TIMESTAMP(3),
ADD COLUMN     "pickupArrivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderMessage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "thread" TEXT NOT NULL,
    "senderRole" "ChatParty" NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderMessage_orderId_thread_createdAt_idx" ON "OrderMessage"("orderId", "thread", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderMessage" ADD CONSTRAINT "OrderMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMessage" ADD CONSTRAINT "OrderMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
