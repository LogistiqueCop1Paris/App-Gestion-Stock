# Gestion des stocks

Application de gestion de stocks multi-lieux pour l'association : produits par catégorie,
ajout/retrait de quantité, transferts entre stocks, sorties de stock pour les distributions
(avec enregistrement du reste), historique complet des modifications avec auteur (Nom Prénom)
et horodatage.

**Stack** : React + Vite (frontend) + Supabase (base Postgres, authentification, API).

## Où sont stockées les données ?

- **Les données de l'appli** (stocks, produits, quantités, historique) vivent uniquement dans
  la base Postgres hébergée par **Supabase**, dans le cloud. Elles ne sont jamais stockées sur
  un PC particulier — que tu lances l'appli en local (`npm run dev`) ou depuis l'URL publique
  une fois déployée, tout le monde lit/écrit dans la même base. En cas de problème avec un PC
  (perte, panne), aucune donnée n'est perdue : il suffit de se reconnecter à
  [supabase.com](https://supabase.com) avec le compte du projet.
- **Le code source** (ce dépôt) n'existe que sur la machine où il a été créé tant qu'il n'est
  pas poussé sur un hébergeur de code comme GitHub. Voir l'étape 3 ci-dessous : pousser le code
  sur GitHub le sauvegarde en ligne et est de toute façon nécessaire pour déployer l'appli.
- Le fichier `.env` (créé à l'étape 2) reste local à chaque machine de développement — il n'est
  jamais poussé sur GitHub (`.gitignore`) et n'est pas nécessaire pour l'appli déployée, qui a
  ses propres variables d'environnement configurées sur Vercel/Netlify (étape 3).

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com), crée un compte gratuit, puis "New project".
2. Choisis un nom, un mot de passe de base de données (à garder de côté), une région proche de tes utilisateurs.
3. Une fois le projet créé, va dans **SQL Editor** (menu de gauche) > **New query**.
4. Colle tout le contenu du fichier [`supabase/schema.sql`](supabase/schema.sql) de ce dépôt, puis clique **Run**.
   Ça crée toutes les tables (stocks, catégories, produits, mouvements, distributions, profils),
   les règles de sécurité (RLS), et les fonctions qui gèrent les ajustements de quantité, les
   transferts et les distributions de façon atomique.
5. Va dans **Project Settings > Data API** (ou **API** selon la version de l'interface) : note
   l'**URL** du projet et la clé **anon public**.

> **Mise à jour du schéma** : ce fichier est conçu pour être ré-exécuté sans risque. Si le
> schéma évolue (nouvelle fonctionnalité, nouvelle colonne), il suffit de recoller tout le
> contenu de `supabase/schema.sql` dans le SQL Editor et de relancer **Run** — les tables et
> données existantes ne sont jamais supprimées, seuls les éléments manquants sont ajoutés/mis à jour.

### Rôles

Trois rôles existent, avec des pouvoirs strictement définis (contrôlés à la fois côté
interface et côté base via les policies RLS et les fonctions SQL, pas seulement en apparence) :

| Rôle | Pouvoirs |
|---|---|
| **Respo log** | Tout faire et tout voir : changer le rôle de n'importe quel compte, **éditer nom/prénom/email et le mot de passe d'un compte**, **supprimer un compte**, **supprimer un stock** (avec tout ce qu'il contient), **annuler un mouvement** depuis l'historique, renommer stocks/catégories/produits. |
| **Respo autres** | Tout faire sauf transférer un produit entre stocks ou supprimer un stock. Accès à l'historique. Peut renommer stocks/catégories/produits, et supprimer des catégories. |
| **VSC** | Uniquement faire des sorties de stock pour une distribution, et enregistrer le reste ensuite. Accès à l'historique en lecture. |

Tout nouveau compte est créé en `vsc` par défaut (le rôle le plus restreint). Un compte
**Respo log** peut ensuite changer le rôle de n'importe qui depuis l'onglet **Utilisateurs**
de l'appli (visible uniquement pour ce rôle), où la description de chaque rôle s'affiche à
côté du menu au moment du choix.

### Donner le rôle Respo log au premier compte

Il n'existe pas encore d'interface pour le tout premier Respo log (il en faut un pour pouvoir
en désigner d'autres) : crée d'abord ton compte depuis la page d'inscription, puis dans
**SQL Editor**, exécute (en remplaçant l'email) :

```sql
update public.profiles
set role = 'respo_log'
where id = (select id from auth.users where email = 'ton-email@exemple.com');
```

> **Mise à jour depuis l'ancien système admin/bénévole** : en ré-exécutant `schema.sql`, les
> comptes `admin` existants deviennent automatiquement `respo_log` et les comptes `benevole`
> deviennent `vsc` (le rôle le plus restreint, par prudence). Va ensuite dans l'onglet
> Utilisateurs pour repasser en `respo_autres` les comptes qui géraient déjà les stocks au
> quotidien.

### Activer les actions admin sur les comptes (Edge Functions)

Certaines actions sur les comptes (les supprimer, changer leur mot de passe ou leur email) sont
sensibles et ne peuvent être faites qu'avec une clé secrète (`service_role`) — cette clé ne doit
**jamais** être mise dans le frontend (`.env`), donc chacune de ces actions passe par une petite
fonction serveur ("Edge Function"). Chacune vérifie elle-même que l'appelant est bien Respo log
avant d'agir.

Trois fonctions à déployer une seule fois chacune, directement depuis le dashboard Supabase
(pas besoin d'installer d'outil en local — voir plus bas si tu préfères la CLI) :

| Fonction | Fichier | Utilisée par |
|---|---|---|
| `delete-user` | [`supabase/functions/delete-user/index.ts`](supabase/functions/delete-user/index.ts) | Bouton "Supprimer" (Utilisateurs) |
| `admin-set-password` | [`supabase/functions/admin-set-password/index.ts`](supabase/functions/admin-set-password/index.ts) | Bouton "🔑 Mot de passe" (Utilisateurs) |
| `admin-update-email` | [`supabase/functions/admin-update-email/index.ts`](supabase/functions/admin-update-email/index.ts) | Bouton "✎ Éditer" (Utilisateurs), champ email |

Pour chacune :

1. Va dans **Edge Functions** (menu de gauche) > **Create a function** (ou **Deploy a new function**).
2. Nomme-la exactement comme dans le tableau ci-dessus (respecte la casse et les tirets).
3. Colle le contenu du fichier correspondant dans l'éditeur, puis **Deploy**.

Supabase fournit automatiquement `SUPABASE_URL`, `SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY` à toute Edge Function : rien à configurer en plus.

> Alternative CLI (utile seulement si tu comptes retoucher ces fonctions souvent) :
> `supabase login`, puis `supabase link --project-ref <ton-id-projet>`, puis
> `supabase functions deploy` (déploie les trois d'un coup depuis `supabase/functions/`).

### Emails de confirmation / réinitialisation — ou s'en passer entièrement

⚠️ **Le service d'email intégré à Supabase (utilisé par défaut, sans configuration) n'envoie
qu'aux adresses membres de ton organisation Supabase** (les collaborateurs du projet sur
supabase.com, pas les comptes de l'appli) — toute autre adresse échoue silencieusement, aucun
email n'arrive. Il est aussi limité à 2 emails/heure. C'est la cause la plus probable si un
bénévole ne reçoit ni email de confirmation à l'inscription ni email de réinitialisation de mot
de passe.

Deux options pour une petite asso :

**Option A — se passer d'email (recommandé, le plus simple)**

C'est cohérent avec le fonctionnement de l'appli : les comptes sont gérés en interne, pas du
grand public.

1. Dans Supabase, **Authentication > Providers > Email**, désactive **"Confirm email"** — un
   compte créé (inscription ou création directe) devient utilisable immédiatement, sans email.
2. Déploie l'Edge Function `admin-set-password` (même procédure que `delete-user` plus haut :
   **Edge Functions > Create a function**, nomme-la exactement `admin-set-password`, colle le
   contenu de
   [`supabase/functions/admin-set-password/index.ts`](supabase/functions/admin-set-password/index.ts),
   **Deploy**). Elle permet à un Respo log de définir directement le mot de passe de n'importe
   quel compte depuis l'onglet **Utilisateurs** de l'appli (bouton "🔑 Mot de passe"), sans
   passer par un email — utile aussi bien pour débloquer un compte que pour un mot de passe
   oublié.
3. Une fois ça en place, tu peux laisser la page "Mot de passe oublié" de côté (elle continuera
   à échouer silencieusement sans SMTP configuré, ce qui est sans conséquence si personne ne
   l'utilise) et retirer/ignorer le lien "Mot de passe oublié ?" sur l'écran de connexion si tu
   veux éviter la confusion.

**Option B — configurer un vrai SMTP**, si tu préfères garder le flux email standard (email de
confirmation à l'inscription, "Mot de passe oublié" fonctionnel). Dans
**Project Settings > Authentication > SMTP Settings** :

- **Gmail** (gratuit, 500 emails/jour) — nécessite la validation en 2 étapes sur le compte
  Gmail : active-la, puis crée un "mot de passe d'application" sur
  [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). Renseigne
  Host `smtp.gmail.com`, Port `587`, Username = l'adresse Gmail, Password = le mot de passe
  d'application (pas le vrai mot de passe Gmail), Sender email = la même adresse.
- Si la validation en 2 étapes n'est pas activable sur le compte (compte géré par un
  administrateur, restriction organisationnelle...), utilise plutôt un service dédié comme
  **Brevo** (gratuit, 300 emails/jour, pas de 2FA requise) : crée un compte sur
  [app.brevo.com](https://app.brevo.com), récupère les identifiants SMTP dans
  **Settings > SMTP & API > SMTP**, et renseigne-les côté Supabase de la même façon.

Si tu gardes le flux email (Option B), pense aussi à autoriser les liens de réinitialisation :

1. Va dans **Authentication > URL Configuration**.
2. Ajoute dans **Redirect URLs** : `http://localhost:5173/reinitialiser-mot-de-passe` (pour tes
   tests en local) et, une fois déployée, l'URL publique équivalente
   (ex. `https://gestion-stock-cop1.vercel.app/reinitialiser-mot-de-passe`).

Sans ça, le lien reçu par email renverra une erreur au clic.

### Désactiver les inscriptions publiques (recommandé pour une asso)

Par défaut l'appli permet à n'importe qui de créer un compte depuis la page d'inscription.
Pour une asso, il vaut mieux limiter ça une fois les comptes des bénévoles créés :
va dans **Authentication > Providers > Email** et désactive "Allow new users to sign up",
ou crée directement les comptes depuis **Authentication > Users > Add user** (Supabase enverra
un email d'invitation). Le profil (Nom/Prénom) devra alors être renseigné manuellement dans la
table `profiles`, ou tu peux laisser l'inscription ouverte le temps d'onboarder tout le monde
puis la désactiver ensuite.

## 2. Configurer le frontend en local

```bash
cp .env.example .env
```

Remplis `.env` avec l'URL et la clé "anon" récupérées à l'étape précédente (l'URL est juste
`https://xxxx.supabase.co`, sans rien après — ne pas coller l'URL de l'API REST) :

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Puis installe les dépendances et lance le serveur de dev :

```bash
npm install
npm run dev
```

L'appli est disponible sur `http://localhost:5173`. Crée un premier compte depuis la page
d'inscription (Nom, Prénom, email, mot de passe), puis crée ton premier stock.

⚠️ Si tu modifies `.env` alors que `npm run dev` tourne déjà, redémarre le serveur
(`Ctrl+C` puis `npm run dev`) : Vite ne recharge pas les variables d'environnement à chaud.

## 3. Sauvegarder le code sur GitHub et déployer

### 3a. Pousser le code sur GitHub

1. Crée un compte sur [github.com](https://github.com) si tu n'en as pas déjà un.
2. Crée un nouveau dépôt vide (bouton "New repository"), sans README/gitignore (on a déjà les nôtres).
3. Dans le dossier du projet, initialise Git et pousse le code :

```bash
git init
git add .
git commit -m "Premier commit"
git branch -M main
git remote add origin https://github.com/<ton-compte>/<nom-du-depot>.git
git push -u origin main
```

Le code est alors sauvegardé sur GitHub, indépendamment de ta machine — récupérable depuis
n'importe où avec `git clone`.

### 3b. Déployer sur Vercel (gratuit) — pas à pas détaillé

Si tu as déjà créé le projet sur Vercel en important le dépôt GitHub, reprends à l'étape 2.

1. **Importer le projet** (si pas encore fait) : sur [vercel.com](https://vercel.com), une fois
   connecté avec ton compte GitHub, clique **Add New…** (en haut à droite) **> Project**. Ton
   dépôt GitHub apparaît dans la liste — clique **Import** à côté de son nom. Vercel détecte
   automatiquement que c'est un projet Vite (Framework Preset : "Vite") ; pas besoin de changer
   Build Command (`npm run build`) ni Output Directory (`dist`), laisse les valeurs par défaut.

2. **Ajouter les variables d'environnement** — c'est l'étape qui manque le plus souvent :
   - Si tu es encore sur l'écran d'import (avant de cliquer "Deploy") : déroule la section
     **Environment Variables**, ajoute une ligne avec `Name = VITE_SUPABASE_URL` et
     `Value = https://xxxx.supabase.co`, puis une deuxième avec `Name = VITE_SUPABASE_ANON_KEY`
     et la clé correspondante (les mêmes valeurs que dans ton `.env` local).
   - Si le projet est **déjà créé** (ton cas) : va sur la page du projet > onglet **Settings**
     (en haut) > **Environment Variables** dans le menu de gauche. Ajoute les deux variables
     une par une (Name + Value), coche les 3 environnements proposés (Production, Preview,
     Development) sauf raison particulière de ne pas le faire, puis **Save**.

3. **Redéployer** — ⚠️ point important : ajouter une variable d'environnement à un projet déjà
   créé ne redéploie pas automatiquement. Va dans l'onglet **Deployments**, ouvre le menu **⋯**
   (trois points) à côté du déploiement le plus récent, puis **Redeploy**. Sans ça, l'appli
   déployée ne verra pas les nouvelles variables et l'écran restera bloqué sur une erreur de
   connexion à Supabase.

4. **Récupérer l'URL publique** — en haut de la page du projet, sous le nom du projet, l'URL
   ressemble à `nom-du-projet.vercel.app`. Elle est aussi cliquable directement depuis la carte
   du déploiement "Production" dans l'onglet Deployments.

5. **Mettre à jour Supabase avec cette URL** : si tu as activé la réinitialisation de mot de
   passe (voir plus haut), retourne dans Supabase > **Authentication > URL Configuration** et
   ajoute `https://nom-du-projet.vercel.app/reinitialiser-mot-de-passe` dans **Redirect URLs** —
   sinon les liens de réinitialisation ne fonctionneront que sur `localhost`.

6. **Vérifier que ça marche** : ouvre l'URL, essaie de te connecter. Si tu vois une page blanche
   ou une erreur, va dans **Deployments** > clique sur le déploiement > onglet **Build Logs**
   (erreur de build) ou ouvre la console du navigateur avec F12 (erreur au chargement, souvent
   liée aux variables d'environnement mal renseignées).

Chaque futur `git push` sur la branche `main` redéploie automatiquement la nouvelle version —
c'est le seul cas où le redéploiement est automatique ; changer une variable d'environnement ne
l'est pas (retour à l'étape 3).

> Netlify fonctionne sur le même principe (import du dépôt, build command `npm run build`,
> output `dist`, variables d'environnement dans **Site configuration > Environment variables**,
> puis **Trigger deploy** après ajout de variables) si tu préfères cette plateforme.

## Structure du projet

```
supabase/schema.sql              Schéma complet de la base (tables, RLS, fonctions métier)
supabase/functions/delete-user         Edge Function : suppression définitive d'un compte
supabase/functions/admin-set-password  Edge Function : définir un mot de passe sans email
supabase/functions/admin-update-email  Edge Function : changer l'email de connexion d'un compte
src/lib/supabaseClient.ts        Client Supabase (lit les variables d'env)
src/lib/sources.ts                Résolution/création d'une source (menu "existant ou nouveau")
src/auth/AuthContext.tsx         Session + profil utilisateur courant
src/pages/
  LoginPage.tsx                  Connexion
  SignupPage.tsx                 Inscription (Nom, Prénom, email, mot de passe)
  ForgotPasswordPage.tsx         Demande d'un email de réinitialisation
  ResetPasswordPage.tsx          Choix d'un nouveau mot de passe (via le lien reçu par email)
  StocksListPage.tsx             Liste des stocks (lieux), création d'un nouveau stock
  StockPage.tsx                  Vue d'un stock : catégories, produits, recherche, actions, renommage, suppression
  HistoryPage.tsx                Historique de tous les mouvements, filtrable, annulation
  UsersPage.tsx                  Édition, rôles, mots de passe et suppression des comptes (Respo log uniquement)
  StatsPage.tsx                  Fréquentation des distributions (paniers/mois/lieu), graphique + tableau
src/roles.ts                     Libellés, descriptions et helpers de pouvoirs par rôle
src/components/
  Navbar.tsx                     Barre de navigation + utilisateur connecté
  ProtectedRoute.tsx             Redirige vers /connexion si non connecté
  AdminRoute.tsx                 Bloque l'accès si le compte n'est pas Respo log
  AddProductModal.tsx            Ajout d'un produit (nouveau ou incrément d'un existant)
  AdjustQuantityModal.tsx        Ajout / retrait ponctuel de quantité
  TransferModal.tsx              Transfert d'un produit vers un autre stock
  DistributionModal.tsx          Sortie de stock pour une distribution (multi-produits)
  DistributionReturnModal.tsx    Enregistrement du reste après une distribution
  RenameModal.tsx                Renommer un stock, une catégorie ou un produit
  SetPasswordModal.tsx           Définir le mot de passe d'un compte sans email (Respo log)
  EditProfileModal.tsx           Éditer nom/prénom/email d'un compte (Respo log)
  Modal.tsx                      Fenêtre modale générique
```

## Comment ça fonctionne

- **Ajout/retrait de quantité** et **création de produit** passent par des fonctions SQL
  (`ajuster_quantite`, `journaliser_creation_produit`) qui mettent à jour la quantité et
  écrivent la ligne d'historique dans la même transaction : impossible d'avoir une quantité
  qui change sans trace dans l'historique.
- **Ajouter un produit qui existe déjà** : dans la fenêtre "Ajouter un produit", si le produit
  choisi existe déjà dans la catégorie (liste déroulante "Produit existant", même principe que
  le choix de catégorie), la quantité saisie est **ajoutée** à la quantité actuelle au lieu de
  créer un doublon.
- **Date de péremption** : champ optionnel à la création d'un produit (colonne `date_peremption`,
  nullable). Affichée dans le tableau de chaque stock.
- **Transferts** passent par la fonction `transferer_produit`, qui décrémente le produit source,
  crée ou incrémente le produit correspondant dans le stock destination, et journalise les deux
  côtés du mouvement (sortie + entrée) avec un `transfert_id` commun.
- **Distributions** (sortie pour distribuer, puis reste) :
  1. **Sortie** — bouton "Sortie distribution" sur la page d'un stock : on saisit la quantité
     sortie pour chaque produit concerné (plusieurs produits en une seule fois). La fonction
     `creer_distribution` décrémente chaque produit, crée une ligne de distribution par produit,
     journalise un mouvement `distribution_sortie` par produit, et ouvre une **distribution en
     cours** horodatée avec le nom de la personne qui sort le stock.
  2. **Reste** — tant qu'une distribution n'est pas clôturée, elle apparaît en haut de la page du
     stock avec un bouton "Reste de distrib". On y saisit ce qu'il reste pour chaque produit
     sorti ; la fonction `cloturer_distribution` **recrédite** ce reste dans le stock, journalise
     un mouvement `distribution_retour` par produit (avec son propre horodatage et son auteur,
     potentiellement différent de la personne qui a fait la sortie), et clôture la distribution.
     Tout produit dont le reste n'est pas renseigné est considéré comme entièrement distribué.
- **Sources** : liste gérée (table `sources`), pas limitée à 3 valeurs figées. Dans les
  fenêtres d'ajout de quantité, on choisit une source existante ou on en tape une nouvelle
  (même principe que les catégories) — elle est alors ajoutée à la liste pour la prochaine fois.
- **Renommer** un stock, une catégorie ou un produit se fait via le bouton "✎ Renommer" à côté
  de son nom (Respo log et Respo autres uniquement). Un simple `UPDATE` du nom : comme
  l'historique garde une copie du nom au moment de chaque mouvement passé, les anciennes lignes
  d'historique restent lisibles avec l'ancien nom.
- **Annuler un mouvement** (Respo log uniquement, depuis l'Historique) : ne supprime jamais la
  ligne d'origine — elle est marquée "annulé" et une nouvelle ligne compensatoire est ajoutée
  (ex. annuler un ajout de 5 crée un retrait de 5), pour que l'audit trail reste complet et
  jamais réécrit. Les transferts s'annulent des deux côtés à la fois. Si le mouvement annulé
  avait vidé (et donc supprimé) un produit, `annuler_mouvement` le recrée d'abord à l'identique
  avant de compenser l'effet. Les mouvements de distribution ne sont pas annulables pour
  l'instant (la fonction le refuse explicitement) — leur comptabilité sortie/reste est gérée
  séparément par `creer_distribution`/`cloturer_distribution`, qui gèrent elles-mêmes la
  restauration d'un produit vidé par une sortie quand du reste est enregistré dessus.
- **Concurrence sorties/reste/annulation** : chaque fonction verrouille (`for update`) la ligne
  qu'elle s'apprête à modifier avant de vérifier son état (ex. `annuler_mouvement` verrouille le
  mouvement et, pour un transfert, son mouvement jumeau ; `cloturer_distribution` verrouille la
  distribution avant de vérifier si elle est déjà clôturée). Deux actions concurrentes sur la
  même ligne (double-clic, deux personnes en même temps) s'exécutent donc l'une après l'autre au
  lieu de se marcher dessus. Le seul cas où une annulation peut échouer est logique, pas une
  corruption : si le produit n'a plus assez de quantité pour être décrémenté (ex. une
  distribution a pris le stock entre-temps), la fonction refuse avec un message clair plutôt que
  de passer en négatif.
- **Supprimer un compte**, **définir un mot de passe sans email** et **changer l'email de
  connexion d'un compte** (Respo log uniquement, boutons sur l'onglet Utilisateurs) passent
  chacun par leur propre Edge Function (`delete-user`, `admin-set-password`,
  `admin-update-email`) — même principe : clé `service_role`, vérification du rôle de
  l'appelant côté serveur. Voir "Activer les actions admin sur les comptes" plus haut pour le
  déploiement, obligatoire une fois chacune. Changer l'email met à jour à la fois le compte
  Supabase Auth (utilisé pour se connecter) et `profiles.email` (l'affichage) — sans déclencher
  de flux de confirmation, cohérent avec le fonctionnement "sans email" de l'appli.
- **Supprimer un stock** (Respo log uniquement, contrairement au renommage et à la suppression
  de catégorie qui restent ouverts à Respo autres) affiche d'abord une confirmation détaillant
  concrètement ce qui sera perdu (nombre de catégories, de produits, quantité totale) avant de
  supprimer — les catégories et produits du stock sont supprimés en cascade côté base, cette
  action est irréversible et ne passe pas par la logique de restauration utilisée pour les
  quantités à 0 (qui, elle, ne s'applique qu'aux mouvements individuels, pas à la suppression
  d'un stock entier).
- **Statistiques de fréquentation** (onglet Statistiques, ouvert à tous les rôles — lecture
  seule) : à chaque clôture de distribution (`cloturer_distribution`), le nombre de paniers
  distribués est **obligatoire** — imposé à la fois côté formulaire et par une contrainte SQL
  (`distributions_paniers_si_terminee` : une distribution `terminee` doit avoir
  `nombre_paniers` renseigné). `StatsPage.tsx` regroupe ces chiffres par mois et par stock pour
  une année choisie, et affiche un graphique en lignes (une couleur par lieu) plus le tableau de
  données complet en dessous. Les couleurs du graphique viennent de la palette catégorielle
  validée par le skill dataviz (contraste et daltonisme vérifiés par
  `scripts/validate_palette.js`) plutôt que du corail de l'appli, pour rester distinctes du
  reste de l'interface.
- **Commentaires** : un champ optionnel est disponible à chaque ajout/retrait/création de
  produit, sortie de distribution et clôture (reste). Il est stocké sur la ligne d'historique
  (`mouvements.commentaire`) et, pour les distributions, aussi sur `distributions.commentaire_sortie`
  / `commentaire_retour` (affiché directement sur la carte "Distribution en cours"). Un VSC peut
  s'en servir pour signaler un problème ou un événement pendant une distribution — c'est
  d'ailleurs la seule action où il peut écrire du texte libre.
- **Un produit qui tombe à 0 est supprimé** du stock (plus affiché nulle part), que ce soit par
  un retrait, un transfert de la totalité, ou une sortie de distribution qui prend le dernier
  reste. Avant de le supprimer, `ajuster_quantite`/`transferer_produit`/`creer_distribution`
  capturent sur la ligne d'historique (ou la ligne de distribution) tout ce qu'il faut pour le
  recréer à l'identique : nom, quantité, catégorie, source, date de péremption (colonnes
  `restaure_categorie_id`/`restaure_date_peremption`/`restaure_source`). **S'il est restitué**
  — en annulant depuis l'Historique le retrait/transfert qui l'a vidé, ou en enregistrant un
  reste sur une distribution qui l'avait pris en totalité — il réapparaît avec exactement les
  mêmes attributs. Les fenêtres d'ajustement de quantité, de transfert et de sortie distribution
  affichent un avertissement quand la quantité saisie viderait le produit.
- **Nom/Prénom de l'auteur** : le trigger `format_nom_prenom` met automatiquement le nom en
  MAJUSCULES et le prénom avec une majuscule initiale à chaque écriture du profil — impossible
  de se tromper de format, et chaque mouvement enregistre l'auteur déduit de la session connectée
  (pas de champ libre à remplir).
- **Rôles (`respo_log` / `respo_autres` / `vsc`)** : voir le tableau dans "Rôles" plus haut.
  L'application des restrictions est faite à deux niveaux : l'interface cache les actions non
  autorisées (ex. le VSC ne voit pas les boutons Ajouter/Retirer/Transférer), et surtout la
  base les refuse quoi qu'il arrive — la fonction `role_utilisateur()` est utilisée à la fois
  dans les policies RLS (création/suppression de stocks, catégories, produits, changement de
  rôle) et à l'intérieur des fonctions `ajuster_quantite`, `transferer_produit` et
  `journaliser_creation_produit` (ces fonctions contournant RLS sur les tables qu'elles
  écrivent, le contrôle de rôle doit être fait explicitement dans leur code).
- **Email affiché sur l'onglet Utilisateurs** : `profiles.email` est une copie de l'email
  Supabase Auth (pas accessible directement au client autrement), renseignée automatiquement à
  l'inscription par `handle_new_user()`. Pour les comptes créés avant l'ajout de cette colonne,
  `schema.sql` la resynchronise avec `auth.users` à chaque exécution.

## Design

- **Couleurs** : `#DF5F4D` (accent), `#FDF6E9` (fond), `#FFFFFF` (surfaces/cartes) — définies
  comme variables CSS dans [`src/index.css`](src/index.css) (`--accent`, `--bg`, `--surface`).
- **Polices** : [Raleway](https://fonts.google.com/specimen/Raleway) pour les titres, boutons et
  la marque ; [Hanken Grotesk](https://fonts.google.com/specimen/Hanken+Grotesk) pour le texte
  courant. Chargées via Google Fonts dans [`index.html`](index.html).
- **Responsive** : mise en page pensée pour le mobile (navigation qui s'empile, boutons pleine
  largeur, tableaux qui défilent horizontalement plutôt que de casser la page) via des media
  queries dans [`src/index.css`](src/index.css).
- **Historique** : présenté comme une frise de cartes groupées par jour ("Aujourd'hui", "Hier",
  puis date complète) plutôt qu'un tableau dense — badge `+`/`−` coloré selon le sens du
  mouvement, type en pastille, commentaire mis en évidence, bouton "Annuler" aligné à droite
  (voir [`src/pages/HistoryPage.tsx`](src/pages/HistoryPage.tsx) et les classes `.history-*`
  dans `index.css`).
- **Logo** : celui de Solidarités Étudiantes CO-P1, déposé dans
  [`src/assets/Logo Cop1 Brique.png`](src/assets/) (fichier source, non utilisé directement).
  Deux versions dérivées en sont générées pour le web : `src/assets/logo.png` (recadré à
  640px de large, utilisé dans [`Navbar.tsx`](src/components/Navbar.tsx) à côté de "Gestion des
  stocks") et `public/favicon.png` (recadré sur la seule poignée de main, en carré 256×256,
  référencé dans [`index.html`](index.html)). Pour changer de logo plus tard, dépose le nouveau
  fichier au même endroit et dis-le-moi — je regénère les deux versions.

## Tester sur mobile

**Avec Firefox (bureau), en simulant un téléphone :**

1. Ouvre l'appli dans Firefox (`npm run dev` puis `http://localhost:5173`, ou l'URL déployée).
2. `Ctrl+Shift+M` (Windows/Linux) ou `Cmd+Option+M` (Mac) pour ouvrir le **mode Réactif**
   (Responsive Design Mode).
3. En haut de la barre qui apparaît, choisis un modèle d'appareil (iPhone, Pixel…) ou une
   largeur personnalisée. Tu peux aussi simuler une connexion lente et le tactile.
4. `Ctrl+Shift+M` à nouveau pour quitter ce mode.

**Sur un vrai téléphone, en développement local :**

1. Assure-toi que le téléphone est connecté au **même Wi-Fi** que ton PC.
2. Lance le serveur en l'exposant sur le réseau local :

```bash
npm run dev -- --host
```

3. Le terminal affiche une URL du type `http://192.168.x.x:5173` ("Network") — ouvre-la
   depuis le navigateur du téléphone.

## Pistes d'amélioration (non implémentées)

- Alertes de stock bas (seuil par produit + notification email via une Edge Function Supabase).
- Alertes de péremption proche (la date existe déjà en base, il manque le rappel automatique).
- Scan de codes-barres/QR codes pour ajouter/retirer rapidement depuis un mobile.
- Export CSV/PDF d'un stock ou de l'historique.
- Import CSV pour peupler un stock en une fois.
- Progressive Web App (installable sur mobile, utilisable partiellement hors ligne).
- Édition du nom/prénom de son propre profil (aucune interface pour l'instant — modifiable
  directement dans la table `profiles` via Supabase si besoin).
- Photos de produits (stockage via Supabase Storage).
