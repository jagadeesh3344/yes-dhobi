-- CreateEnum
CREATE TYPE "VendorRequestStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchKind" AS ENUM ('RIDER_PICKUP', 'RIDER_DELIVERY', 'VENDOR');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'EXHAUSTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "serviceCategoryIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "VendorRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "VendorRequestStatus" NOT NULL DEFAULT 'OFFERED',
    "distanceKm" DOUBLE PRECISION,
    "payout" DECIMAL(12,2) NOT NULL,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,

    CONSTRAINT "VendorRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "DispatchKind" NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "candidates" TEXT[],
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "currentOfferId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "radiusKm" DOUBLE PRECISION,
    "round" INTEGER NOT NULL DEFAULT 1,
    "exhaustedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorRequest_vendorId_status_idx" ON "VendorRequest"("vendorId", "status");

-- CreateIndex
CREATE INDEX "VendorRequest_orderId_status_idx" ON "VendorRequest"("orderId", "status");

-- CreateIndex
CREATE INDEX "Dispatch_status_expiresAt_idx" ON "Dispatch"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Dispatch_orderId_kind_status_idx" ON "Dispatch"("orderId", "kind", "status");

-- AddForeignKey
ALTER TABLE "VendorRequest" ADD CONSTRAINT "VendorRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRequest" ADD CONSTRAINT "VendorRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
