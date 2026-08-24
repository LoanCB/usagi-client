# Plan 4b — note de cadrage

> **Ce document n'est pas un plan.** C'est le périmètre établi pour en écrire un, rédigé en fin de session quand le contexte ne permettait plus de produire le plan lui-même. Une session neuve doit lire le spec §3 et §4, sonder l'état réel du serveur, puis passer par `superpowers:writing-plans`.

## Ce que 4b doit livrer

Les deux endpoints de synchronisation et le schéma qui les porte, côté `usagi-server` (NestJS + Prisma 7 + PostgreSQL).

```
POST /v1/sync/push
  { changes: [ { entityType, id, ciphertext, nonce, purged } ] }
  → { applied: [ { entityType, id, seq } ], serverTime }

GET  /v1/sync/pull?cursor=<seq>&limit=500
  → { records: [ … ], nextCursor, hasMore, serverTime }
```

## État réel du serveur, vérifié

Relevé sur `develop` à `8ae5354` :

- **Quatre contrôleurs seulement** : `auth`, `keys`, `devices`, `server-info`. Aucun contrôleur de sync. Un test d'inventaire (`test/controller-inventory.e2e-spec.ts`) épingle cette liste et **échouera** dès qu'on ajoutera un `SyncController` — c'est voulu, il force à traiter l'opt-out du throttler `login` au passage.
- **Cinq modèles Prisma** : `User`, `UserKeys`, `Device`, `Workspace`, `Invite`. **Aucun modèle `Record`.** La table qui stocke les enregistrements chiffrés n'existe pas.
- `Workspace.seqCounter` (`BigInt @default(0)`) existe déjà — c'est le compteur du §3.2.
- Le serveur applique `forbidNonWhitelisted` : un champ mal nommé est un 400 sur toute la requête. Les noms sont en **camelCase**.

## Les pièges que le spec documente déjà

**§3.2 — le piège du `BIGSERIAL`.** Ne pas attribuer les `seq` avec une séquence Postgres. Deux transactions concurrentes obtiennent leurs numéros dans un ordre, mais committent dans l'autre : un client qui pull entre les deux commits voit le `seq` le plus élevé, avance son curseur, et **ne verra jamais** l'enregistrement au `seq` inférieur committé après. Le spec impose un `seq_counter` par workspace incrémenté sous `FOR UPDATE`. C'est la raison d'être de `Workspace.seqCounter`.

**§4.1 — toujours pull → merge → push.** Le push est inconditionnel côté serveur : il écrase la ligne et attribue un nouveau `seq`. Le serveur ne peut rien arbitrer, il ne lit pas le contenu.

**§4.0 — versionnage strict.** Le client refuse de synchroniser si `protocolVersion` diffère. `PROTOCOL_VERSION` et `MIN_CLIENT_VERSION` vivent déjà dans `server-info.controller.ts`.

**§2.4 — métadonnées visibles du serveur.** Ce que le serveur voit malgré le chiffrement (tailles, horodatages, cardinalité) est documenté ; le schéma ne doit pas en révéler davantage.

## Contraintes venues de l'implémentation client

Établies pendant les plans 3 et 4a, et contraignantes ici :

- **Le format de fil des blobs est `nonce (24) ‖ ciphertext ‖ tag (16)`, base64 standard.** Un secret de 32 octets fait 72 octets décodés. Les bornes actuelles du serveur sur les blobs enveloppés sont `{min: 40, max: 128}` — à réexaminer pour des enregistrements, qui sont bien plus gros qu'une clé.
- **L'AAD d'un enregistrement est préfixée par longueur**, domaine `usagi/record/v1`, sur `userId`, `entityType`, `entityId`. Le serveur ne la calcule pas, mais elle contraint ce qui doit être stocké pour qu'un client puisse la reconstruire.
- **Le départage LWW est « le plus grand `device_id` gagne »** (§5, précisé le 2026-08-23). Sans effet sur 4b puisque le serveur n'arbitre pas, mais 4c en dépend.

## Décisions à prendre avant d'écrire le plan

1. **`purged` : colonne ou absence de ligne ?** Le client distingue archivé (`deleted_at`) de purgé (`purged_at`). Le serveur doit propager la purge sans pouvoir lire le contenu.
2. **Rétention des tombstones.** Ils s'accumulent indéfiniment sinon. Une purge côté serveur après N jours casse un appareil resté hors ligne plus longtemps.
3. **Bornes de taille par enregistrement et par requête push.** Un `limit=500` au pull est spécifié ; rien n'est dit du push.
4. **Comportement du `cursor`** quand un client envoie un `seq` supérieur au maximum, ou un curseur d'un autre workspace.

## Ce qui n'est pas dans 4b

Le moteur de fusion, la vidange de l'outbox, les déclencheurs du §4.2 — c'est 4c, côté client.

## Dette connexe, à traiter en passant

`pr-checks.yml` du client filtre encore `branches: [main, develop]`, alors que le serveur couvre toutes les branches cibles. Incohérence entre les deux dépôts, correctif d'une ligne.
