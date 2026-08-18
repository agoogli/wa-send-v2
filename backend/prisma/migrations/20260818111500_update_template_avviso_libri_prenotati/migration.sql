-- Update TEMPLATE_AVVISO_LIBRI_PRENOTATI in configurazioni table
UPDATE "configurazioni"
SET "valore" = 'Gentile cliente, la informiamo che sono disponibili nuovi libri da Lei prenotati per {{1}}. Cordiali saluti.'
WHERE "chiave" = 'TEMPLATE_AVVISO_LIBRI_PRENOTATI';
