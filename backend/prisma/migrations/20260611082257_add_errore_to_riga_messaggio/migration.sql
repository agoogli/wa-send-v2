-- CreateTable
CREATE TABLE "import_messaggi" (
    "id" SERIAL NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_messaggi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "righe_messaggi" (
    "id" SERIAL NOT NULL,
    "testo" TEXT NOT NULL,
    "nominativo" TEXT NOT NULL,
    "cellulare" TEXT NOT NULL,
    "link" TEXT NOT NULL DEFAULT '',
    "codice" VARCHAR(255) NOT NULL DEFAULT '',
    "id_app" VARCHAR(255) NOT NULL DEFAULT '',
    "stato" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "errore" VARCHAR(4096),
    "id_import_messaggio" INTEGER NOT NULL,

    CONSTRAINT "righe_messaggi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessioni" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessioni_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "righe_messaggi" ADD CONSTRAINT "righe_messaggi_id_import_messaggio_fkey" FOREIGN KEY ("id_import_messaggio") REFERENCES "import_messaggi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
