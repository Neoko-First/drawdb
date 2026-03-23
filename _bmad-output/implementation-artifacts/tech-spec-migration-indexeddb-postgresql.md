---
title: 'Migration stockage IndexedDB vers PostgreSQL'
slug: 'migration-indexeddb-postgresql'
created: '2026-03-23'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'React 18 + Vite (frontend SPA)'
  - 'Node.js + Express (backend à créer dans /server)'
  - 'PostgreSQL (base de données centrale)'
  - 'axios (déjà présent côté frontend)'
  - 'pg (driver PostgreSQL pour Node.js)'
files_to_modify:
  - 'src/data/db.js'
  - 'src/components/Workspace.jsx'
  - 'src/components/EditorHeader/Modal/Open.jsx'
  - 'src/components/EditorHeader/Modal/New.jsx'
  - 'src/components/EditorHeader/ControlPanel.jsx'
  - 'src/pages/Templates.jsx'
  - 'src/utils/exportSavedData.js'
code_patterns:
  - 'useLiveQuery (Dexie) → useState + useEffect + appel API'
  - 'db.diagrams.* → axios vers /api/diagrams/*'
  - 'db.templates.* → axios vers /api/templates/*'
  - 'Pattern à reproduire : src/api/gists.js'
test_patterns:
  - 'Aucun test automatisé — validation manuelle des ACs'
---

# Tech-Spec: Migration stockage IndexedDB vers PostgreSQL

**Created:** 2026-03-23

## Overview

### Problem Statement

DrawDB stocke tous les diagrammes (tables, relations, enums, types, notes, areas) dans l'IndexedDB du navigateur via Dexie.js. Les données sont liées à l'appareil et au navigateur, entraînant des risques de perte et empêchant toute centralisation ou collaboration future.

### Solution

Remplacer complètement IndexedDB par une base de données PostgreSQL centrale exposée via une API REST Node.js/Express. Le frontend appellera cette API à la place de Dexie.js pour toutes les opérations CRUD sur diagrammes et templates.

### Scope

**In Scope:**
- Création d'un backend Node.js + Express dans `/server` (projet Node.js indépendant)
- Schéma PostgreSQL pour `diagrams` et `templates` avec colonnes JSONB pour les données complexes
- API REST CRUD complète pour les deux entités
- Création de `src/api/diagrams.js` et `src/api/templates.js`
- Remplacement de tous les appels Dexie dans 7 fichiers frontend
- Script de migration (création tables) et seed (6 templates par défaut)
- Suppression des dépendances `dexie` et `dexie-react-hooks`

**Out of Scope:**
- Authentification *(phase 2 — colonne `user_id` nullable prévue dans le schéma dès maintenant)*
- Migration des données IndexedDB existantes
- Mode offline / fallback IndexedDB
- Collaboration temps réel
- Fonctionnalité Gist (partage) — non touchée

---

## Context for Development

### Codebase Patterns

**Pattern API à reproduire (source : `src/api/gists.js`) :**
```js
import axios from "axios";
const baseUrl = import.meta.env.VITE_BACKEND_URL;
// axios.get/post/put/delete(`${baseUrl}/api/...`)
```

**Pattern useLiveQuery → useState + useEffect :**
```js
// AVANT
const diagrams = useLiveQuery(() => db.diagrams.toArray());

// APRÈS
const [diagrams, setDiagrams] = useState([]);
useEffect(() => {
  getDiagrams().then(setDiagrams).catch(console.error);
}, []);
```

**Inconsistance `references` vs `relationships` :**
- `Workspace.jsx` (diagrams) utilise la clé `references` pour les relations
- `ControlPanel.jsx` (save_as_template) utilise la clé `relationships`
- Le backend et les clients API doivent respecter cette distinction sans la modifier

**`diagramId` vs `id` :**
- Le frontend utilise toujours `diagramId` (UUID) comme identifiant public
- `id` (SERIAL) est interne à PostgreSQL, jamais exposé au frontend

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `src/data/db.js` | Dexie init — à supprimer |
| `src/components/Workspace.jsx` | Logique save/load principale — point central de la migration |
| `src/components/EditorHeader/Modal/Open.jsx` | `useLiveQuery(db.diagrams.toArray())` |
| `src/components/EditorHeader/Modal/New.jsx` | `useLiveQuery(db.templates.toArray())` |
| `src/components/EditorHeader/ControlPanel.jsx` | `save_as_template`, `delete_diagram`, `recentlyOpenedDiagrams` |
| `src/pages/Templates.jsx` | Deux `useLiveQuery` + `deleteTemplate` |
| `src/utils/exportSavedData.js` | Lecture `db.diagrams` et `db.templates` |
| `src/api/gists.js` | Pattern d'appel API à reproduire |
| `src/data/seeds.js` + `src/templates/template*.js` | 6 templates à migrer en seed SQL |

### Technical Decisions

- **JSONB** : tables, references, notes, areas, enums, types stockés en JSONB → zéro refactoring du modèle de données frontend
- **`user_id` nullable** : présent dès le départ dans les deux tables pour faciliter l'auth en phase 2
- **`pg` natif** : pas d'ORM (schéma fixe, projet simple)
- **CORS** : le backend doit autoriser `http://localhost:5173` (Vite dev server)
- **Séparation des projets** : `/server` a son propre `package.json` — démarrage indépendant (`node server/index.js`)
- **Variable `VITE_BACKEND_URL`** : déjà présente côté frontend — le backend écoute sur `PORT` (défaut 3000)
- **Réponse POST /api/diagrams** : doit retourner `{ diagramId }` pour que le frontend navigue vers la bonne URL

---

## Implementation Plan

### Tasks

> Ordre de dépendance : T1→T2→T3→T4→T5→T6 (backend), puis T7→T8 (clients API), puis T9→T15 (migration frontend).

**— BACKEND —**

- [ ] T1 : Initialiser la structure du backend
  - Fichier : `/server/package.json` (créer)
  - Action : Créer un package.json Node.js avec dépendances `express`, `pg`, `cors`, `dotenv`
  - Fichier : `/server/.env.example` (créer)
  - Action : `DATABASE_URL=postgres://user:pass@localhost:5432/drawdb` + `PORT=3000`
  - Fichier : `/server/index.js` (créer)
  - Action : App Express avec `cors()`, `express.json()`, montage des routes `/api/diagrams` et `/api/templates`, appel `migrate()` puis `seed()` au démarrage, écoute sur `process.env.PORT || 3000`

- [ ] T2 : Créer le pool de connexion PostgreSQL
  - Fichier : `/server/db/pool.js` (créer)
  - Action : `new Pool({ connectionString: process.env.DATABASE_URL })` exporté comme singleton

- [ ] T3 : Créer le script de migration (création des tables)
  - Fichier : `/server/db/migrate.js` (créer)
  - Action : Exécuter `CREATE TABLE IF NOT EXISTS` pour `diagrams` et `templates`
  - Schéma `diagrams` :
    ```sql
    id SERIAL PRIMARY KEY,
    diagram_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NULL,
    name TEXT NOT NULL DEFAULT 'Untitled Diagram',
    database TEXT NOT NULL DEFAULT 'generic',
    gist_id TEXT NOT NULL DEFAULT '',
    loaded_from_gist_id TEXT NOT NULL DEFAULT '',
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tables JSONB NOT NULL DEFAULT '[]',
    references JSONB NOT NULL DEFAULT '[]',
    notes JSONB NOT NULL DEFAULT '[]',
    areas JSONB NOT NULL DEFAULT '[]',
    enums JSONB NOT NULL DEFAULT '[]',
    types JSONB NOT NULL DEFAULT '[]',
    pan JSONB NOT NULL DEFAULT '{"x":0,"y":0}',
    zoom FLOAT NOT NULL DEFAULT 1
    ```
  - Schéma `templates` :
    ```sql
    id SERIAL PRIMARY KEY,
    template_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    database TEXT NOT NULL DEFAULT 'generic',
    custom INTEGER NOT NULL DEFAULT 0,
    tables JSONB NOT NULL DEFAULT '[]',
    relationships JSONB NOT NULL DEFAULT '[]',
    notes JSONB NOT NULL DEFAULT '[]',
    subject_areas JSONB NOT NULL DEFAULT '[]',
    enums JSONB NOT NULL DEFAULT '[]',
    types JSONB NOT NULL DEFAULT '[]'
    ```

- [ ] T4 : Créer le script de seed des templates
  - Fichier : `/server/db/seeds/templates.json` (créer)
  - Action : Extraire les données des 6 templates depuis `src/templates/template*.js` et les stocker en JSON (copier le contenu des exports JS vers JSON pur)
  - Fichier : `/server/db/seed.js` (créer)
  - Action : Si `SELECT COUNT(*) FROM templates` = 0, insérer les 6 templates depuis `templates.json` avec `custom = 0` et un `template_id` UUID fixe (pour stabilité des URLs)

- [ ] T5 : Créer les routes `/api/diagrams`
  - Fichier : `/server/routes/diagrams.js` (créer)
  - Action : Implémenter les 7 endpoints suivants avec `pool.query(...)` :
    - `GET /api/diagrams` → `SELECT id, diagram_id, name, database, last_modified FROM diagrams ORDER BY last_modified DESC`
    - `GET /api/diagrams/latest` → `... ORDER BY last_modified DESC LIMIT 1` (retourne objet complet)
    - `GET /api/diagrams/:diagramId` → `SELECT * FROM diagrams WHERE diagram_id = $1`
    - `GET /api/diagrams?loadedFromGistId=X` → `SELECT diagram_id FROM diagrams WHERE loaded_from_gist_id = $1 LIMIT 1`
    - `POST /api/diagrams` → INSERT + retourner `{ diagramId: diagram_id }`
    - `PUT /api/diagrams/:diagramId` → UPDATE SET ... WHERE diagram_id = $1 (inclure `last_modified = NOW()`)
    - `DELETE /api/diagrams/:diagramId` → DELETE WHERE diagram_id = $1
  - Notes : Gérer le cas `GET /api/diagrams/latest` **avant** `GET /api/diagrams/:diagramId` dans l'ordre des routes (sinon Express interprète "latest" comme un diagramId)

- [ ] T6 : Créer les routes `/api/templates`
  - Fichier : `/server/routes/templates.js` (créer)
  - Action : Implémenter 5 endpoints :
    - `GET /api/templates` → tous les templates ; si query param `?custom=0|1` → filtrer par `custom`
    - `GET /api/templates/:templateId` → `SELECT * FROM templates WHERE template_id = $1`
    - `POST /api/templates` → INSERT avec `custom = 1`, retourner `{ templateId: template_id }`
    - `DELETE /api/templates/:templateId` → DELETE WHERE template_id = $1 AND custom = 1

**— CLIENTS API FRONTEND —**

- [ ] T7 : Créer `src/api/diagrams.js`
  - Fichier : `src/api/diagrams.js` (créer)
  - Action : Exporter les fonctions suivantes (pattern `src/api/gists.js`) :
    ```js
    export async function getDiagrams()               // GET /api/diagrams
    export async function getLatestDiagram()          // GET /api/diagrams/latest
    export async function getDiagram(diagramId)       // GET /api/diagrams/:diagramId
    export async function getDiagramByGistId(gistId)  // GET /api/diagrams?loadedFromGistId=...
    export async function createDiagram(data)         // POST /api/diagrams → retourne { diagramId }
    export async function updateDiagram(diagramId, data) // PUT /api/diagrams/:diagramId
    export async function deleteDiagram(diagramId)    // DELETE /api/diagrams/:diagramId
    ```

- [ ] T8 : Créer `src/api/templates.js`
  - Fichier : `src/api/templates.js` (créer)
  - Action : Exporter les fonctions suivantes :
    ```js
    export async function getTemplates(custom)        // GET /api/templates?custom=...
    export async function getTemplate(templateId)     // GET /api/templates/:templateId
    export async function createTemplate(data)        // POST /api/templates → retourne { templateId }
    export async function deleteTemplate(templateId)  // DELETE /api/templates/:templateId
    ```

**— MIGRATION FRONTEND —**

- [ ] T9 : Migrer `src/components/Workspace.jsx`
  - Fichier : `src/components/Workspace.jsx` (modifier)
  - Action 1 : Remplacer `import { db } from "../data/db"` par imports de `src/api/diagrams.js` et `src/api/templates.js`
  - Action 2 : Dans `save()`, branche nouveau diagramme : remplacer `db.diagrams.add({...})` par `createDiagram({...}).then(({ diagramId }) => navigate(...))`
  - Action 3 : Dans `save()`, branche update : remplacer `db.diagrams.where(...).modify({...})` par `updateDiagram(loadedDiagramId, {...})`
  - Action 4 : Dans `loadLatestDiagram()` : remplacer `db.diagrams.orderBy(...).last()` par `getLatestDiagram()`
  - Action 5 : Dans `loadDiagram(id)` : remplacer `db.diagrams.where("diagramId").equals(id).first()` par `getDiagram(id)`
  - Action 6 : Dans `loadTemplate(id)` : remplacer `db.templates.where("templateId").equals(id).first()` par `getTemplate(id)`
  - Action 7 : Dans `load()` ligne shareId lookup : remplacer `db.diagrams.get({ loadedFromGistId: shareId })` par `getDiagramByGistId(shareId).then(r => r?.diagramId)`
  - Notes : Conserver la structure async/await et la gestion des erreurs existante (`.catch`, `setSaveState(State.FAILED_TO_LOAD)`)

- [ ] T10 : Migrer `src/components/EditorHeader/Modal/Open.jsx`
  - Fichier : `src/components/EditorHeader/Modal/Open.jsx` (modifier)
  - Action : Supprimer `useLiveQuery` et `import { db }`. Ajouter `useState, useEffect` et `import { getDiagrams } from "../../../api/diagrams"`. Remplacer `useLiveQuery(...)` par `useState([]) + useEffect(() => { getDiagrams().then(setDiagrams) }, [])`

- [ ] T11 : Migrer `src/components/EditorHeader/Modal/New.jsx`
  - Fichier : `src/components/EditorHeader/Modal/New.jsx` (modifier)
  - Action : Même pattern que T10. `useLiveQuery(() => db.templates.toArray())` → `useState([]) + useEffect(() => { getTemplates().then(setTemplates) }, [])`

- [ ] T12 : Migrer `src/components/EditorHeader/ControlPanel.jsx`
  - Fichier : `src/components/EditorHeader/ControlPanel.jsx` (modifier)
  - Action 1 : `recentlyOpenedDiagrams` (`useLiveQuery`) → `useState([]) + useEffect` appelant `getDiagrams()` (déjà triés par `last_modified DESC` côté API, `limit(10)` côté backend ou slice côté frontend)
  - Action 2 : `save_as_template` : `db.templates.add({...})` → `createTemplate({ title, tables, database, relationships, notes, subjectAreas: areas, custom: 1, ...enums, ...types })`
  - Action 3 : `delete_diagram` : `db.diagrams.where("diagramId").equals(diagramId).delete()` → `deleteDiagram(diagramId)`
  - Notes : Supprimer les imports `useLiveQuery`, `db`. Ajouter imports `useState, useEffect`, `createTemplate, deleteDiagram, getDiagrams`

- [ ] T13 : Migrer `src/pages/Templates.jsx`
  - Fichier : `src/pages/Templates.jsx` (modifier)
  - Action 1 : `defaultTemplates` (`useLiveQuery`) → `useState([]) + useEffect(() => { getTemplates(0).then(setDefaultTemplates) }, [])`
  - Action 2 : `customTemplates` (`useLiveQuery`) → `useState([]) + useEffect(() => { getTemplates(1).then(setCustomTemplates) }, [])`
  - Action 3 : `deleteTemplate(id)` → `deleteTemplate(templateId)` puis rafraîchir `customTemplates` (re-fetch ou filter local)
  - Notes : Supprimer `useLiveQuery`, `import { db }`. Attention : la fonction locale `deleteTemplate` prend `id` (SERIAL) dans l'original — utiliser `templateId` (UUID) à la place

- [ ] T14 : Migrer `src/utils/exportSavedData.js`
  - Fichier : `src/utils/exportSavedData.js` (modifier)
  - Action : Remplacer `db.diagrams.each(...)` par `getDiagrams()` (fetch complet avec toutes les données), et `db.templates.where({ custom: 1 }).each(...)` par `getTemplates(1)`. Adapter la logique de génération ZIP pour itérer sur les tableaux retournés par l'API.
  - Notes : L'API `GET /api/diagrams` retourne actuellement une liste partielle (sans `tables`, etc. pour la liste) — soit créer un endpoint séparé pour l'export, soit toujours retourner les données complètes. Recommandation : ajouter `?full=true` à `GET /api/diagrams` ou créer `GET /api/diagrams/export`.

- [ ] T15 : Nettoyer les dépendances frontend
  - Fichier : `package.json` (modifier)
  - Action : Supprimer `"dexie"` et `"dexie-react-hooks"` des `dependencies`
  - Fichier : `src/data/db.js` (supprimer ou vider)
  - Action : Supprimer le fichier (vérifier qu'aucun import ne subsiste — les T9 à T14 les ont tous retirés)
  - Commande : `npm install` pour mettre à jour `package-lock.json`

---

### Acceptance Criteria

**— Chemin nominal —**

- [ ] AC1 : Création d'un diagramme
  - **Given** un utilisateur sur `/editor/templates/blank` avec le backend démarré
  - **When** il ajoute une table et que l'autosave se déclenche
  - **Then** un enregistrement est créé dans la table `diagrams` en PostgreSQL, l'URL change vers `/editor/diagrams/:diagramId`, et `saveState` passe à `SAVED`

- [ ] AC2 : Chargement d'un diagramme existant
  - **Given** un diagramme avec `diagramId = X` en base PostgreSQL
  - **When** l'utilisateur navigue vers `/editor/diagrams/X`
  - **Then** toutes les données (tables, relations, notes, areas, enums, types, pan, zoom) sont chargées et affichées correctement dans le canvas

- [ ] AC3 : Mise à jour / autosave
  - **Given** un diagramme chargé dans l'éditeur
  - **When** l'utilisateur modifie une table (déclenchant l'autosave)
  - **Then** `PUT /api/diagrams/:diagramId` est appelé, `last_modified` est mis à jour en base, et `saveState` passe à `SAVED`

- [ ] AC4 : Liste des diagrammes (modal Open)
  - **Given** plusieurs diagrammes en base
  - **When** l'utilisateur ouvre le modal "Open"
  - **Then** la liste affiche tous les diagrammes avec nom, date de modification et type de DB, triés par `last_modified DESC`

- [ ] AC5 : Templates par défaut
  - **Given** la base PostgreSQL initialisée avec le seed (6 templates)
  - **When** l'utilisateur ouvre la page `/templates` ou le modal "New"
  - **Then** les 6 templates par défaut sont affichés correctement avec leurs données

- [ ] AC6 : Sauvegarde en tant que template
  - **Given** un diagramme ouvert dans l'éditeur
  - **When** l'utilisateur clique sur "Save as template"
  - **Then** un template est créé en base avec `custom = 1` et apparaît dans "Your templates"

- [ ] AC7 : Suppression d'un diagramme
  - **Given** un diagramme existant ouvert dans l'éditeur
  - **When** l'utilisateur le supprime via le menu
  - **Then** le diagramme est supprimé de la base et l'éditeur redirige vers le template blank

- [ ] AC8 : Suppression d'un template custom
  - **Given** un template custom existant visible dans "Your templates"
  - **When** l'utilisateur clique sur "Delete"
  - **Then** le template est supprimé de la base et disparaît de la liste

- [ ] AC9 : Export ZIP
  - **Given** des diagrammes et templates customs en base
  - **When** l'utilisateur déclenche l'export
  - **Then** le ZIP généré contient les fichiers JSON corrects avec toutes les données de chaque diagramme et template custom

- [ ] AC10 : Compatibilité Gist (partage)
  - **Given** un lien partagé `?shareId=ABC`
  - **When** l'utilisateur y accède
  - **Then** le diagramme est chargé depuis le Gist (comportement inchangé), sans erreur liée à la suppression de Dexie

**— Gestion d'erreurs —**

- [ ] AC11 : Backend inaccessible au chargement
  - **Given** le backend est arrêté
  - **When** l'utilisateur ouvre l'éditeur
  - **Then** `saveState` passe à `FAILED_TO_LOAD` (comportement existant conservé) et aucune erreur JS non gérée n'est levée

- [ ] AC12 : Erreur lors de la sauvegarde
  - **Given** le backend retourne une erreur 500 sur `PUT /api/diagrams/:diagramId`
  - **When** l'autosave se déclenche
  - **Then** `saveState` passe à `ERROR` ou `FAILED_TO_LOAD` et l'utilisateur voit un indicateur d'erreur

- [ ] AC13 : Aucun diagramme en base
  - **Given** la base est vide (aucun diagramme)
  - **When** l'utilisateur ouvre l'éditeur sans paramètre d'URL
  - **Then** le modal de sélection de type de DB s'affiche (comportement identique à avant)

---

## Additional Context

### Dependencies

**Backend — nouveau `/server/package.json` :**
```json
{
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "pg": "^8.11.0"
  }
}
```

**Frontend — retirer de `package.json` :**
- `dexie: ^3.2.4`
- `dexie-react-hooks: ^1.1.7`

**Infrastructure prérequise :**
- Instance PostgreSQL accessible avec une base `drawdb` créée
- Fichier `/server/.env` avec `DATABASE_URL` valide avant démarrage

### Testing Strategy

Aucun framework de test n'est configuré dans le projet. Validation manuelle dans l'ordre des ACs :

1. Démarrer le backend : `cd server && npm install && node index.js`
2. Vérifier les logs de migration et seed au démarrage
3. Démarrer le frontend : `npm run dev`
4. Valider AC1 → AC10 dans l'interface
5. Stopper le backend et valider AC11 → AC13
6. Inspecter la base PostgreSQL avec `psql` ou un client GUI (ex: TablePlus) pour confirmer les données après chaque opération

### Notes

- **Ordre des routes Express (T5)** : déclarer `GET /api/diagrams/latest` **avant** `GET /api/diagrams/:diagramId`. Express correspondra "latest" au paramètre `:diagramId` sinon.
- **Export ZIP (T14)** : `GET /api/diagrams` retourne une liste partielle pour la performance. Pour l'export, soit retourner les données complètes avec `?full=true`, soit faire des appels individuels `GET /api/diagrams/:id` pour chaque diagramme. À décider lors de l'implémentation.
- **Inconsistance `references` / `relationships`** : le frontend utilise `references` dans les diagrams et `relationships` dans les templates. Ne pas normaliser — reproduire à l'identique pour éviter tout refactoring.
- **Phase 2 (auth)** : quand l'auth sera ajoutée, il suffira de renseigner `user_id` dans les INSERT et d'ajouter `WHERE user_id = $userId` dans les SELECT. Le schéma est prêt.
- **`templateId` stable dans le seed** : utiliser des UUID fixes (hardcodés dans `templates.json`) pour les 6 templates par défaut afin que les URLs `/editor/templates/:id` restent stables entre redémarrages.
