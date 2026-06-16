# Configurazione PostgreSQL

```
podman volume create wa-send-v2-pgdata
```

```
podman run -d \
    --name wa-send-v2-postgres \
    -e POSTGRES_DB=wa-send-v2 \
    -e POSTGRES_USER=wa-send-v2 \
    -e POSTGRES_PASSWORD=wa-send-v2 \
    -v wa-send-v2-pgdata:/var/lib/postgresql/data:Z \
    -p 5432:5432 \
    --restart unless-stopped \
    docker.io/library/postgres:17
```

Accesso istanza psql

```
podman exec -it wa-send-v2-postgres psql -U wa-send-v2 -d wa-send-v2
```

Per configurare l'autenticazione con JWT, è necessario popolare la tabella configurazioni con una riga:

```
INSERT INTO "configurazioni" (chiave, valore) VALUES ('PASSWORD', 'eae889ceda1452b34555b2b52b9f05d28a1e8ed8d5dc8c62362b90ee49746af1b99bf53cb3e58323d29c1dcc5b1203e45f824d10d87b1a63b9d6eec59a2f6740');
```

Questa riga equivale alla stringa 'adminpassword' convertita in SHA-512

## Prisma (migration iniziale)

```
npm install
```

```
npx prisma generate
```

Prima migration dello schema (solo prima volta)

```
npx prisma migrate dev
```

Allineamenti successivi al primo

```
npx prisma db push
```

# Run applicazione

```
npm run dev
```