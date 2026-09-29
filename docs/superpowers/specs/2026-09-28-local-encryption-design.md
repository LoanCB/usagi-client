# Chiffrement local de la base (SQLCipher) et verrouillage au démarrage

**Date:** 2026-09-28
**Statut:** En revue
**Dépôt concerné:** `usagi-client` (client Tauri 2). Aucun changement serveur.

## Objectif

Les données locales de Bunly sont **toujours chiffrées au repos**, que la synchronisation soit
activée ou non. Sans le secret qui protège la base, le fichier `usagi.db` est illisible — y compris
pour quelqu'un qui le copie ou l'ouvre avec `sqlite3`.

- Au premier lancement, l'utilisateur choisit un **mot de passe** ou **« pas de mot de passe »**.
  Dans ce second cas, une clé est générée et rangée dans le trousseau du système : l'app se
  déverrouille seule au démarrage. Un mot de passe peut être défini plus tard dans les réglages.
- En mode mot de passe, l'app s'ouvre sur un **écran bloquant** : rien n'est utilisable sans le bon
  mot de passe (ou la clé de récupération).
- **Un seul mot de passe** : connecter la synchronisation aligne le mot de passe local sur celui du
  compte. Une app synchronisée demande donc toujours le mot de passe au démarrage.

## Décisions structurantes

| Sujet | Décision |
|---|---|
| Technique | SQLCipher (chiffrement de la base entière, pages + journaux), clé brute 256 bits. |
| Clé de la base | LDK aléatoire, générée une fois, **jamais changée** ; seuls ses emballages changent. |
| Métadonnées | `vault.json` en clair à côté de `usagi.db`, sans aucun secret (uniquement des blobs chiffrés). |
| « Pas de mot de passe » | LDK dans le trousseau OS (crate `keyring`), pas dans un fichier. |
| Mot de passe et sync | Un seul mot de passe : celui du compte quand la sync est connectée. |
| Oubli (local) | Clé de récupération de 24 mots à la définition du mot de passe. |
| Oubli (sync) | Clé de récupération du compte → DEK → LDK, hors ligne. |
| Sauvegardes automatiques | Chiffrées (avant « remplacer » de la première sync). L'export manuel reste en clair. |
| Hors périmètre | Verrouillage auto par inactivité, « verrouiller maintenant », changement du mot de passe du **compte**. |

### Pourquoi SQLCipher

- **Transparent** : toutes les requêtes, le repository, le moteur de sync et la recherche restent
  inchangés. Le chiffrement vit sous le pool Rust.
- Chiffrement champ par champ écarté : il casse la recherche, le tri et les filtres SQL, touche
  chaque requête et laisse la structure en clair (dates, volumes, liens entre entités).
- Chiffrement du fichier à la fermeture écarté : données en clair sur disque pendant toute
  l'exécution, et après un crash.

### Pourquoi le trousseau pour « pas de mot de passe »

Une clé dans un fichier à côté de la base qu'elle chiffre ne protège de rien : qui copie le dossier
emporte les deux. Le trousseau protège contre la copie des fichiers, pas contre la session ouverte —
c'est exactement le compromis que l'utilisateur accepte en choisissant ce mode, et l'écran le dit.

## 1. Hiérarchie de clés

```
                       ┌──────────────── LDK (32 octets aléatoires) ────────────────┐
                       │          PRAGMA key = "x'<hex>'"  →  usagi.db (SQLCipher)   │
                       └──────────────────────────────────────────────────────────────┘
        emballée par (chaque emballage est une porte d'entrée indépendante) :

  mode keychain     : trousseau OS, entrée "com.bunly.app" / "local-db-key:<vaultId>"
  mode password     : localKek = HKDF(Argon2id(mdp, salt), "usagi/local-kek/v1")   → wrappedLdk
  récupération      : recoveryKek(phrase locale)                                    → wrappedLdkRecovery
  sync connectée    : DEK du compte                                                 → wrappedLdkByDek
```

- **Argon2id** : `derive_master_key` existant (mêmes paramètres, sel de 32 caractères hex).
- **Séparation de domaines HKDF** : `usagi/local-kek/v1` est distinct de `usagi/kek/v1` (DEK du
  compte) et de `usagi/auth-verifier/v1` (preuve envoyée au serveur). Même issue d'un seul master
  key, la clé de la base n'est jamais égale à un secret serveur.
- **AAD d'emballage** (convention de `wrap.rs`) : `usagi/wrap/ldk/v1`, `usagi/wrap/ldk-recovery/v1`,
  `usagi/wrap/ldk-dek/v1`, `usagi/wrap/local-dek/v1`, `usagi/local-backup/v1`.
- **DEK du compte en local** : à la connexion, la DEK est scellée sous
  `HKDF(LDK, "usagi/local-dek/v1")` et rangée dans `sync_state` (`local_dek`), avec le `user_id`.
  Après ouverture du pool, Rust la lit et déverrouille aussi le vault de sync, **sans le serveur ni
  le mot de passe du compte**. Le démarrage ne coûte donc qu'**un** Argon2id (celui du mdp local) et
  ne dépend que de la LDK. L'état « sync verrouillée » sort du parcours normal (il reste pour la
  révocation d'appareil, §7 de la spec sync).

### `vault.json`

Écrit **atomiquement** (fichier temporaire, `fsync`, `rename`). Aucun champ n'est un secret.

| Champ | Contenu | Présent quand |
|---|---|---|
| `version` | `1` | toujours |
| `vaultId` | UUID aléatoire | toujours |
| `mode` | `"keychain"` \| `"password"` | toujours |
| `salt`, `kdf` | sel Argon2id (32 hex) et paramètres | mode `password` |
| `wrappedLdk` | LDK sous `localKek` | mode `password` |
| `wrappedLdkRecovery` | LDK sous la clé de récupération locale | un mdp local a été défini |
| `wrappedLdkByDek` | LDK sous la DEK du compte | sync connectée |
| `wrappedDekRecovery` | DEK sous la clé de récupération du compte (copie de `GET /v1/keys`) | sync connectée |
| `migration` | `"pending"` pendant la migration §3 | migration en cours |

`vaultId` nomme l'entrée du trousseau : deux bases sur la même session (instances de test avec des
`HOME` différents, qui partagent le même trousseau) ne peuvent pas s'écraser mutuellement.

## 2. Démarrage et écran de verrouillage

### Ordre de démarrage

1. Rust **n'ouvre plus la base** à l'initialisation. Le plugin `usagi-db` (`src-tauri/src/db.rs`)
   n'enregistre le pool qu'à la réussite d'un déverrouillage.
2. React rend d'abord un **`VaultGate`** plein écran **à la place** de l'app : l'arbre qui utilise le
   repository n'est pas monté tant que la clé n'est pas présente.
3. Au déverrouillage, Rust ouvre le pool SQLCipher (toujours `max_connections(1)`, clé passée par
   `SqliteConnectOptions::pragma("key", …)`) et l'insère dans `DbInstances` sous `DB_URL`. Le code
   d'init actuel (`Database.get`, migrations, repository, `startSync`) reprend **inchangé**.

### Commandes Tauri

| Commande | Rôle |
|---|---|
| `vault_status()` | `state` : `fresh` \| `legacy-plaintext` \| `keychain` \| `password` \| `broken` ; `migrating: bool` ; `syncBound: bool` ; `brokenReason` |
| `vault_setup_keychain()` | crée la LDK, la range dans le trousseau, ouvre (ou migre) la base |
| `vault_setup_password(password)` | crée la LDK, l'emballe, ouvre (ou migre) la base ; renvoie la phrase de récupération |
| `vault_unlock_keychain()` | lit la LDK dans le trousseau, ouvre la base |
| `vault_unlock_password(password)` | Argon2id, déballe la LDK, ouvre la base, déverrouille la sync si liée |
| `vault_unlock_recovery(phrase, newPassword)` | déballe via récupération locale ou compte, ré-emballe sous le nouveau mdp, ouvre la base |

La phrase de récupération locale suit les mêmes règles que celle du compte (`src/crypto/index.ts`) :
affichée une fois, jamais persistée ni journalisée, retirée de l'état JS dès la confirmation.

### Écrans du `VaultGate`

| État | Écran |
|---|---|
| `fresh` | « Protéger vos données » : mdp + confirmation, ou **« Continuer sans mot de passe »** avec l'explication du compromis (§ Pourquoi le trousseau). |
| `legacy-plaintext` | Même écran + « Vos données vont désormais être chiffrées ». La migration §3 suit le choix. |
| `keychain` | Aucun : déverrouillage automatique. |
| `password` | Champ mot de passe + lien **« Mot de passe oublié ? »**. |
| `broken` | Écran d'erreur explicite (§5). |

- Une migration interrompue (`migrating: true`) n'a pas d'écran propre : chaque commande de
  déverrouillage la reprend avant d'ouvrir la base.
- Après `vault_setup_password`, l'étape **clé de récupération** réutilise `RecoveryPhraseStep`.
- « Mot de passe oublié ? » : saisie de la phrase puis d'un **nouveau mot de passe**. Sans sync, la
  phrase locale déballe la LDK. Avec sync, la phrase du compte déballe `wrappedDekRecovery` → DEK →
  `wrappedLdkByDek` → LDK, **hors ligne**. Dans ce second cas, le nouveau mdp ne vaut que
  localement : le mdp du compte n'est pas modifié (hors périmètre), l'écran le signale. La sync
  continue de fonctionner (la DEK est dans `local_dek`, l'authentification passe par le refresh
  token) ; les deux mots de passe divergent jusqu'à la prochaine connexion au compte, qui les
  réaligne.

## 3. Migration des utilisateurs existants

Déclenchée après le choix dans le `VaultGate` quand `usagi.db` est en clair et `vault.json` absent.

1. Écrire `vault.json` avec `migration: "pending"` et les emballages de la nouvelle LDK.
2. Ouvrir la base en clair, `PRAGMA wal_checkpoint(TRUNCATE)`, puis
   `ATTACH 'usagi.db.enc' AS enc KEY "x'…'"`, `SELECT sqlcipher_export('enc')`, copier
   `user_version`, `DETACH`.
3. **Vérifier** : ouvrir `usagi.db.enc` avec la LDK, `PRAGMA integrity_check` = `ok`, et comptes de
   lignes identiques table par table.
4. Permuter : `usagi.db` → `usagi.db.plain`, `usagi.db.enc` → `usagi.db`, retirer `migration` de
   `vault.json`, supprimer `usagi.db.plain` (et ses `-wal`/`-shm`).
5. Chiffrer les sauvegardes automatiques existantes (`bunly-before-replace-*.json`, §4), puis
   supprimer leurs versions en clair.

**Reprise après crash** : au démarrage, `migration: "pending"` + présence de `usagi.db.plain` ou
`usagi.db.enc` indiquent l'étape atteinte ; chaque étape est idempotente. Un `usagi.db.enc` partiel
(avant vérification) est jeté et l'export refait.

**Limite assumée** : sur SSD/APFS, supprimer un fichier ne garantit pas l'effacement de ses blocs.
La migration ne crée donc aucune copie en clair supplémentaire et ne supprime qu'après vérification.

## 4. Réglages, sauvegardes et synchronisation

### Onglet « Sécurité » (nouveau, `SettingsDialog`)

| Mode | Actions |
|---|---|
| `keychain` | **Définir un mot de passe** → mdp + confirmation → clé de récupération. L'entrée du trousseau est supprimée. |
| `password`, sans sync | **Changer le mot de passe** (mdp actuel requis ; nouveau sel ; la clé de récupération ne change pas). **Supprimer le mot de passe** (mdp actuel requis) → `keychain`, `wrappedLdkRecovery` retiré. |
| `password`, avec sync | **Supprimer le mot de passe** et **Changer le mot de passe** désactivés, avec la raison (sync ⇒ mdp obligatoire ; changement du mdp du compte hors périmètre). |

Commandes associées : `vault_set_password`, `vault_change_password`, `vault_remove_password`.

### Sauvegardes automatiques chiffrées

`writeAutomaticBackup` (`src/components/layout/AppShell.tsx`) écrit
`bunly-before-replace-<date>.bunlybak` : le JSON actuel scellé par une clé
`HKDF(LDK, "usagi/local-backup/v1")` via une commande Rust (la LDK ne passe jamais en JS). L'import
de l'onglet Données reconnaît ce format et le déchiffre avec le vault courant : une telle sauvegarde
n'est restaurable que sur cette installation. L'**export manuel** reste en JSON clair, avec un
avertissement à côté du bouton.

### Interaction avec la synchronisation

- **Connexion (inscription ou connexion)** : le master key déjà dérivé pour l'authentification
  (`prepare_registration` / `begin_unlock`) est réutilisé — pas de second Argon2id : `localKek` en
  est dérivé par HKDF, et le sel local devient celui du compte. Le vault passe en `password`,
  `wrappedLdk` est ré-emballé, `wrappedLdkByDek` et `wrappedDekRecovery` sont ajoutés, `local_dek`
  et `user_id` sont écrits dans `sync_state`.
  Depuis `keychain`, l'entrée du trousseau est supprimée. Depuis un autre mot de passe local, un
  message indique qu'il est remplacé par celui du compte ; `wrappedLdkRecovery` est conservé (la
  clé de récupération locale reste valable).
- **Déconnexion** : les données restent chiffrées ; `wrappedLdkByDek`, `wrappedDekRecovery` et
  `local_dek` sont retirés. Si un mot de passe local avait été défini (une clé de récupération
  locale existe), le mdp du compte devient le mdp local et l'utilisateur peut ensuite le
  supprimer dans les réglages. Sinon (appareil parti de « pas de mot de passe »), le vault revient
  en mode `keychain` : la LDK retourne dans le trousseau, sans quoi le mot de passe resterait la
  seule porte d'entrée, sans récupération possible.
- **Connexion d'un compte déjà présent avant cette fonctionnalité** : le déverrouillage de la sync
  depuis le panneau lie aussi le compte au vault (`local_dek` écrit), ce qui réaligne les mots de
  passe et ré-scelle une DEK périmée.
- **Révocation d'appareil** (§7 spec sync) : inchangé — le vault de sync se verrouille, la base
  locale reste ouverte pour la session en cours.

## 5. Gestion des erreurs

| Situation | Comportement |
|---|---|
| Mauvais mdp ou mauvaise phrase | Message générique (`CryptoError::Decrypt`) ; aucun compteur, Argon2id (~1 s) sert de frein. |
| Échec de migration (disque plein, vérification KO) | Base en clair **intacte**, `usagi.db.enc` jeté, écran d'erreur avec **Réessayer**. L'app reste bloquée. |
| Accès au trousseau refusé | Écran avec **Réessayer**. |
| Entrée du trousseau introuvable | `broken` : données irrécupérables, dit clairement (risque annoncé au choix du mode). |
| `vault.json` absent alors que la base est chiffrée | `broken` : irrécupérable (d'où l'écriture atomique). |
| `vault.json` illisible / version inconnue | `broken`, sans toucher aux fichiers. |

## 6. Tests

**Rust (le cœur)**
- Cycle du vault : setup keychain/password, unlock, change/remove/set password, récupération locale
  et compte, mauvais secret → `Decrypt`.
- Base chiffrée : les 16 premiers octets de `usagi.db` ≠ `SQLite format 3\0` ; ouverture sans clé ou
  avec une mauvaise clé → échec.
- Migration : export + vérification sur une base réelle, reprise simulée à chaque étape, échec de
  vérification → base en clair intacte.
- Trousseau derrière un trait `KeyStore` avec un faux en mémoire (entrée absente, accès refusé).
- `vault.json` : écriture atomique, versions inconnues rejetées.

**JS**
- `VaultGate` : chaque état et chaque parcours (setup, unlock, oubli, erreurs), commandes mockées.
- Onglet Sécurité : actions disponibles selon le mode et la sync.
- Sync : ré-emballage à la connexion/déconnexion (deps mockées).
- Sauvegarde automatique : écrit un `.bunlybak`, jamais de JSON en clair.
- Les tests existants restent inchangés : `BetterSqliteDriver` est sous le chiffrement.

**E2E (Playwright)** : inchangé. Le harnais (`src/test-harness/main.tsx`) monte `AppContent`
directement sur un `MemoryRepository`, sans passer par `App` ni par le `VaultGate`. Le gate est
couvert par les tests de composant.

**Vérification manuelle** : `sqlite3 usagi.db .tables` → *file is not a database*.

## Performance

Argon2id ~1 s au déverrouillage (mode `password` seulement). Surcoût SQLCipher de l'ordre de
5–15 % par requête, imperceptible aux volumes de l'app. Binaire plus lourd (crypto embarquée) et
première compilation plus longue.
