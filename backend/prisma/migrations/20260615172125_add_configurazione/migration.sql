-- CreateTable
CREATE TABLE "configurazioni" (
    "chiave" VARCHAR(2048) NOT NULL,
    "valore" VARCHAR(2048) NOT NULL,

    CONSTRAINT "configurazioni_pkey" PRIMARY KEY ("chiave")
);
