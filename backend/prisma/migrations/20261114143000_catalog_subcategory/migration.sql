-- Groups items inside one service (Men / Women / Kids under dry cleaning,
-- Home Items / Sofa Cleaning / Carpet Cleaning under household). The customer
-- app renders these as tabs; null means the service shows a flat list.
ALTER TABLE "CatalogItem" ADD COLUMN "subCategory" TEXT;
