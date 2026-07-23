-- DropTable
DROP TABLE IF EXISTS "sessioni";

-- Insert Default Configurations if not exists
INSERT INTO "configurazioni" ("chiave", "valore")
VALUES ('URL_LYBRO_APP', 'https://smslnk.it/pl/?t=')
ON CONFLICT ("chiave") DO NOTHING;

INSERT INTO "configurazioni" ("chiave", "valore")
VALUES ('TEMPLATE_AVVISO_LIBRI_PRENOTATI', 'Gentile cliente, la informiamo che sono disponibili nuovi libri da Lei prenotati per {{1}}. Maggiori dettagli al link > {{2}}. Cordiali saluti.')
ON CONFLICT ("chiave") DO NOTHING;
