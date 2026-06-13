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

## Prisma (migration iniziale)

```
npm install
```

```
npx prisma generate
```

```
npx prisma migrate dev
```

# Run applicazione

```
npm run dev
```