# Synchronisation offline-first chiffrée de bout en bout

**Date:** 2026-08-20
**Statut:** Validé
**Dépôts concernés:** `usagi` (client Tauri 2) et `usagi-server` (NestJS 11)

## Objectif

Permettre à un utilisateur de synchroniser ses tâches entre plusieurs appareils via un
serveur qu'il choisit, sans que ce serveur puisse lire le contenu de ses données.

La synchronisation est **optionnelle**. Bunly reste une application purement locale tant
qu'aucun serveur n'est configuré.

## Décisions structurantes

| Sujet | Décision |
|---|---|
| Moteur de sync | Implémentation propre sur NestJS. Ni ElectricSQL, ni CRDT. |
| Périmètre v1 | Mono-utilisateur, multi-appareils. Schéma préparé pour le partage. |
| Authentification | Email + mot de passe, JWT court + refresh token révocable par appareil. |
| Chiffrement | E2EE. Le serveur ne peut pas lire le contenu. |
| Récupération | Clé de récupération de 24 mots affichée à l'inscription. |
| Partage futur | Paire X25519 générée par compte dès la v1. |
| Fusion | LWW par champ, avec carte de timestamps embarquée dans le blob chiffré. |
| Ordonnancement | Indexation fractionnaire (clé texte) en remplacement de `sort_order INTEGER`. |
| Déploiement | Serveur auto-hébergeable. Docker, `.env.example`, CLI de création de compte. |

### Pourquoi pas ElectricSQL

Le README d'usagi annonçait ElectricSQL en Phase 2. Écarté pour trois raisons :

1. Electric ne couvre que le chemin de lecture. Sa documentation est explicite :
   *« Electric focuses on read-path sync... It does not offer a built-in solution for
   write-path sync »*. La partie difficile de l'offline-first (file d'écritures durable,
   application optimiste, rollback, résolution de conflits) reste entièrement à écrire.
2. Le client Electric actuel cible PGlite et TanStack DB. Le modèle « electrify your
   SQLite » a été abandonné lors de la réécriture *Electric Next*. La couche SQLite
   existante d'usagi (`tauri-plugin-sql`, repository de 713 lignes, 6 migrations,
   plus de 1000 lignes de tests) devrait être jetée ou dupliquée.
3. Electric exige un service Elixir supplémentaire et un Postgres en `wal_level=logical`.
   Sa valeur est le fan-out CDN de shapes partagées vers de nombreux lecteurs. Bunly a
   un utilisateur et deux ou trois appareils.

Le choix du framework backend est par ailleurs orthogonal à Electric, qui est un service
autonome piloté en HTTP : NestJS aurait convenu dans les deux scénarios.

---

## 1. Architecture client

Le moteur de sync **observe** `SqliteRepository`, il ne le remplace pas. L'UI et les
stores Zustand sont inchangés. Les écritures restent locales et synchrones.

```
Zustand stores ──▶ TodoRepository (interface, inchangée)
                          │
                   SqliteRepository
                          │  écrit
                          ▼
                    SQLite local
                    ├── tasks / projects / tags / project_groups
                    ├── sync_outbox      ← alimentée par TRIGGERS
                    └── sync_state       (curseur, device_id, server_url)
                          ▲
                          │ lit / applique
                    SyncEngine  ◀──▶  commandes Rust (crypto)
                          │
                          ▼  HTTPS
                    usagi-server
```

### 1.1 Outbox alimentée par triggers

```sql
CREATE TABLE sync_outbox (
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  dirtied_at  TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)   -- INSERT OR REPLACE ⇒ dédup naturelle
);
```

Un trigger `AFTER INSERT/UPDATE/DELETE` sur chaque table synchronisée y insère une ligne.

Trois bénéfices : le marquage est dans la même transaction que l'écriture (un crash ne
peut pas perdre un changement), aucune modification du repository n'est nécessaire, et
toute écriture future est automatiquement couverte.

L'outbox est un **ensemble de lignes sales, pas un journal d'opérations**. La sync est
*state-based* : au push, on lit l'état courant de la ligne et on l'envoie. Un push qui
échoue se rejoue à l'identique — l'idempotence est acquise par construction.

### 1.2 Colonnes ajoutées aux tables synchronisées

Tables concernées : `tasks`, `projects`, `tags`, `project_groups`.

| Colonne | Rôle |
|---|---|
| `field_updated_at TEXT` | JSON `{"title":"2026-…","due_date":"2026-…"}`, base du LWW par champ |
| `purged_at TEXT` | Tombstone de suppression définitive |

> **Correction (2026-08-20, après implémentation du plan 1).** Ce paragraphe affirmait
> que `field_updated_at` était le **seul** point de `SqliteRepository` à modifier, au
> motif que `updateTask(id, patch)` reçoit déjà la liste des champs modifiés. **C'est
> faux.** Six autres méthodes écrivent des colonnes régies par le LWW sans passer par
> `updateTask` : `archiveTask` / `unarchiveTask` (`deleted_at`), `completeTask` /
> `uncompleteTask` (`completed_at`), `moveTasksToProject` (`project_id`) et
> `reorderTasks` (`sort_key`, `sort_order`). Un moteur de fusion construit sur
> l'affirmation d'origine ne verrait jamais l'archivage, la complétion ni le
> déplacement comme des changements de champ. Voir la liste de prérequis en fin de
> document.

`updateTask(id, patch)` reçoit exactement la liste des champs modifiés et constitue
donc le point d'entrée naturel de l'estampillage — mais pas le seul à instrumenter.

### 1.3 Archivé vs purgé

Le schéma actuel a un conflit sémantique à lever : `deleted_at` signifie « archivé »
(visible dans la vue Archives, restaurable), tandis que `deleteTask()`
([sqlite-repository.ts:577](../../../src/db/sqlite-repository.ts)) supprime
physiquement la ligne. Une ligne physiquement supprimée ne peut pas être propagée.

- **Archivé** — `deleted_at` non nul. Champ ordinaire, soumis au LWW.
- **Purgé** — `purged_at` non nul. La ligne est conservée comme tombstone, filtrée par
  l'UI, envoyée au serveur sans payload chiffré.

### 1.4 Ordonnancement fractionnaire

`sort_order INTEGER` doit devenir une clé texte fractionnaire (`"a0"`, `"a0V"`, `"a1"`…).

Aujourd'hui, réordonner une liste renumérote toutes les lignes : deux appareils qui
réordonnent hors ligne produisent un conflit sur **chaque** tâche. Avec une clé
fractionnaire, déplacer une tâche ne modifie **qu'une seule ligne**. Le conflit disparaît
structurellement au lieu d'être arbitré.

Concerne `tasks.sort_order`, `projects.sort_order`, `project_groups.sort_order`.

### 1.5 Disparition de `task_tags` du protocole

`task_tags` n'a ni timestamp ni soft delete : retirer un tag d'une tâche est aujourd'hui
invisible pour la sync. Plutôt que d'y ajouter des tombstones, la liste des tags est
**embarquée dans le blob chiffré de la tâche** (tableau d'IDs, traité comme un champ
ordinaire par le LWW).

La table locale `task_tags` reste inchangée pour les requêtes. Seul le format de sync
diffère. Le client la reconstruit à partir du champ `tags` après chaque merge.

---

## 2. Modèle cryptographique

### 2.1 Dérivation des clés

```
password + email
      │
      ├─ Argon2id ──▶ masterKey ─┬─ Argon2id ──▶ authVerifier ──▶ serveur
      │                          │                (le serveur en stocke un hash)
      │                          └─ HKDF ──────▶ KEK   (ne sort jamais de l'appareil)
      │
DEK (32 octets aléatoires)  ──chiffrée par KEK───────▶ wrapped_dek           ─▶ serveur
                            ──chiffrée par recovery─▶ wrapped_dek_recovery   ─▶ serveur
X25519 keypair              ──privée chiffrée par DEK─▶ wrapped_private_key  ─▶ serveur
                              publique en clair       ─▶ public_key
```

Le mot de passe ne quitte jamais l'appareil.

L'indirection DEK/KEK est ce qui rend le système utilisable :

- **Changer de mot de passe** ne ré-enveloppe qu'une clé de 32 octets, jamais les données.
- **Ajouter un appareil** est trivial : il se connecte, dérive la KEK, télécharge la
  `wrapped_dek`, la déballe. Aucun appairage par QR code.
- La clé privée X25519 est chiffrée par la **DEK** et non par la KEK, elle survit donc
  aussi à un changement de mot de passe.

La clé de récupération (24 mots) enveloppe une **seconde copie de la même DEK**.

Paramètres Argon2id : `m=64 MiB, t=3, p=4` (à figer dans `kdf_params` côté serveur pour
permettre une évolution ultérieure sans casser les comptes existants).

### 2.2 Chiffrement des enregistrements

XChaCha20-Poly1305, nonce aléatoire par chiffrement.

**AAD = `user_id ‖ entity_type ‖ entity_id`.** Ce détail n'est pas cosmétique : il empêche
un serveur malveillant de déplacer le blob d'une tâche vers une autre, ou de rejouer un
ancien enregistrement sous une identité différente.

Payload en clair avant chiffrement :

```json
{
  "_v": 1,
  "title": "Acheter du pain",
  "description": null,
  "priority": "high",
  "due_date": "2026-08-22",
  "project_id": "…",
  "sort_order": "a0V",
  "completed_at": null,
  "deleted_at": null,
  "tags": ["uuid-1", "uuid-2"],
  "_fields": {
    "title":    { "t": "2026-08-20T10:00:00Z", "d": "device-uuid-a" },
    "priority": { "t": "2026-08-20T11:30:00Z", "d": "device-uuid-b" }
  }
}
```

Chaque entrée de `_fields` porte **le timestamp `t` et l'appareil `d` qui a produit cette
écriture**. Le `device_id` est indispensable au départage des égalités (§5, règle 1) et doit être
attaché au champ, pas à l'enregistrement : la colonne `records.device_id` côté serveur
n'identifie que le dernier appareil ayant poussé la ligne, ce qui ne correspond pas
nécessairement à l'auteur d'un champ donné.

`_v` versionne le **format du payload chiffré** et évolue indépendamment du
`protocol_version` de l'API (§4).

### 2.3 La crypto s'exécute côté Rust

Crates : `argon2`, `chacha20poly1305`, `x25519-dalek`, `zeroize`.
Commandes Tauri exposées : `unlock`, `lock`, `encrypt_record`, `decrypt_record`,
`generate_recovery_key`.

Justification : Argon2id en WASM est plusieurs fois plus lent qu'en natif, ce qui pousse à
affaiblir les paramètres ; le matériel de clé n'apparaît jamais dans le tas JavaScript ni
dans un heap snapshot ; `zeroize` permet d'effacer réellement les clés au verrouillage.

Le projet a déjà des commandes Rust ([lib.rs](../../../src-tauri/src/lib.rs)),
ce n'est donc pas un nouveau paradigme.

### 2.4 Métadonnées visibles du serveur

En clair, inévitablement : UUID, type d'entité, séquence, horodatages de sync, volume,
et l'appartenance d'un enregistrement à un workspace. C'est le prix d'une sync
incrémentale.

---

## 3. Schéma serveur

**Postgres + Prisma.**

```
users        (id, email, auth_hash, auth_salt, kdf_params, created_at)
user_keys    (user_id, wrapped_dek, wrapped_dek_recovery,
              public_key, wrapped_private_key)
devices      (id, user_id, name, platform,
              refresh_token_hash, last_seen_at, revoked_at)
workspaces   (id, owner_id, seq_counter BIGINT, created_at)
records      (workspace_id, entity_type, id,
              seq BIGINT, ciphertext BYTEA, nonce BYTEA,
              purged BOOL, updated_at, device_id)
              PK    (workspace_id, entity_type, id)
              INDEX (workspace_id, seq)
```

`entity_type` ∈ { `task`, `project`, `tag`, `project_group` }.

`records.updated_at` est **l'heure de réception serveur**, pas une heure client : c'est une
métadonnée d'exploitation, jamais une entrée de la résolution de conflits. De même,
`records.device_id` n'identifie que le dernier appareil ayant poussé la ligne ; le
départage des conflits utilise exclusivement les `_fields` du payload déchiffré (§2.2).

Pour une ligne purgée, `ciphertext` et `nonce` sont nuls : un tombstone ne transporte
aucun contenu.

### 3.1 Crochet de partage

En v1, un utilisateur possède exactement un workspace. Pour ajouter la collaboration plus
tard, il suffira d'insérer :

```
workspace_members (workspace_id, user_id, wrapped_dek_for_member, role)
```

où `wrapped_dek_for_member` est la DEK du workspace enveloppée avec la clé publique X25519
du membre. **Ni le protocole, ni le schéma `records`, ni le client ne changent.**

### 3.2 Attribution des séquences — piège à éviter

Le `seq` est le curseur de pull. Un `BIGSERIAL` global serait un bug silencieux : deux
transactions concurrentes peuvent obtenir 100 et 101, et celle qui a 101 peut committer
**avant** celle qui a 100. Un client qui pull entre les deux voit 101, avance son curseur,
et ne verra **jamais** l'enregistrement 100. La perte est définitive et invisible.

**Parade obligatoire :** compteur par workspace, incrémenté sous verrou de ligne
(`SELECT seq_counter FROM workspaces WHERE id = ? FOR UPDATE`) dans la même transaction
que l'écriture des records. Cela sérialise les push d'un même workspace — sans conséquence
ici — et garantit que l'ordre des `seq` est exactement l'ordre des commits.

Ce point doit faire l'objet d'un test de non-régression dédié.

---

## 4. Protocole

```
GET  /v1/server-info                     (non authentifié)
  → { name, version, protocol_version, registration_enabled, min_client_version }

POST /v1/auth/prelogin                   (non authentifié)
  { email } → { salt, kdf_params }
POST /v1/auth/register                   (si registration_enabled, ou jeton d'invitation)
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout

GET  /v1/keys                            → wrapped_dek, wrapped_private_key, public_key
PUT  /v1/keys                            (changement de mot de passe)

GET  /v1/devices
DELETE /v1/devices/:id                   (révocation)

POST /v1/sync/push
  { changes: [ { entity_type, id, ciphertext, nonce, purged } ] }
  → { applied: [ { entity_type, id, seq } ], server_time }

GET  /v1/sync/pull?cursor=<seq>&limit=500
  → { records: [ … ], next_cursor, has_more, server_time }
```

> **Ajout (2026-08-21, lors de la rédaction du plan 2).** `prelogin` manquait à la
> version d'origine, ce qui rendait la connexion **impossible** : pour calculer son
> `authVerifier`, le client doit connaître le sel et les paramètres Argon2id du compte,
> qu'il ne peut obtenir qu'après s'être connecté — une dépendance circulaire.
>
> Contrainte de sécurité attachée : `prelogin` doit renvoyer des paramètres **plausibles
> et stables pour un email inconnu**, dérivés déterministiquement de l'email (par exemple
> HMAC(secret serveur, email) comme sel de leurre). Sans cela, l'endpoint devient un
> oracle d'énumération de comptes : une réponse différente entre email connu et inconnu
> suffit à cartographier les utilisateurs d'une instance.

### 4.0 Versionnage et compatibilité

`protocol_version` est un entier unique incrémenté à chaque changement incompatible de
l'API. **Le client refuse de synchroniser si `server_version.protocol_version` diffère de
celui qu'il implémente**, et affiche laquelle des deux parties doit être mise à jour, en
s'appuyant sur `min_client_version` (version minimale de client acceptée par le serveur,
au format semver).

Cette règle est volontairement stricte : le serveur étant auto-hébergé, un utilisateur peut
parfaitement faire tourner un client à jour contre un serveur oublié depuis un an. Mieux
vaut refuser franchement que synchroniser à moitié.

### 4.1 Ordre des opérations

**Toujours pull → merge → push.** On récupère d'abord, on fusionne localement, puis on
pousse l'état *fusionné*. L'ordre inverse ferait osciller les appareils entre deux états
pendant plusieurs cycles.

Le push est inconditionnel côté serveur : il écrase la ligne et attribue un nouveau `seq`.
Le serveur ne peut rien arbitrer, il ne lit pas le contenu.

### 4.2 Déclenchement (v1)

Au démarrage, au retour de focus de la fenêtre, toutes les 5 minutes, et 2 secondes après
une écriture locale (debounce). Pas de WebSocket : le temps réel est une amélioration
ultérieure qui ne modifie pas le protocole.

---

## 5. Résolution de conflits

Entièrement côté client, puisque le serveur ne lit pas le contenu.

1. **LWW par champ, départage déterministe.** Pour chaque champ, le timestamp le plus
   récent gagne. À égalité stricte, départage par comparaison lexicographique du
   `device_id`. Sans ce départage, deux appareils peuvent trancher différemment le même
   conflit et **ne jamais converger**.

2. **La purge est terminale.** Si un appareil purge une tâche pendant qu'un autre la
   modifie, la purge gagne. L'archivage (`deleted_at`) est un champ ordinaire soumis au
   LWW normal.

3. **Les orphelins sont réparés, pas ignorés.** Les enregistrements arrivent dans un ordre
   arbitraire : une tâche peut référencer un projet pas encore reçu ou purgé. Le client
   rattache les tâches orphelines à l'Inbox plutôt que de rejeter l'enregistrement.

4. **Les champs inconnus sont préservés verbatim.** Si une version récente ajoute un champ
   `recurrence` et qu'une version ancienne fusionne puis repousse cet enregistrement, elle
   ne doit pas le supprimer au passage. Sans cette règle, un appareil non mis à jour
   détruit silencieusement les données des autres.

### 5.1 Dérive d'horloge

Le LWW repose sur des timestamps clients, donc sur des horloges non fiables. Un appareil
réglé six mois dans le futur gagnerait tous les conflits, définitivement.

Parade : chaque réponse serveur contient `server_time`. Le client en déduit un décalage,
l'applique à tous les timestamps qu'il produit, et le persiste. Tout timestamp entrant
situé à plus de 24 h dans le futur est ramené à l'heure serveur.

---

## 6. Sync optionnelle et auto-hébergement

### 6.1 Module inerte par défaut

Si `sync.server_url` est nul, le `SyncEngine` **n'est jamais instancié** : pas de timer,
pas de requête, pas d'écran de connexion, aucune latence ajoutée.

En revanche, **les migrations de schéma (`field_updated_at`, `purged_at`, `sync_outbox`,
triggers, ordonnancement fractionnaire) s'appliquent chez tous les utilisateurs dès la
v1**, y compris purement locaux. Le coût est négligeable ; le bénéfice est décisif : le
jour où un utilisateur hors ligne depuis six mois connecte un serveur, ses données sont
déjà synchronisables. Sans cela, il faudrait fabriquer après coup des timestamps par champ
qui n'existent pas — ce qui est impossible.

### 6.2 Négociation

`GET /v1/server-info` sert à trois choses : vérifier que l'URL pointe vers un usagi-server,
vérifier la compatibilité de protocole **avant** toute saisie, et savoir s'il faut afficher
le formulaire d'inscription.

`ALLOW_REGISTRATION` (défaut `false`) : la plupart des instances seront personnelles et leur
propriétaire ne veut pas qu'un inconnu y crée un compte.

Pour amorcer une instance fermée, une CLI émet un **jeton d'invitation à usage unique**,
que le client fournit à l'inscription. Le serveur ne stocke que le hash du jeton, avec une
date d'expiration et une date d'utilisation.

> **Correction (2026-08-21, lors de la rédaction du plan 2).** La version d'origine
> prévoyait « une commande CLI de création du premier compte ». **C'est impossible sous
> E2EE** : le serveur ne connaît pas le mot de passe, il ne peut donc produire ni
> `wrapped_dek` ni `wrapped_private_key`. Les fabriquer côté serveur reviendrait à
> détruire le chiffrement de bout en bout — le serveur détiendrait les clés.
>
> La CLI n'émet donc pas un compte mais une **autorisation de s'inscrire**. Toute la
> cryptographie reste sur l'appareil. Bénéfice de bord : le même mécanisme sert plus tard
> à inviter un second utilisateur sans jamais rouvrir l'inscription publique.

**Validation d'URL côté client :** `https://` imposé, avec exception explicite pour
`localhost`, `127.0.0.1` et les domaines `.local`, sans quoi l'auto-hébergement en réseau
local et le développement deviennent impraticables. Avertissement visible en cas de
connexion non chiffrée.

### 6.3 Parcours dans les réglages

Nouvelle section « Synchronisation », vide et repliée par défaut.

1. Champ URL → **Tester la connexion** → affiche nom et version du serveur, ou une erreur
   explicite (injoignable / pas un usagi-server / protocole incompatible).
2. **Se connecter** ou **Créer un compte** (selon `registration_enabled`).
3. À la création : **clé de récupération de 24 mots** affichée, avec copie et confirmation
   obligatoire avant de continuer.
4. Une fois connecté : état de la sync, date de dernière synchronisation, liste des
   appareils, **Déconnecter cet appareil**.

### 6.4 Première synchronisation

Si les données locales sont non vides **et** que le premier pull est non vide (typiquement
un deuxième appareil), un push naïf produirait une union silencieuse — perçue comme une
corruption. Le client pose explicitement la question :

- **Fusionner** — les deux jeux sont réconciliés par le LWW normal (§5). Les enregistrements
  présents d'un seul côté sont conservés.
- **Remplacer** — le contenu local est effacé, puis intégralement retéléchargé depuis le
  compte. L'outbox est vidée **avant** le premier push, afin que les données locales
  abandonnées ne remontent pas.

Une sauvegarde locale (export JSON via `dataTransfer.ts`, déjà existant) est écrite
automatiquement avant l'option « Remplacer », qui est destructrice.

Dans les autres cas (local vide, ou compte vide), aucune question.

### 6.5 Déconnexion et changement de serveur

La déconnexion efface les clés en mémoire, le curseur, l'outbox et l'identité de
l'appareil — mais **ne touche pas au SQLite local**. L'utilisateur retrouve son app locale
intacte.

Le curseur est spécifique à un serveur : changer d'URL le réinitialise, jamais ne le
réutilise.

Un seul serveur à la fois.

### 6.6 Livrable serveur

Le serveur est destiné à des tiers : `Dockerfile`, `docker-compose.yml` (serveur +
Postgres) démarrant du premier coup, `.env.example` documenté, CLI de création de compte,
README d'auto-hébergement.

---

## 7. Gestion d'erreurs

| Situation | Comportement |
|---|---|
| Hors ligne | L'outbox s'accumule, l'app fonctionne normalement. Aucun état d'erreur affiché. |
| Access token expiré | Refresh transparent. Échec du refresh → état « reconnexion requise », données locales intactes. |
| Batch partiellement échoué | Rejeu complet du batch (idempotent). |
| Déchiffrement impossible | Enregistrement mis en quarantaine et journalisé, la boucle de sync **continue**. Un blob corrompu ne bloque jamais le reste. |
| Appareil révoqué | 401 permanent. L'app se verrouille et efface les clés en mémoire, sans toucher au SQLite local. |
| Protocole incompatible | Sync désactivée avec message explicite. L'app reste pleinement utilisable en local. |

---

## 8. Stratégie de tests

### 8.1 Convergence — le test à haute valeur

`MemoryRepository` existe déjà dans `src/test-harness/`. On lui adjoint un
`FakeSyncServer` en mémoire, et on simule deux appareils :

> Appliquer une séquence aléatoire d'opérations sur A et sur B pendant qu'ils sont hors
> ligne, les reconnecter, synchroniser, puis vérifier que A et B ont un état **strictement
> identique** — et que cet état est le même quel que soit l'ordre de reconnexion.

C'est le seul test qui attrape les bugs de non-convergence.

### 8.2 Autres tests

- Vecteurs crypto Rust : déchiffrement de ce qui a été chiffré, **refus en cas d'AAD
  altérée**, ré-enveloppement de la DEK au changement de mot de passe, récupération via
  clé de 24 mots.
- Tests e2e Nest (supertest + Postgres de test) sur auth, push, pull, révocation.
- Test de non-régression sur l'attribution des séquences (§3.2) : push concurrents,
  vérifier qu'aucun enregistrement n'est sauté par un client qui avance son curseur.
- Test de non-régression « sync désactivée » : sans `server_url`, aucune requête réseau
  n'est émise.
- Migration : une base pré-migration avec données réalistes doit se migrer sans perte,
  y compris la conversion `sort_order` INTEGER → fractionnaire.

---

## Hors périmètre v1

- Partage de projets entre comptes (schéma préparé, non implémenté).
- Synchronisation temps réel (WebSocket / SSE).
- Synchronisation des `settings` et `shortcuts` : volontairement par appareil.
- Multi-comptes / plusieurs serveurs simultanés.
- Application web.

---

## 9. Prérequis issus de l'implémentation du plan 1

Le plan 1 (fondations de schéma, branche `feat/sync-schema-groundwork`, 17 commits) a été
implémenté et revu tâche par tâche. Il a livré des colonnes et une outbox **inertes** :
rien ne les lit encore. Cinq points doivent être traités **avant** que le moteur de
synchronisation ne s'appuie dessus. Ils sont listés par ordre de dépendance.

### 9.1 Trancher la sémantique de `sort_key`, puis re-backfiller intégralement

`sort_order` — et donc `sort_key`, qui le mirroir — encode un ordre **par vue filtrée** :
`reorderTasks` écrit `0..N` pour le sous-ensemble affiché. Or la sync stocke un
enregistrement par tâche, sans contexte de vue. **Un ordre par vue n'est représentable
dans aucune clé unique par ligne**, quelle que soit la stratégie d'ancrage.

Il faut choisir : ordre scopé par projet (une séquence de clés par projet) ou ordre global
unique. Puis **re-backfiller toutes les lignes depuis zéro**.

Ne faire confiance à **aucune** valeur de `sort_key` existante. Deux causes distinctes de
divergence coexistent :
- un réordonnancement de sous-ensemble ré-ancre à `a0` et entre en collision avec les
  lignes non touchées ;
- une tâche créée après le premier backfill a `sort_order = 0` (codé en dur) donc
  s'affiche en haut, mais le backfill suivant lui attribue une clé **après le maximum
  existant**, donc en bas. Le backfill étant idempotent, il n'y reviendra jamais.

### 9.2 Renseigner `sort_key` à l'insertion

`createTask`, `createProject` et `createProjectGroup` ne l'écrivent pas. Le backfill au
démarrage ne doit pas rester le mécanisme de réparation — voir 9.1 pour pourquoi il
« répare » en figeant une position erronée.

### 9.3 Étendre l'estampillage `field_updated_at`

Deux lacunes distinctes :
- **Entre tables** : seule `tasks` est estampillée. `projects`, `tags` et `project_groups`
  ont la colonne mais elle reste NULL.
- **Dans `tasks`** : seuls `createTask` et `updateTask` estampillent. Les six méthodes
  listées dans la correction du §1.2 écrivent des colonnes LWW sans estampiller —
  y compris `deleteTask`, qui pose un tombstone sans stamp.

### 9.4 Convertir `deleteProjectGroup` en tombstone

La migration 007 a donné un `purged_at` à `project_groups` et la 009 un trigger DELETE,
mais `deleteProjectGroup` fait toujours une suppression physique. Résultat : l'outbox
reçoit une entrée pointant vers une ligne qui n'existe plus, et le moteur ne peut pas
distinguer « purgé » de « n'a jamais existé ».

Décider au passage ce que `bulkImport` doit faire des tombstones : en mode `replace` son
`DELETE FROM tasks` les détruit physiquement, et en mode `merge` son `INSERT OR REPLACE`
remet `field_updated_at`, `purged_at` et `sort_key` à NULL pour **toute** tâche importée.

### 9.5 Ajouter la notion de transaction à `DbDriver`

`DbDriver` (`src/db/driver.ts`) n'expose que `execute` et `select`. Le §4.1 exige que le
moteur purge ses propres entrées d'outbox **dans la même transaction** que l'application
d'un changement distant : c'est inexprimable avec l'interface actuelle. C'est la plus
grosse lacune d'interface laissée par le plan 1.

### 9.6 Pièges documentés

- **Reconstruction de table** : toute migration reconstruisant une table synchronisée avec
  une liste de colonnes explicite (comme le fait `006`) droppe **et** ses triggers **et**
  les colonnes de sync ajoutées depuis. L'avertissement complet est dans l'en-tête de
  `009_sync_outbox.sql`.
- **`LOCAL_DEVICE_ID = "local"`** est un placeholder déjà persisté sur disque chez les
  utilisateurs. Le moteur devra le remplacer par un identifiant réel stocké dans
  `sync_state`, et réécrire les stamps existants.
- **`isIgnorable`** ne tolère que `/duplicate column name/i`, vérifié sous `better-sqlite3`
  mais **pas** sous `@tauri-apps/plugin-sql`. À confirmer par un rejeu hérité réel avant
  de s'y fier (voir la porte de sortie de release).
