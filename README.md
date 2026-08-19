# Ambiente Dev

## Configurazione PostgreSQL

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

## Run applicazione

```
npm run dev
```

<br />
<br />

# Ambiente Produzione - Linee guida generali


## Comandi utili


```
podman-compose stop backend
```

```
podman-compose start backend
```

```
podman-compose restart backend
```

### Log

Stampa le ultime 50 righe e segue i logs successivi

```
podman logs --tail 50 -f wa-send-db
```

Solo ultimi 10 minuti

```
podman logs -f --since 10m wa-send-db
```

Stampa le loggate dell'intero pod

```
podman pod logs -f my-pod
```

### Security

Monitorare le porte in ascolto sull'interfaccia pubblica del server

```
sudo ss -tulpn
```

Abilitare l'accesso ssh con sola chiave

```
mkdir -p ~/.ssh
vim ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
sudo vim /etc/ssh/sshd_config
```

Dentro il file settare le righe con i valori seguenti

```
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
```

Poi verificare la sintassi del file con

```
sudo sshd -t
sudo systemctl restart sshd
```

Oppure, se esistono degli override del provider, crearne uno con un nome che inneschi la priorità

```
sudo bash -c 'cat <<EOF > /etc/ssh/sshd_config.d/00-override.conf
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF'
sudo systemctl restart sshd
```

Settare ufw per abilitare solo la porta 22 e bloccare tutto il resto in entrata

```
sudo pacman -S ufw
sudo ufw allow 22/tcp
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
sudo ufw status
```

### Primo deploy dei pods (installazione ambiente podman)

Creare una directory 'wa-send-v2' sul server.

Con scp effettuare upload dei files

```
podman-compose.yml 
.env
```

```
sudo pacman -Sy podman podman-compose
```

Se torna errore relativo al file system btrfs

```
sudo pacman -S fuse-overlayfs
podman system reset --force
mkdir -p ~/.config/containers
cat << 'EOF' > ~/.config/containers/storage.conf
[storage]
driver = "overlay"
[storage.options.overlay]
mount_program = "/usr/bin/fuse-overlayfs"
EOF
```

A questo punto il comando dovrebbe funzionare

```
podman info
```

Entrare nella directory wa-send-v2 e dare i comandi

```
podman-compose pull
podman-compose up -d
```

Se dovessero mancare i moduli del kernel caricati per la rete podman:

```
sudo modprobe bridge
sudo modprobe veth
echo -e "bridge\nveth" | sudo tee /etc/modules-load.d/podman-network.conf
```

e ripetere

```
podman-compose up -d
```

Installare infine

```
sudo pacman -S cloudflared
sudo cloudflared service install '...KEY...'
```

Controllare il corretto avvio dei pods

```
podman logs -f wa-send-backend
```

## Come aggiornare il codice (Backend e Frontend) in produzione

Grazie al volume persistente che abbiamo configurato nel file podman-compose.yml:

i dati effettivi del database risiedono sul disco del server ospitante (gestito da Podman) e non dentro il container. Questo significa che puoi distruggere, ricreare o aggiornare i container a piacimento: i dati rimarranno intatti.

Per aggiornare l'applicazione in produzione senza toccare minimamente il database, segui questi passaggi sul server:

Se usi il registro delle immagini (CI/CD / Ibrido)

Esegui il pull solo per le nuove immagini di backend e frontend:

```
podman-compose pull backend frontend
```

Riavvia solo i container di backend e frontend tramite l'opzione --no-deps:

```
podman-compose up -d --force-recreate --no-deps backend frontend
```

Nota: L'opzione --no-deps impedisce il riavvio o la ricreazione del container del database (db), garantendo che il DB rimanga sempre attivo durante l'aggiornamento dell'applicazione.

## Scenario A: Aggiornamento del Container Database (es. aggiornamento versione di Postgres)

Se modifichi la versione dell'immagine (es. da postgres:15-alpine a una versione successiva) e ricrei il container con podman-compose up -d db:

Podman distrugge il vecchio container ma conserva intatto il volume postgres_data.
Al riavvio, il nuovo container PostgreSQL monterà lo stesso volume e caricherà tutti i dati esattamente da dove erano rimasti.
(Regola generale: Gli aggiornamenti di versione "minor" es. 15.1 -> 15.2 sono trasparenti; solo per i passaggi "major" es. da Postgres 15 a 16 è consigliabile fare un backup preventivo pg_dump prima di procedere).

## Scenario B: Aggiornamento dello Schema Database (es. nuovi campi o nuove tabelle)

Nel backend/Dockerfile abbiamo impostato il comando di avvio per eseguire automaticamente la sincronizzazione di Prisma:

Prisma non cancella mai i dati esistenti durante questa procedura (a meno che tu non abbia esplicitamente eliminato una tabella o una colonna dallo schema, operazione per la quale Prisma ti avviserebbe comunque bloccando il comando se c'è rischio di perdita dati).

Come applicare la Migration
A) In ambiente locale / Development:
In sviluppo, quando il container o il servizio PostgreSQL è in esecuzione sulla porta 5432 locale, ti basta eseguire dal terminale nella cartella principale del monorepo:

bash


npm run prisma:push -w backend
oppure:

bash


npx prisma migrate dev -w backend
Questo comando sincronizza lo schema rimuovendo la tabella sessioni ed inserendo le righe iniziali in configurazioni.

B) In ambiente di Produzione:
In produzione ci sono tre modalità standard a seconda di come gestisci il deploy:

Tramite Podman / Docker Compose (Automatizzato - Consigliato): Nel tuo file Dockerfile del backend o nel comando di startup di podman-compose.yml, è possibile configurare il comando di boot:

bash


npx prisma migrate deploy -w backend
Quando lanci podman-compose up -d, Prisma verificherà le migration pendenti nella cartella prisma/migrations/ ed applicherà automaticamente la nuova migration al database PostgreSQL di produzione.

Manualmente tramite CLI sul server di produzione: Dalla directory di deploy sul server di produzione:

bash


npx prisma migrate deploy -w backend
Esecuzione diretta dello script SQL tramite psql / Client Database: Se gestisci il database di produzione tramite psql o un client grafico (DBeaver, PgAdmin), puoi eseguire direttamente l'istruzione SQL del file 
migration.sql
 riportato sopra.


## 💡 Consiglio di Sicurezza (Best Practice)
Anche se il sistema è sicuro, prima di fare qualsiasi migrazione di schema complessa in produzione, è sempre una buona abitudine fare un backup rapido dei dati. Puoi farlo direttamente dal server con questo comando:

```
podman exec -t wa-send-db pg_dump -U wa-send-v2 wa-send-v2 > backup_db_$(date +%F).sql
```

Questo genererà un file .sql sul tuo server con l'esatta istantanea del database da conservare per sicurezza.

## Start on boot

Sono possibili due strade: systemd o quadlet.

podman-compose -> test/sviluppo
systemd -> boot persistente
quadlet -> boot persistente, ma più idoneo

Ci assicura che dopo il logout dell'utente corrente, i pods avviati rimangano in background:

```
sudo loginctl enable-linger <utente>
```

Salva la configurazione per agire con i pod su porte inferiori alla 1024, e applica questa configurazione al boot

```
echo "net.ipv4.ip_unprivileged_port_start=80" | sudo tee /etc/sysctl.d/99-podman-privileged-ports.conf
sudo sysctl --system
```